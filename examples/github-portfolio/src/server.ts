#!/usr/bin/env node
/**
 * Serves the generated minisite (output/portfolio.html + assets) and answers "ask about my work" queries
 * at POST /api/ask — the RAG piece: embed the question, find the closest project summaries in the search
 * index built by `buildSearchIndex` (see searchIndex.ts), then ask Gemini to answer using only that
 * context. This is what makes the search box work; `npm start` (index.ts) only generates static files.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { embedText, cosineSimilarity } from './embeddings.js';
import { SearchIndexEntry } from './searchIndex.js';

const PORT = Number(process.env.PORT) || 3000;
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.resolve(process.cwd(), 'output');
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const API_KEY = process.env.GEMINI_API_KEY;
const TOP_K = 3;
const MAX_QUESTION_LENGTH = 300;

const MESSAGES = {
  en: {
    notConfigured: 'Search is not configured — GEMINI_API_KEY is not set on the server.',
    dailyLimit: 'This search box has hit its shared daily question limit — please try again tomorrow.',
    hourlyLimit: 'Too many questions from this address in the last hour — please try again later.',
    invalidBody: 'Invalid JSON body',
    questionRequired: 'question is required',
    questionTooLong: (max: number) => `question is too long (max ${max} characters)`,
    indexNotBuilt:
      "The search index hasn't been built yet — re-run the portfolio generator with GEMINI_API_KEY set to enable this.",
    answerLanguageInstruction: 'Answer in 2-4 sentences, in English.',
  },
  ja: {
    notConfigured: '検索は設定されていません — サーバーに GEMINI_API_KEY が設定されていません。',
    dailyLimit: 'この検索ボックスは1日あたりの共有質問上限に達しました — 明日もう一度お試しください。',
    hourlyLimit: 'このアドレスからの質問が直近1時間で多すぎます — しばらくしてからもう一度お試しください。',
    invalidBody: '不正なJSON形式です',
    questionRequired: '質問を入力してください',
    questionTooLong: (max: number) => `質問が長すぎます (最大${max}文字)`,
    indexNotBuilt: '検索インデックスがまだ構築されていません — GEMINI_API_KEY を設定してポートフォリオ生成スクリプトを再実行してください。',
    answerLanguageInstruction: '自然で丁寧な日本語で、2〜4文で回答してください。',
  },
} as const;

type Lang = keyof typeof MESSAGES;

function resolveLang(value: unknown): Lang {
  return value === 'ja' ? 'ja' : 'en';
}

// /api/ask holds the Gemini API key server-side and calls it on every request — if this server is put on
// the public internet (not just localhost), anyone who finds the URL can otherwise spam it and run up your
// Gemini bill/quota. This is a real, minimal defense-in-depth measure, not a substitute for restricting the
// key itself in Google's console — see the "Cost & abuse protection" section in README.md.
const RATE_LIMIT_PER_HOUR = Number(process.env.SEARCH_RATE_LIMIT_PER_HOUR) || 10; // per visitor IP
const DAILY_CAP = Number(process.env.SEARCH_DAILY_CAP) || 100; // across every visitor combined
const HOUR_MS = 60 * 60 * 1000;

const requestTimestampsByIp = new Map<string, number[]>();
let dailyCount = 0;
let dailyResetAt = nextMidnight();

function nextMidnight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Returns a rejection reason code if this request should be refused, or null if it's allowed (and records it). */
function checkRateLimit(ip: string): 'daily' | 'hourly' | null {
  const now = Date.now();
  if (now >= dailyResetAt) {
    dailyCount = 0;
    dailyResetAt = nextMidnight();
  }
  if (dailyCount >= DAILY_CAP) {
    return 'daily';
  }

  const recent = (requestTimestampsByIp.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= RATE_LIMIT_PER_HOUR) {
    return 'hourly';
  }

  recent.push(now);
  requestTimestampsByIp.set(ip, recent);
  dailyCount += 1;
  return null;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function loadIndex(): Promise<SearchIndexEntry[]> {
  try {
    const raw = await readFile(path.join(OUTPUT_DIR, 'search-index.json'), 'utf-8');
    return JSON.parse(raw) as SearchIndexEntry[];
  } catch {
    return [];
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function clientIp(req: http.IncomingMessage): string {
  // Only trust X-Forwarded-For if you've actually put this behind a reverse proxy you control (e.g.
  // Caddy/nginx) that sets it — otherwise a client could just spoof this header to dodge the rate limit.
  const forwarded = process.env.TRUST_PROXY === 'true' ? req.headers['x-forwarded-for'] : undefined;
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

async function handleAsk(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  // Parse the body first so we know which language to reply in, even for validation errors below.
  let question: string;
  let lang: Lang = 'en';
  try {
    const body = JSON.parse(await readBody(req)) as { question?: string; lang?: string };
    question = (body.question ?? '').trim();
    lang = resolveLang(body.lang);
  } catch {
    sendJson(res, 400, { error: MESSAGES.en.invalidBody });
    return;
  }
  const t = MESSAGES[lang];

  if (!API_KEY) {
    sendJson(res, 503, { error: t.notConfigured });
    return;
  }

  const rejection = checkRateLimit(clientIp(req));
  if (rejection) {
    sendJson(res, 429, { error: rejection === 'daily' ? t.dailyLimit : t.hourlyLimit });
    return;
  }

  if (!question) {
    sendJson(res, 400, { error: t.questionRequired });
    return;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    sendJson(res, 400, { error: t.questionTooLong(MAX_QUESTION_LENGTH) });
    return;
  }

  const index = await loadIndex();
  if (index.length === 0) {
    sendJson(res, 200, { answer: t.indexNotBuilt, sources: [] });
    return;
  }

  try {
    const questionEmbedding = await embedText(question);
    const ranked = index
      .map((entry) => ({ entry, score: cosineSimilarity(questionEmbedding, entry.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    const context = ranked.map((r) => r.entry.text).join('\n\n');
    const prompt = `You are answering a visitor's question about a developer's public work, using only the
project summaries below (real data scanned from their GitHub repositories via DataCore). If the answer isn't
covered by this context, say so honestly rather than guessing or inventing anything.

Context:
${context}

Question: ${question}

${t.answerLanguageInstruction}`;

    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
      },
    );
    if (!genRes.ok) throw new Error(`Gemini generateContent failed with status ${genRes.status}`);
    const genData = (await genRes.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const answer = genData.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no answer generated)';

    sendJson(res, 200, { answer, sources: ranked.map((r) => ({ repo_name: r.entry.repo_name, url: r.entry.url })) });
  } catch (err) {
    sendJson(res, 502, { error: (err as Error).message });
  }
}

async function handleStatic(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const urlPath = req.url === '/' ? '/portfolio.html' : (req.url ?? '/portfolio.html');
  // Strip any path traversal before joining, then verify the resolved path still lands inside OUTPUT_DIR.
  const safePath = path.normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(OUTPUT_DIR, safePath);
  if (!filePath.startsWith(OUTPUT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/ask') {
    handleAsk(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(err));
    });
    return;
  }
  handleStatic(req, res).catch((err) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(err));
  });
});

server.listen(PORT, () => {
  console.log(`Portfolio server listening on http://localhost:${PORT} (serving ${OUTPUT_DIR})`);
  if (!API_KEY) console.log('GEMINI_API_KEY not set — the search box will return a 503 until it is.');
});

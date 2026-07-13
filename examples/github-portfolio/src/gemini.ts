import { RepoAnalysis } from './coreApiClient.js';
import { summarizeKeyFiles } from './techStack.js';

// "-latest" alias tracks whatever Google currently considers their stable flash model, so this default
// doesn't need to be updated every time a specific dated version gets deprecated.
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const API_KEY = process.env.GEMINI_API_KEY;

export interface PortfolioCopy {
  tagline: string;
  bio: string;
  skills: string[];
  highlights: { repo_name: string; highlight: string }[];
}

// Structured output (responseSchema) instead of freeform prompting + regex parsing — Gemini returns
// exactly this shape or the request fails, so there's no fragile text-scraping step here.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tagline: {
      type: 'STRING',
      description: 'A punchy one-line description of this developer for a portfolio hero section, max ~90 characters.',
    },
    bio: {
      type: 'STRING',
      description: 'A 2-3 sentence professional bio inferred from their public repositories.',
    },
    skills: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '6-10 skill or technology tags inferred from languages and repo focus areas.',
    },
    highlights: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          repo_name: { type: 'STRING' },
          highlight: {
            type: 'STRING',
            description: 'One portfolio-appropriate sentence describing what this project demonstrates, rewritten from its raw description.',
          },
        },
        required: ['repo_name', 'highlight'],
      },
    },
  },
  required: ['tagline', 'bio', 'skills', 'highlights'],
};

/**
 * Best-effort AI enhancement layered on top of DataCore's real scanned data — returns null (not a thrown
 * error) when no API key is set, so the minisite still renders from raw data alone in that case.
 *
 * `readmeSummaries` (repo name → SUMMARY artifact text, from `ingestReadmes`) is an optional fallback for
 * when a repo's `readme` field isn't populated (e.g. it's outside the scanner plugin's own
 * MAX_ANALYZED_REPOS bound, but was still ingested as its own DataCore resource here). When `readme` *is*
 * present — fetched directly by `github-profile-scanner` — it's preferred, since it's not truncated the
 * way `markdown-summarizer`'s plain-text summary is.
 */
export async function generatePortfolioCopy(
  analysis: RepoAnalysis,
  readmeSummaries: Map<string, string> = new Map(),
  language: 'en' | 'ja' = 'en',
): Promise<PortfolioCopy | null> {
  if (!API_KEY) return null;

  const topRepos = [...analysis.repos]
    .filter((r) => !r.is_fork)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 8)
    .map((r) => ({
      name: r.name,
      description: r.description,
      language: r.language,
      stars: r.stars,
      readme_summary: r.readme ?? readmeSummaries.get(r.name) ?? null,
      key_file_excerpts: summarizeKeyFiles(r.key_files),
    }));

  const prompt = `You are writing copy for a developer's personal portfolio website, based on real data scanned
from their public GitHub profile via DataCore. Be accurate and specific, grounded only in the data given below —
do not invent projects, employers, or facts that aren't present here.

Where a repo has a \`readme_summary\`, prefer it over \`description\` when writing that repo's highlight — it's
the project's actual README, not just GitHub's one-line description field. Where a repo has
\`key_file_excerpts\` (real content from files like package.json, pom.xml, requirements.txt, Dockerfile), use it
to name the *specific* frameworks, libraries, or tools that project actually uses instead of just repeating the
\`language\` field — e.g. prefer "built with Express and Prisma" over "uses JavaScript" if that's what the
manifest actually shows. Never invent a dependency that isn't visible in the data given.

GitHub username: ${analysis.username}
Total public repositories: ${analysis.repo_count}
Top repositories (by stars, excluding forks):
${JSON.stringify(topRepos, null, 2)}

Write portfolio copy for this developer.${
    language === 'ja'
      ? ' Write every field (tagline, bio, skills, highlights) in natural, professional Japanese — not a literal translation, actual native-sounding copy a Japanese-speaking developer would write about themselves.'
      : ''
  }`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API request failed with status ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini API returned no content');

  return JSON.parse(text) as PortfolioCopy;
}

// Deliberately separate from DataCore's own `vector-embedder` plugin, which uses a deterministic mock
// embedding (a SHA256 hash turned into floats) — fine for demonstrating the pipeline mechanics, but not
// semantically meaningful, so it can't power real similarity search. This calls Gemini's actual embedding
// model instead, entirely within this example — it doesn't touch or depend on DataCore's own Qdrant data.
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const API_KEY = process.env.GEMINI_API_KEY;

export async function embedText(text: string): Promise<number[]> {
  if (!API_KEY) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini embedding request failed with status ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { embedding?: { values?: number[] } };
  if (!data.embedding?.values) throw new Error('Gemini embedding response is missing embedding.values');
  return data.embedding.values;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

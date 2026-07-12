import { QdrantClient } from '@qdrant/js-client-rest';

export const VECTOR_COLLECTION = 'datacore_vectors';

const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

export async function ensureCollection(vectorSize = 8): Promise<void> {
  const collections = await client.getCollections();
  if (!collections.collections.some((c) => c.name === VECTOR_COLLECTION)) {
    await client.createCollection(VECTOR_COLLECTION, {
      vectors: { size: vectorSize, distance: 'Cosine' },
    });
  }
}

export function pointRef(pointId: string): string {
  return `qdrant://${VECTOR_COLLECTION}/${pointId}`;
}

export function pointIdFromRef(ref: string): string {
  return ref.replace(`qdrant://${VECTOR_COLLECTION}/`, '');
}

export async function deletePoint(pointId: string): Promise<void> {
  await client.delete(VECTOR_COLLECTION, { points: [pointId] });
}

export interface QdrantPoint {
  id: string | number;
  vector: number[] | null;
  payload: Record<string, unknown> | null;
}

export async function getPoint(pointId: string): Promise<QdrantPoint | null> {
  const points = await client.retrieve(VECTOR_COLLECTION, { ids: [pointId], with_vector: true, with_payload: true });
  const point = points[0];
  if (!point) return null;
  return {
    id: point.id,
    vector: Array.isArray(point.vector) ? (point.vector as number[]) : null,
    payload: (point.payload as Record<string, unknown>) ?? null,
  };
}

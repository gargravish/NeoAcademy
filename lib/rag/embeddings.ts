/**
 * Embedding service — uses Gemini embedding-001 (free tier) as primary,
 * with local Ollama all-minilm as fallback.
 */

import { createLogger } from '@/lib/logger';
import { pickKey, markRateLimited, recordUsage } from '@/lib/ai/gemini-key-pool';

const log = createLogger('Embeddings');

const GEMINI_EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMENSION = 768; // gemini-embedding-001 output dimension

export const EMBEDDING_DIMENSION = EMBED_DIMENSION;

/**
 * Generate embeddings for a batch of texts.
 * Returns a 2D float32 array: embeddings[i] = float32 array for texts[i]
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Try Gemini free tier first
  const keyData = await pickKey();
  if (keyData) {
    try {
      const embeddings = await geminiEmbed(texts, keyData.key);
      await recordUsage(keyData.keyHash, texts.join(' ').length / 4, 0, keyData.isPaid);
      return embeddings;
    } catch (err: unknown) {
      if (isRateLimitError(err)) {
        log.warn('Gemini embedding rate-limited, falling back to Ollama');
        await markRateLimited(keyData.keyHash);
      } else {
        log.warn('Gemini embedding error, falling back to Ollama:', err);
      }
    }
  }

  // Fallback: local Ollama (all-minilm via /api/embeddings)
  return ollamaEmbed(texts);
}

async function geminiEmbed(texts: string[], apiKey: string): Promise<number[][]> {
  const results: number[][] = [];

  // Process in batches of 100 (Gemini limit)
  const BATCH_SIZE = 100;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const body = {
      model: `models/${GEMINI_EMBED_MODEL}`,
      requests: batch.map((text) => ({
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text }] },
      })),
    };

    const res = await fetch(
      `${GEMINI_EMBED_URL}/${GEMINI_EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (res.status === 429) throw new Error('RATE_LIMIT');
    if (!res.ok) throw new Error(`Gemini embedding failed: ${res.status}`);

    const data = await res.json() as { embeddings: { values: number[] }[] };
    results.push(...data.embeddings.map((e) => e.values));
  }

  return results;
}

async function ollamaEmbed(texts: string[]): Promise<number[][]> {
  const { getOllamaConfig } = await import('@/lib/db/config');
  const config = await getOllamaConfig();
  const baseUrl = config.baseUrl.replace('/v1', '');

  const results: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'all-minilm:l6-v2', prompt: text }),
    });

    if (!res.ok) {
      // Return zero vector rather than crashing the whole pipeline
      log.warn(`Ollama embedding failed for text, using zero vector`);
      results.push(new Array(384).fill(0)); // all-minilm uses 384 dims
      continue;
    }

    const data = await res.json() as { embedding: number[] };
    results.push(data.embedding);
  }

  return results;
}

function isRateLimitError(err: unknown): boolean {
  return err instanceof Error && (err.message.includes('429') || err.message.includes('RATE_LIMIT'));
}

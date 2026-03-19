/**
 * RAG Retriever — semantic search over the knowledge base.
 *
 * Supports:
 *  - Per-user document search
 *  - Global (admin-shared) document inclusion
 *  - Tag-filtered retrieval (priority) + broader semantic fallback
 */

import { createLogger } from '@/lib/logger';
import { embedTexts } from './embeddings';
import { searchChunks } from './vector-store';

const log = createLogger('Retriever');

export interface RetrievedContext {
  text: string;
  source: string;
  score: number;
}

export interface RetrieveOptions {
  userId?: string;
  topK?: number;
  minScore?: number;
  /** Subject tags to prioritize matching chunks */
  tags?: string[];
  /** Include admin-uploaded global documents (default: true) */
  includeGlobal?: boolean;
}

/**
 * Retrieve relevant context for a query from the knowledge base.
 *
 * When tags are provided, performs a two-pass search:
 *  1. Tag-filtered search (high-priority, tagged chunks matching the subject)
 *  2. Broad semantic search (all user + global chunks)
 * Results are merged, deduplicated, and sorted by score.
 */
export async function retrieveContext(
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedContext[]> {
  const { topK = 5, minScore = 0.3, includeGlobal = true } = opts;

  log.info(`RAG query: "${query.slice(0, 80)}…" tags=${opts.tags?.join(',') || 'none'}`);

  const [queryVector] = await embedTexts([query]);
  if (!queryVector) return [];

  const allResults = new Map<string, RetrievedContext>();

  // Pass 1: Tag-filtered search (if tags provided)
  if (opts.tags && opts.tags.length > 0) {
    const tagResults = await searchChunks(queryVector, {
      limit: topK,
      userId: opts.userId,
      includeGlobal,
      tags: opts.tags,
    });

    for (const r of tagResults) {
      if (r.score >= minScore) {
        allResults.set(r.id, {
          text: r.text,
          source: (r.metadata?.filename as string) ?? 'knowledge base',
          score: r.score + 0.05, // small boost for tag-matched chunks
        });
      }
    }
    log.info(`RAG pass 1 (tag-filtered): ${allResults.size} chunks`);
  }

  // Pass 2: Broad semantic search (no tag filter)
  const broadResults = await searchChunks(queryVector, {
    limit: topK,
    userId: opts.userId,
    includeGlobal,
  });

  for (const r of broadResults) {
    if (r.score >= minScore && !allResults.has(r.id)) {
      allResults.set(r.id, {
        text: r.text,
        source: (r.metadata?.filename as string) ?? 'knowledge base',
        score: r.score,
      });
    }
  }

  log.info(`RAG total: ${allResults.size} unique chunks above threshold`);

  // Sort by score descending and take topK
  return [...allResults.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Format retrieved context for inclusion in a prompt.
 */
export function formatContextForPrompt(context: RetrievedContext[]): string {
  if (context.length === 0) return '';

  const sections = context
    .map((c, i) => `[Source ${i + 1}: ${c.source}]\n${c.text}`)
    .join('\n\n');

  return `--- Relevant context from knowledge base ---\n${sections}\n--- End of context ---`;
}

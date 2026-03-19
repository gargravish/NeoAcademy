/**
 * RAG Retriever — semantic search over user's knowledge base.
 * Returns the top-k most relevant text chunks for a given query.
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

/**
 * Retrieve relevant context for a query from the user's knowledge base.
 */
export async function retrieveContext(
  query: string,
  opts: { userId?: string; topK?: number; minScore?: number } = {},
): Promise<RetrievedContext[]> {
  const { topK = 5, minScore = 0.3 } = opts;

  log.info(`RAG query: "${query.slice(0, 80)}…"`);

  // Embed the query
  const [queryVector] = await embedTexts([query]);
  if (!queryVector) return [];

  // Search
  const results = await searchChunks(queryVector, {
    limit: topK,
    userId: opts.userId,
  });

  // Filter by minimum relevance score
  const filtered = results.filter((r) => r.score >= minScore);
  log.info(`RAG: ${filtered.length}/${results.length} chunks above score threshold`);

  return filtered.map((r) => ({
    text: r.text,
    source: r.metadata?.filename as string ?? 'knowledge base',
    score: r.score,
  }));
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

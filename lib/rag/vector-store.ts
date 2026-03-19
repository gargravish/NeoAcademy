/**
 * LanceDB vector store — local, file-based, no cloud needed.
 *
 * Schema per table:
 *   id: string (chunk ID)
 *   docId: string (knowledgeDoc.id)
 *   userId: string
 *   text: string (the chunk text)
 *   vector: Float32Array (EMBEDDING_DIMENSION)
 *   metadata: string (JSON)
 */

import path from 'path';
import { createLogger } from '@/lib/logger';
import { EMBEDDING_DIMENSION } from './embeddings';

const log = createLogger('VectorStore');

const DB_PATH = process.env.LANCEDB_PATH || path.join(process.cwd(), 'data', 'lancedb');
const TABLE_NAME = 'knowledge';

type LanceDB = Awaited<ReturnType<typeof connectDB>>;
type LanceTable = Awaited<ReturnType<LanceDB['openTable']>>;

// Lazy-loaded LanceDB connection
let _db: LanceDB | null = null;
let _table: LanceTable | null = null;

async function connectDB() {
  const lancedb = await import('@lancedb/lancedb');
  return lancedb.connect(DB_PATH);
}

async function getTable() {
  if (_table) return _table;

  if (!_db) {
    _db = await connectDB();
  }

  const tableNames = await _db!.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    _table = await _db!.openTable(TABLE_NAME);
  } else {
    // Create table with schema
    const { Float32 } = await import('apache-arrow');
    _table = await _db!.createTable(TABLE_NAME, [
      {
        id: 'init',
        docId: 'init',
        userId: 'init',
        text: 'init',
        vector: new Float32Array(EMBEDDING_DIMENSION).fill(0),
        metadata: '{}',
      },
    ]);
    // Delete the seed row
    await _table.delete('id = "init"');
    log.info(`LanceDB table '${TABLE_NAME}' created at ${DB_PATH}`);
  }

  return _table;
}

export interface ChunkRecord {
  id: string;
  docId: string;
  userId: string;
  text: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

/** Insert chunks into the vector store */
export async function insertChunks(chunks: ChunkRecord[]): Promise<void> {
  if (chunks.length === 0) return;
  const table = await getTable();

  const rows = chunks.map((c) => ({
    id: c.id,
    docId: c.docId,
    userId: c.userId,
    text: c.text,
    vector: new Float32Array(c.vector),
    metadata: JSON.stringify(c.metadata),
  }));

  await table.add(rows);
  log.info(`Inserted ${rows.length} chunks for docId=${chunks[0].docId}`);
}

/** Semantic search — returns top-k chunks most relevant to query */
export async function searchChunks(
  queryVector: number[],
  opts: { limit?: number; userId?: string } = {},
): Promise<{ id: string; text: string; docId: string; score: number; metadata: Record<string, unknown> }[]> {
  const table = await getTable();
  const { limit = 5 } = opts;

  let query = table.vectorSearch(new Float32Array(queryVector)).limit(limit).select(['id', 'text', 'docId', 'metadata']);

  if (opts.userId) {
    query = query.where(`userId = "${opts.userId}"`);
  }

  const results = await query.toArray();
  return results.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    text: r.text as string,
    docId: r.docId as string,
    score: r._distance != null ? 1 - (r._distance as number) : 0,
    metadata: JSON.parse(r.metadata as string) as Record<string, unknown>,
  }));
}

/** Delete all chunks for a document */
export async function deleteDocChunks(docId: string): Promise<void> {
  const table = await getTable();
  await table.delete(`docId = "${docId}"`);
  log.info(`Deleted chunks for docId=${docId}`);
}

/** Count total chunks */
export async function countChunks(): Promise<number> {
  const table = await getTable();
  return table.countRows();
}

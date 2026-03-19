/**
 * Document ingestion pipeline — text AND multimodal (images, videos).
 *
 * For text (PDF / TXT / MD):
 *   chunk text → embed → store in LanceDB
 *
 * For images (JPEG / PNG / GIF / WebP):
 *   Gemini vision describes the image → treat description as text chunks → embed
 *
 * For videos (MP4 / MOV / WebM):
 *   Extract keyframes → Gemini vision describes each frame → embed descriptions
 */

import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';
import { chunkText, chunkMarkdown } from './chunker';
import { embedTexts } from './embeddings';
import { insertChunks } from './vector-store';
import {
  describeImage,
  processVideo,
  isImageMime,
  isVideoMime,
  SUPPORTED_MEDIA_EXTENSIONS,
} from './media-processor';

const log = createLogger('Ingest');

export type SupportedFileType = 'pdf' | 'txt' | 'md' | 'url' | 'image' | 'video';

export interface IngestOptions {
  userId: string;
  filename: string;
  fileType: SupportedFileType;
  /** For text types: raw text content */
  content?: string;
  /** For image/video types: raw binary */
  buffer?: Buffer;
  mimeType?: string;
  /** Optional topic context to improve vision descriptions */
  context?: string;
  /** Subject tags for filtering during retrieval (lowercase, e.g. ["biology", "gcse"]) */
  tags?: string[];
  /** If true, chunks are available to all users (admin-uploaded shared resources) */
  isGlobal?: boolean;
}

export interface IngestResult {
  docId: string;
  chunkCount: number;
  sizeBytes: number;
  fileType: SupportedFileType;
}

export async function ingestDocument(opts: IngestOptions): Promise<IngestResult> {
  log.info(`Ingesting ${opts.fileType}: ${opts.filename}`);

  if (opts.fileType === 'image') {
    return ingestImage(opts);
  }

  if (opts.fileType === 'video') {
    return ingestVideo(opts);
  }

  return ingestText(opts);
}

// ---------------------------------------------------------------------------
// Text ingestion (PDF / TXT / MD / URL)
// ---------------------------------------------------------------------------

async function ingestText(opts: IngestOptions): Promise<IngestResult> {
  const content = opts.content ?? '';
  if (!content.trim()) {
    throw new Error(`No text content found in ${opts.filename}`);
  }

  const chunks = opts.fileType === 'md' ? chunkMarkdown(content) : chunkText(content);
  if (chunks.length === 0) throw new Error('No content after chunking');

  log.info(`  → ${chunks.length} text chunks`);

  const docId = nanoid();
  const allVectors: number[][] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors = await embedTexts(batch.map((c) => c.text));
    allVectors.push(...vectors);
    log.info(`  → Embedded batch ${Math.ceil((i + 1) / BATCH_SIZE)}/${Math.ceil(chunks.length / BATCH_SIZE)}`);
  }

  const tags = opts.tags ?? [];
  await insertChunks(
    chunks.map((chunk, i) => ({
      id: `${docId}_${chunk.index}`,
      docId,
      userId: opts.userId,
      text: chunk.text,
      vector: allVectors[i] ?? new Array(768).fill(0),
      metadata: {
        filename: opts.filename,
        fileType: opts.fileType,
        chunkIndex: chunk.index,
        ...(tags.length > 0 && { tags }),
        ...(opts.isGlobal && { isGlobal: true }),
      },
    })),
  );

  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  await saveKnowledgeDoc({ id: docId, userId: opts.userId, filename: opts.filename, fileType: opts.fileType, chunkCount: chunks.length, sizeBytes, tags, isGlobal: opts.isGlobal });

  log.info(`Text ingestion complete: docId=${docId}, ${chunks.length} chunks`);
  return { docId, chunkCount: chunks.length, sizeBytes, fileType: opts.fileType };
}

// ---------------------------------------------------------------------------
// Image ingestion
// ---------------------------------------------------------------------------

async function ingestImage(opts: IngestOptions): Promise<IngestResult> {
  if (!opts.buffer) throw new Error('Image buffer required');
  const mimeType = opts.mimeType || 'image/jpeg';

  log.info(`  → Describing image with Gemini vision…`);
  const description = await describeImage(new Uint8Array(opts.buffer), mimeType, opts.context);

  const fullText = `[Image: ${opts.filename}]\n${description}`;
  const chunks = chunkText(fullText, { chunkSize: 400, overlap: 40 });

  const docId = nanoid();
  const vectors = await embedTexts(chunks.map((c) => c.text));

  const tags = opts.tags ?? [];
  await insertChunks(
    chunks.map((chunk, i) => ({
      id: `${docId}_${chunk.index}`,
      docId,
      userId: opts.userId,
      text: chunk.text,
      vector: vectors[i] ?? new Array(768).fill(0),
      metadata: {
        filename: opts.filename,
        fileType: 'image',
        chunkIndex: chunk.index,
        isMedia: true,
        mediaType: 'image',
        ...(tags.length > 0 && { tags }),
        ...(opts.isGlobal && { isGlobal: true }),
      },
    })),
  );

  const sizeBytes = opts.buffer.length;
  await saveKnowledgeDoc({ id: docId, userId: opts.userId, filename: opts.filename, fileType: 'image', chunkCount: chunks.length, sizeBytes, tags, isGlobal: opts.isGlobal });

  log.info(`Image ingestion complete: docId=${docId}`);
  return { docId, chunkCount: chunks.length, sizeBytes, fileType: 'image' };
}

// ---------------------------------------------------------------------------
// Video ingestion
// ---------------------------------------------------------------------------

async function ingestVideo(opts: IngestOptions): Promise<IngestResult> {
  if (!opts.buffer) throw new Error('Video buffer required');
  const mimeType = opts.mimeType || 'video/mp4';

  log.info(`  → Processing video keyframes with Gemini vision…`);
  const mediaChunks = await processVideo(opts.buffer, opts.filename, mimeType, opts.context);

  if (mediaChunks.length === 0) {
    throw new Error('No content extracted from video');
  }

  log.info(`  → ${mediaChunks.length} video frame descriptions`);
  const docId = nanoid();
  const texts = mediaChunks.map((c) => c.text);
  const vectors = await embedTexts(texts);

  const tags = opts.tags ?? [];
  await insertChunks(
    mediaChunks.map((chunk, i) => ({
      id: `${docId}_frame_${i}`,
      docId,
      userId: opts.userId,
      text: chunk.text,
      vector: vectors[i] ?? new Array(768).fill(0),
      metadata: {
        filename: opts.filename,
        fileType: 'video',
        chunkIndex: i,
        isMedia: true,
        mediaType: 'video',
        timestamp: chunk.timestamp,
        frameIndex: chunk.frameIndex,
        mediaRef: chunk.mediaRef,
        ...(tags.length > 0 && { tags }),
        ...(opts.isGlobal && { isGlobal: true }),
      },
    })),
  );

  const sizeBytes = opts.buffer.length;
  await saveKnowledgeDoc({ id: docId, userId: opts.userId, filename: opts.filename, fileType: 'video', chunkCount: mediaChunks.length, sizeBytes, tags, isGlobal: opts.isGlobal });

  log.info(`Video ingestion complete: docId=${docId}, ${mediaChunks.length} frame chunks`);
  return { docId, chunkCount: mediaChunks.length, sizeBytes, fileType: 'video' };
}

// ---------------------------------------------------------------------------
// DB helper
// ---------------------------------------------------------------------------

async function saveKnowledgeDoc(data: {
  id: string;
  userId: string;
  filename: string;
  fileType: string;
  chunkCount: number;
  sizeBytes: number;
  tags?: string[];
  isGlobal?: boolean;
}) {
  const { db } = await import('@/lib/db');
  const { knowledgeDoc } = await import('@/lib/db/schema');

  await db.insert(knowledgeDoc).values({
    id: data.id,
    userId: data.userId,
    filename: data.filename,
    fileType: data.fileType,
    chunkCount: data.chunkCount,
    sizeBytes: data.sizeBytes,
    tags: (data.tags ?? []).join(','),
    isGlobal: data.isGlobal ?? false,
  });
}

// ---------------------------------------------------------------------------
// Helper: detect file type from extension or MIME
// ---------------------------------------------------------------------------

export function detectFileType(filename: string, mimeType?: string): SupportedFileType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime = (mimeType ?? '').toLowerCase();

  if (isImageMime(mime) || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (isVideoMime(mime) || ['mp4', 'mov', 'webm', 'mpeg', 'm4v'].includes(ext)) return 'video';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'md' || mime === 'text/markdown') return 'md';
  return 'txt';
}

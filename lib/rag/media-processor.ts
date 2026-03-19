/**
 * Multimodal media processor for the knowledge base.
 *
 * Supported inputs:
 *   - Images (JPEG, PNG, GIF, WebP): Uses Gemini vision to generate a rich
 *     text description, which is then embedded like any other text chunk.
 *   - Videos (MP4, MOV, WebM): Extracts keyframes with sharp + ffmpeg, then
 *     describes each keyframe with Gemini vision, producing a sequence of
 *     timestamped descriptions that are embedded as text chunks.
 *
 * Why text-based descriptions rather than native image vectors?
 *   LanceDB with gemini-embedding-001 uses text embeddings (768-dim). Storing
 *   a rich natural-language description of visual content is semantically
 *   equivalent for retrieval purposes and avoids a separate CLIP-style model.
 *   Gemini vision is already available (free tier) and produces excellent
 *   captions for educational diagrams, charts, equations, and slides.
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('MediaProcessor');

export type MediaType = 'image' | 'video';

export interface MediaChunk {
  text: string;         // Rich text description of the visual content
  mediaRef: string;     // Relative path to the original media file (for display)
  mediaType: MediaType;
  timestamp?: number;   // For video: seconds from start
  frameIndex?: number;  // For video: frame number
}

// ---------------------------------------------------------------------------
// Supported formats
// ---------------------------------------------------------------------------

export const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
]);

export const SUPPORTED_VIDEO_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg',
]);

export const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp',      // images
  'mp4', 'mov', 'webm', 'mpeg', 'm4v',      // videos
]);

export function isImageMime(mime: string): boolean {
  return SUPPORTED_IMAGE_TYPES.has(mime.toLowerCase());
}

export function isVideoMime(mime: string): boolean {
  return SUPPORTED_VIDEO_TYPES.has(mime.toLowerCase());
}

export function getMediaType(mimeOrExt: string): MediaType | null {
  const lower = mimeOrExt.toLowerCase();
  if (lower.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(lower)) return 'image';
  if (lower.startsWith('video/') || ['mp4', 'mov', 'webm', 'mpeg', 'm4v'].includes(lower)) return 'video';
  return null;
}

// ---------------------------------------------------------------------------
// Image description via Gemini vision (free tier)
// ---------------------------------------------------------------------------

/**
 * Describe an image using Gemini Flash (vision).
 * Returns a rich text description suitable for RAG embedding.
 */
export async function describeImage(
  imageData: Uint8Array,
  mimeType: string,
  context?: string,
): Promise<string> {
  const { pickKey, markRateLimited, recordUsage } = await import('./embeddings').then(() =>
    import('@/lib/ai/gemini-key-pool'),
  );

  const keyData = await pickKey();
  if (!keyData) {
    throw new Error('No Gemini API key available for image description');
  }

  const base64 = Buffer.from(imageData).toString('base64');
  const prompt = context
    ? `Describe this image in detail for educational purposes. Context: ${context}. Focus on: visual elements, text/labels, diagrams, charts, formulas, concepts illustrated, and any educational content.`
    : 'Describe this image in detail for educational purposes. Focus on: visual elements, text/labels, diagrams, charts, formulas, concepts illustrated, and any educational content.';

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keyData.key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    },
  );

  if (res.status === 429) {
    await markRateLimited(keyData.keyHash);
    throw new Error('RATE_LIMIT');
  }

  if (!res.ok) {
    throw new Error(`Gemini vision error: ${res.status}`);
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const tokensIn = data.usageMetadata?.promptTokenCount ?? 0;
  const tokensOut = data.usageMetadata?.candidatesTokenCount ?? 0;
  await recordUsage(keyData.keyHash, tokensIn, tokensOut, keyData.isPaid);

  return text;
}

// ---------------------------------------------------------------------------
// Video processing — extract keyframes and describe each
// ---------------------------------------------------------------------------

const VIDEO_FRAME_INTERVAL_SECONDS = 30; // Extract a frame every 30 seconds
const MAX_VIDEO_FRAMES = 20; // Cap at 20 frames to control API usage

/**
 * Process a video file into a sequence of described keyframe chunks.
 * Uses ffmpeg to extract frames (if available), otherwise describes the
 * video based on its filename and metadata alone.
 */
export async function processVideo(
  videoBuffer: Buffer,
  filename: string,
  mimeType: string,
  context?: string,
): Promise<MediaChunk[]> {
  log.info(`Processing video: ${filename}`);

  // Save video to temp file for ffmpeg
  const tmpDir = path.join(process.cwd(), 'data', '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpVideo = path.join(tmpDir, `vid_${Date.now()}_${filename.replace(/[^a-z0-9.]/gi, '_')}`);

  try {
    fs.writeFileSync(tmpVideo, videoBuffer);

    // Try to extract frames with ffmpeg
    const frames = await extractVideoFrames(tmpVideo, filename);

    if (frames.length === 0) {
      // ffmpeg unavailable — generate a metadata-based description
      log.warn(`No frames extracted from ${filename}, using metadata description`);
      const desc = await describeVideoByMetadata(filename, context);
      return [{ text: desc, mediaRef: filename, mediaType: 'video', frameIndex: 0, timestamp: 0 }];
    }

    // Describe each frame
    const chunks: MediaChunk[] = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      try {
        const frameContext = `Frame from video "${filename}" at ${frame.timestamp.toFixed(1)}s${context ? `. Video context: ${context}` : ''}`;
        const description = await describeImage(frame.data, 'image/jpeg', frameContext);
        chunks.push({
          text: `[Video: ${filename}] [Time: ${frame.timestamp.toFixed(1)}s]\n${description}`,
          mediaRef: filename,
          mediaType: 'video',
          timestamp: frame.timestamp,
          frameIndex: i,
        });
        log.info(`  Frame ${i + 1}/${frames.length} described`);
      } catch (err) {
        log.warn(`  Frame ${i + 1} description failed:`, err);
      }
    }

    return chunks;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tmpVideo)) fs.unlinkSync(tmpVideo);
  }
}

interface VideoFrame {
  data: Uint8Array;
  timestamp: number;
}

async function extractVideoFrames(videoPath: string, filename: string): Promise<VideoFrame[]> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Get video duration
    const { stdout: probeOut } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${videoPath}"`,
      { timeout: 10000 },
    );
    const probe = JSON.parse(probeOut) as { format?: { duration?: string } };
    const duration = parseFloat(probe.format?.duration || '0');

    if (duration <= 0) return [];

    const frameDir = path.join(path.dirname(videoPath), `frames_${Date.now()}`);
    fs.mkdirSync(frameDir, { recursive: true });

    try {
      // Extract a frame every N seconds, capped at MAX_VIDEO_FRAMES
      const interval = Math.max(VIDEO_FRAME_INTERVAL_SECONDS, Math.ceil(duration / MAX_VIDEO_FRAMES));
      await execAsync(
        `ffmpeg -i "${videoPath}" -vf "fps=1/${interval}" -q:v 2 "${frameDir}/frame_%04d.jpg"`,
        { timeout: 60000 },
      );

      const frameFiles = fs.readdirSync(frameDir)
        .filter((f) => f.endsWith('.jpg'))
        .sort();

      const frames: VideoFrame[] = frameFiles.slice(0, MAX_VIDEO_FRAMES).map((f, i) => ({
        data: new Uint8Array(fs.readFileSync(path.join(frameDir, f))),
        timestamp: i * interval,
      }));

      return frames;
    } finally {
      fs.rmSync(frameDir, { recursive: true, force: true });
    }
  } catch {
    // ffmpeg not available — return empty
    return [];
  }
}

async function describeVideoByMetadata(filename: string, context?: string): Promise<string> {
  const { pickKey, recordUsage } = await import('@/lib/ai/gemini-key-pool');
  const keyData = await pickKey();
  if (!keyData) return `Video file: ${filename}`;

  const prompt = `I have a video file named "${filename}"${context ? ` with context: ${context}` : ''}. Based on the filename and context, describe what this video likely contains in educational terms. What topics, concepts, or subject matter would it cover? Provide a description useful for search and retrieval.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keyData.key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  if (!res.ok) return `Video file: ${filename}`;
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? `Video file: ${filename}`;
}

/**
 * Text chunker — splits documents into overlapping chunks suitable for embedding.
 * Supports plain text, markdown, and PDF (pre-extracted text).
 */

export interface TextChunk {
  text: string;
  index: number;
  startChar: number;
  endChar: number;
}

const DEFAULT_CHUNK_SIZE = 512; // tokens approximation (chars / 4)
const DEFAULT_OVERLAP = 64;

/**
 * Split text into overlapping chunks.
 */
export function chunkText(
  text: string,
  opts: { chunkSize?: number; overlap?: number } = {},
): TextChunk[] {
  const chunkSize = (opts.chunkSize ?? DEFAULT_CHUNK_SIZE) * 4; // Convert tokens → chars
  const overlap = (opts.overlap ?? DEFAULT_OVERLAP) * 4;

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push({ text: chunk, index, startChar: start, endChar: end });
      index++;
    }

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Split markdown into sections (by heading), then chunk each section.
 */
export function chunkMarkdown(markdown: string): TextChunk[] {
  // Split by h1/h2 headings
  const sections = markdown.split(/(?=^#{1,2} )/m).filter(Boolean);
  const chunks: TextChunk[] = [];
  let globalIndex = 0;
  let offset = 0;

  for (const section of sections) {
    const sectionChunks = chunkText(section, { chunkSize: 400, overlap: 50 });
    for (const c of sectionChunks) {
      chunks.push({
        ...c,
        index: globalIndex++,
        startChar: offset + c.startChar,
        endChar: offset + c.endChar,
      });
    }
    offset += section.length;
  }

  return chunks;
}

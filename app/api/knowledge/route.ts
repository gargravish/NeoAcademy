import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { ingestDocument, detectFileType } from '@/lib/rag/ingest';

export const maxDuration = 180; // Allow 3 minutes for large video processing

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const urlInput = formData.get('url') as string | null;
  const context = (formData.get('context') as string | null) ?? undefined;

  if (!file && !urlInput) {
    return NextResponse.json({ error: 'Provide a file or URL' }, { status: 400 });
  }

  try {
    if (file) {
      const filename = file.name;
      const mimeType = file.type || '';
      const fileType = detectFileType(filename, mimeType);

      if (fileType === 'image') {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await ingestDocument({ userId: user.id, filename, fileType: 'image', buffer, mimeType, context });
        return NextResponse.json(result);
      }

      if (fileType === 'video') {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await ingestDocument({ userId: user.id, filename, fileType: 'video', buffer, mimeType, context });
        return NextResponse.json(result);
      }

      if (fileType === 'pdf') {
        const { extractText } = await import('unpdf');
        const arrayBuffer = await file.arrayBuffer();
        const extracted = await extractText(new Uint8Array(arrayBuffer));
        const content = Array.isArray(extracted.text) ? extracted.text.join('\n') : (extracted.text as string);
        const result = await ingestDocument({ userId: user.id, filename, fileType: 'pdf', content });
        return NextResponse.json(result);
      }

      // TXT / MD
      const content = await file.text();
      const result = await ingestDocument({ userId: user.id, filename, fileType, content });
      return NextResponse.json(result);
    }

    if (urlInput) {
      const res = await fetch(urlInput, { signal: AbortSignal.timeout(15000) });
      let content = await res.text();
      content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!content) return NextResponse.json({ error: 'No content at URL' }, { status: 400 });

      const result = await ingestDocument({
        userId: user.id,
        filename: urlInput,
        fileType: 'url',
        content,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'No file or URL provided' }, { status: 400 });
  } catch (err) {
    console.error('[knowledge/ingest]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ingestion failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { db } = await import('@/lib/db');
  const { knowledgeDoc } = await import('@/lib/db/schema');
  const { eq, desc } = await import('drizzle-orm');

  const docs = await db
    .select()
    .from(knowledgeDoc)
    .where(eq(knowledgeDoc.userId, user.id))
    .orderBy(desc(knowledgeDoc.createdAt));

  return NextResponse.json({ docs });
}

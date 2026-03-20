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

  // Parse tags (comma-separated string)
  const rawTags = (formData.get('tags') as string | null) ?? '';
  const tags = rawTags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  // Only admins can mark documents as global
  const isGlobalRaw = formData.get('isGlobal') as string | null;
  const isGlobal = isGlobalRaw === 'true' && user.role === 'admin';

  if (!file && !urlInput) {
    return NextResponse.json({ error: 'Provide a file or URL' }, { status: 400 });
  }

  const ingestMeta = { tags: tags.length > 0 ? tags : undefined, isGlobal: isGlobal || undefined };

  try {
    if (file) {
      const filename = file.name;
      const mimeType = file.type || '';
      const fileType = detectFileType(filename, mimeType);

      if (fileType === 'image') {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await ingestDocument({
          userId: user.id,
          filename,
          fileType: 'image',
          buffer,
          mimeType,
          context,
          ...ingestMeta,
        });
        return NextResponse.json(result);
      }

      if (fileType === 'video') {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await ingestDocument({
          userId: user.id,
          filename,
          fileType: 'video',
          buffer,
          mimeType,
          context,
          ...ingestMeta,
        });
        return NextResponse.json(result);
      }

      if (fileType === 'pdf') {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await ingestDocument({
          userId: user.id,
          filename,
          fileType: 'pdf',
          buffer,
          mimeType,
          context,
          ...ingestMeta,
        });
        return NextResponse.json(result);
      }

      // TXT / MD
      const content = await file.text();
      const result = await ingestDocument({
        userId: user.id,
        filename,
        fileType,
        content,
        ...ingestMeta,
      });
      return NextResponse.json(result);
    }

    if (urlInput) {
      const res = await fetch(urlInput, { signal: AbortSignal.timeout(15000) });
      let content = await res.text();
      content = content
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!content) return NextResponse.json({ error: 'No content at URL' }, { status: 400 });

      const result = await ingestDocument({
        userId: user.id,
        filename: urlInput,
        fileType: 'url',
        content,
        ...ingestMeta,
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

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { db } = await import('@/lib/db');
  const { knowledgeDoc } = await import('@/lib/db/schema');
  const { eq, desc, or } = await import('drizzle-orm');

  const showAll = req.nextUrl.searchParams.get('all') === 'true' && user.role === 'admin';

  const docs = showAll
    ? await db.select().from(knowledgeDoc).orderBy(desc(knowledgeDoc.createdAt))
    : await db
        .select()
        .from(knowledgeDoc)
        .where(or(eq(knowledgeDoc.userId, user.id), eq(knowledgeDoc.isGlobal, true)))
        .orderBy(desc(knowledgeDoc.createdAt));

  // Also return all distinct tags for autocomplete
  const tagSet = new Set<string>();
  for (const doc of docs) {
    if (doc.tags) {
      for (const t of doc.tags.split(',')) {
        const tag = t.trim().toLowerCase();
        if (tag) tagSet.add(tag);
      }
    }
  }

  return NextResponse.json({ docs, allTags: [...tagSet].sort() });
}

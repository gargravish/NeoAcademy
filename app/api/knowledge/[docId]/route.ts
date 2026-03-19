import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { knowledgeDoc } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/server';
import { deleteDocChunks } from '@/lib/rag/vector-store';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { docId } = await params;

  const [doc] = await db
    .select()
    .from(knowledgeDoc)
    .where(eq(knowledgeDoc.id, docId))
    .limit(1);

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify ownership (unless admin)
  if (doc.userId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Delete from vector store
  await deleteDocChunks(docId);

  // Delete from DB
  await db.delete(knowledgeDoc).where(eq(knowledgeDoc.id, docId));

  return NextResponse.json({ success: true });
}

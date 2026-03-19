import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { course } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { courseId } = await params;

  const [c] = await db.select().from(course).where(eq(course.id, courseId)).limit(1);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete package files
  const fullPath = path.join(process.cwd(), c.packagePath);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
  }

  // Delete DB record (cascades to learning_progress)
  await db.delete(course).where(eq(course.id, courseId));

  return NextResponse.json({ success: true });
}

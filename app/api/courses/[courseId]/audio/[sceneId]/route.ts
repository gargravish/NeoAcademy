import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { course } from '@/lib/db/schema';
import fs from 'fs';
import path from 'path';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseId: string; sceneId: string }> },
) {
  try {
    await requireUser();
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { courseId, sceneId } = await params;
  const [c] = await db.select().from(course).where(eq(course.id, courseId)).limit(1);
  if (!c) return new NextResponse('Not found', { status: 404 });

  const audioPath = path.join(process.cwd(), c.packagePath, 'audio', `${sceneId}.mp3`);
  if (!fs.existsSync(audioPath)) {
    return new NextResponse('Audio not found', { status: 404 });
  }

  const buffer = fs.readFileSync(audioPath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

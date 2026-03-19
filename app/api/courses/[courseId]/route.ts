/**
 * GET /api/courses/:courseId
 * Returns the pre-generated course package for playback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { course, learningProgress } from '@/lib/db/schema';
import fs from 'fs';
import path from 'path';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { courseId } = await params;
  const [c] = await db.select().from(course).where(eq(course.id, courseId)).limit(1);

  if (!c) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if (c.status !== 'ready') {
    return NextResponse.json({ error: 'Course not ready yet', status: c.status }, { status: 202 });
  }

  // Load the package
  const packageFile = path.join(process.cwd(), c.packagePath, 'course.json');
  if (!fs.existsSync(packageFile)) {
    return NextResponse.json({ error: 'Course package missing' }, { status: 404 });
  }

  const packageData = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));

  // Load user progress
  const [progress] = await db
    .select()
    .from(learningProgress)
    .where(eq(learningProgress.courseId, courseId))
    .limit(1);

  return NextResponse.json({ course: c, package: packageData, progress: progress || null });
}

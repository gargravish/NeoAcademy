import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { course } from '@/lib/db/schema';

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const courses = await db
    .select()
    .from(course)
    .where(eq(course.userId, user.id))
    .orderBy(course.createdAt);

  return NextResponse.json({ courses });
}

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/server';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt })
    .from(user)
    .orderBy(user.createdAt);

  return NextResponse.json({ users });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, role } = await req.json();
  if (!userId || !['admin', 'learner'].includes(role)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  await db.update(user).set({ role }).where(eq(user.id, userId));
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, email, password, role } = await req.json();
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Name, email and password required' }, { status: 400 });
  }

  const { auth } = await import('@/lib/auth');
  const result = await auth.api.signUpEmail({ body: { name, email, password } });
  if (!result?.user) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }

  if (role === 'admin') {
    await db.update(user).set({ role: 'admin' }).where(eq(user.id, result.user.id));
  }

  return NextResponse.json({ success: true, userId: result.user.id });
}

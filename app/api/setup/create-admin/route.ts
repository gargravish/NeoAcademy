import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Only allow during first run (no users exist)
    const existing = await db.select({ id: user.id }).from(user).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Setup already completed' }, { status: 403 });
    }

    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    // Create account via Better Auth (handles hashing etc.)
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
    });

    if (!result?.user) {
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }

    // Promote to admin
    await db
      .update(user)
      .set({ role: 'admin' })
      .where((await import('drizzle-orm')).eq(user.id, result.user.id));

    return NextResponse.json({ success: true, userId: result.user.id });
  } catch (err) {
    console.error('[setup/create-admin]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

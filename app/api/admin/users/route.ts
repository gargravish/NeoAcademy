import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { account, session, user, verification } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/server';
import { randomBytes, scrypt as nodeScrypt } from 'crypto';

async function adminHashPassword(password: string): Promise<string> {
  // Match Better Auth default email/password hashing:
  // - scrypt N=16384, r=16, p=1, dkLen=64
  // - stored as `${saltHex}:${keyHex}`
  const N = 16384;
  const r = 16;
  const p = 1;
  const dkLen = 64;
  const saltBytes = randomBytes(16);
  const saltHex = Buffer.from(saltBytes).toString('hex');

  const passwordNormalized = password.normalize('NFKC');

  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(passwordNormalized, saltHex, dkLen, { N, r, p }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  const keyHex = derivedKey.toString('hex');
  return `${saltHex}:${keyHex}`;
}

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

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await req.json();
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Prevent deleting yourself
  const adminUser = await requireAdmin();
  if (adminUser.id === userId) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  // Fetch user for email-based verification cleanup
  const [target] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Best-effort cleanup (works even if FK cascade isn't enabled)
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(account).where(eq(account.userId, userId));
  await db.delete(verification).where(eq(verification.identifier, target.email));
  await db.delete(user).where(eq(user.id, userId));

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, newPassword } = await req.json();
  if (!userId || typeof userId !== 'string' || !newPassword || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Prevent resetting your own password via admin panel (optional safety)
  const adminUser = await requireAdmin();
  if (adminUser.id === userId) {
    return NextResponse.json({ error: 'You cannot reset your own password here' }, { status: 400 });
  }

  // Hash password with the same hasher Better Auth uses for email/password
  const passwordHash = await adminHashPassword(newPassword);

  // Update all email/password accounts for the user
  // Better Auth stores email/password credentials in `account.password`
  await db
    .update(account)
    .set({ password: passwordHash })
    // Better Auth uses providerId="credential" for email+password accounts
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));

  // Revoke existing sessions so the next login uses the new password
  await db.delete(session).where(eq(session.userId, userId));

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

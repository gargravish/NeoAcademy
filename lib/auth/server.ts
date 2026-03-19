import { headers } from 'next/headers';
import { auth } from './index';
import type { User } from '@/lib/db/schema';

/** Get the current session from server context (Server Components / Route Handlers). */
export async function getServerSession() {
  const hdrs = await headers();
  return auth.api.getSession({ headers: hdrs });
}

/** Get current user, throws if not authenticated. */
export async function requireUser(): Promise<User> {
  const session = await getServerSession();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session.user as User;
}

/** Get current user, throws if not authenticated or not admin. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    throw new Error('Forbidden: admin access required');
  }
  return user;
}

/** Check if the database has any users (for first-run setup). */
export async function isFirstRun(): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const { user } = await import('@/lib/db/schema');
  const users = await db.select({ id: user.id }).from(user).limit(1);
  return users.length === 0;
}

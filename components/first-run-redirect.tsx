import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { isFirstRun } from '@/lib/auth/server';

/**
 * Server component rendered in the root layout.
 * Redirects to /setup if no users exist (first run).
 * Skipped on /setup and /login to avoid redirect loops.
 */
export async function FirstRunRedirect() {
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') || hdrs.get('x-invoke-path') || '';

  // Don't redirect if already on /setup or /login
  if (pathname.startsWith('/setup') || pathname.startsWith('/login')) {
    return null;
  }

  const firstRun = await isFirstRun();
  if (firstRun) {
    redirect('/setup');
  }

  return null;
}

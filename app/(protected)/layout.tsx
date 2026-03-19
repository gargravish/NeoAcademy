import { redirect } from 'next/navigation';
import { isFirstRun } from '@/lib/auth/server';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const firstRun = await isFirstRun();
  if (firstRun) {
    redirect('/setup');
  }
  return <>{children}</>;
}

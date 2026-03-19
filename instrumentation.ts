/**
 * Next.js instrumentation — runs once on server startup.
 * Used to run DB migrations before any requests are served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./lib/db/migrate');
    await runMigrations();
  }
}

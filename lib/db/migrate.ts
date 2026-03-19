/**
 * Runs database migrations on startup using drizzle-orm.
 * Called once at app startup via Next.js instrumentation.
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { db } from './index';
import { createLogger } from '@/lib/logger';

const log = createLogger('DBMigrate');

export async function runMigrations() {
  try {
    const migrationsFolder = path.join(process.cwd(), 'lib', 'db', 'migrations');
    migrate(db, { migrationsFolder });
    log.info('Database migrations complete');
  } catch (err) {
    log.error('Database migration failed:', err);
    throw err;
  }
}

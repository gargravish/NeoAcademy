/**
 * Gemini Key Pool — multi-key rotation for free tier rate limit management.
 *
 * Strategy:
 * 1. Maintain a circular pool of free-tier API keys (one per GCP project)
 * 2. Track per-key daily usage (requests + tokens)
 * 3. On 429 rate-limit hit, rotate to the next available key
 * 4. If all free keys are exhausted, fall through to the paid key
 * 5. Paid key respects the monthly spend cap (GBP)
 * 6. All usage is recorded in the DB for admin visibility
 */

import { createLogger } from '@/lib/logger';
import { createHash } from 'crypto';

const log = createLogger('GeminiKeyPool');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyState {
  key: string;
  keyHash: string; // First 8 chars of SHA256 for identification
  requestsToday: number;
  tokensToday: number;
  rateLimitedUntil: number; // timestamp, 0 = not rate-limited
  isPaid: boolean;
}

// ---------------------------------------------------------------------------
// Free-tier daily limits per key (conservative — actual is higher)
// Gemini Flash free: 1,500 RPD, 1M TPD; Flash-Lite free: 1,500 RPD, 1M TPD
// ---------------------------------------------------------------------------
const FREE_KEY_DAILY_REQUEST_LIMIT = 1400; // Safety margin below 1500
const FREE_KEY_DAILY_TOKEN_LIMIT = 900_000; // Safety margin below 1M
const RATE_LIMIT_BACKOFF_MS = 60_000; // 1 minute backoff per key on 429

// ---------------------------------------------------------------------------
// Module-level pool (singleton within the Node.js process)
// ---------------------------------------------------------------------------
let _pool: KeyState[] | null = null;
let _poolLoadedAt = 0;
const POOL_TTL_MS = 60 * 60 * 1000; // Reload config hourly

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPool(): Promise<KeyState[]> {
  const now = Date.now();
  if (_pool && now - _poolLoadedAt < POOL_TTL_MS) return _pool;

  const { getGeminiConfig } = await import('@/lib/db/config');
  const config = await getGeminiConfig();

  const states: KeyState[] = [
    ...config.freeKeys.filter(Boolean).map((key) => ({
      key,
      keyHash: hashKey(key),
      requestsToday: 0,
      tokensToday: 0,
      rateLimitedUntil: 0,
      isPaid: false,
    })),
  ];

  if (config.paidKey) {
    states.push({
      key: config.paidKey,
      keyHash: hashKey(config.paidKey),
      requestsToday: 0,
      tokensToday: 0,
      rateLimitedUntil: 0,
      isPaid: true,
    });
  }

  _pool = states;
  _poolLoadedAt = now;
  log.info(
    `Key pool loaded: ${states.filter((s) => !s.isPaid).length} free keys, ${states.some((s) => s.isPaid) ? 1 : 0} paid key`,
  );
  return _pool;
}

/** Invalidate pool cache (called when admin saves new keys) */
export function invalidatePool() {
  _pool = null;
  _poolLoadedAt = 0;
}

// ---------------------------------------------------------------------------
// Key selection
// ---------------------------------------------------------------------------

/** Index in the pool of the last used free key — round-robin */
let _lastFreeKeyIndex = -1;

/**
 * Pick the next available API key.
 * Returns { key, keyHash, isPaid } or null if all keys are exhausted.
 */
export async function pickKey(): Promise<{ key: string; keyHash: string; isPaid: boolean } | null> {
  const pool = await getPool();
  const now = Date.now();
  const freeKeys = pool.filter((k) => !k.isPaid);

  // Try free keys in round-robin order
  for (let attempt = 0; attempt < freeKeys.length; attempt++) {
    _lastFreeKeyIndex = (_lastFreeKeyIndex + 1) % freeKeys.length;
    const state = freeKeys[_lastFreeKeyIndex];

    if (state.rateLimitedUntil > now) continue;
    if (state.requestsToday >= FREE_KEY_DAILY_REQUEST_LIMIT) continue;
    if (state.tokensToday >= FREE_KEY_DAILY_TOKEN_LIMIT) continue;

    return { key: state.key, keyHash: state.keyHash, isPaid: false };
  }

  // Fall through to paid key
  const paid = pool.find((k) => k.isPaid);
  if (paid && paid.rateLimitedUntil <= now) {
    return { key: paid.key, keyHash: paid.keyHash, isPaid: true };
  }

  log.warn('All Gemini keys exhausted or rate-limited');
  return null;
}

/**
 * Mark a key as rate-limited (429 response).
 */
export async function markRateLimited(keyHash: string): Promise<void> {
  const pool = await getPool();
  const state = pool.find((k) => k.keyHash === keyHash);
  if (state) {
    state.rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    log.warn(`Key ${keyHash} rate-limited for 60s`);
  }
}

/**
 * Record usage after a successful call.
 */
export async function recordUsage(
  keyHash: string,
  tokensIn: number,
  tokensOut: number,
  isPaid: boolean,
): Promise<void> {
  const pool = await getPool();
  const state = pool.find((k) => k.keyHash === keyHash);
  if (state) {
    state.requestsToday += 1;
    state.tokensToday += tokensIn + tokensOut;
  }

  // Persist to DB asynchronously (fire and forget — don't block generation)
  persistUsage(keyHash, tokensIn, tokensOut, isPaid).catch((err) =>
    log.warn('Failed to persist usage:', err),
  );
}

async function persistUsage(
  keyHash: string,
  tokensIn: number,
  tokensOut: number,
  isPaid: boolean,
): Promise<void> {
  const { db } = await import('@/lib/db');
  const { providerUsage } = await import('@/lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const today = todayString();
  const provider = isPaid ? 'gemini-paid' : 'gemini-free';

  // Rough cost: Flash-Lite free = $0, paid = ~$0.075/$0.30 per 1M input/output tokens
  const costUsd = isPaid ? (tokensIn / 1_000_000) * 0.075 + (tokensOut / 1_000_000) * 0.3 : 0;

  const existing = await db
    .select()
    .from(providerUsage)
    .where(
      and(
        eq(providerUsage.date, today),
        eq(providerUsage.provider, provider),
        eq(providerUsage.keyHash, keyHash),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(providerUsage)
      .set({
        requests: existing[0].requests + 1,
        tokensIn: existing[0].tokensIn + tokensIn,
        tokensOut: existing[0].tokensOut + tokensOut,
        costUsd: existing[0].costUsd + costUsd,
        updatedAt: new Date(),
      })
      .where(eq(providerUsage.id, existing[0].id));
  } else {
    await db.insert(providerUsage).values({
      date: today,
      provider,
      keyHash,
      requests: 1,
      tokensIn,
      tokensOut,
      costUsd,
      updatedAt: new Date(),
    });
  }
}

import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Better Auth managed tables
// ---------------------------------------------------------------------------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('learner'), // 'admin' | 'learner'
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// NeoAcademy custom tables
// ---------------------------------------------------------------------------

/** Stores all provider API configurations (Gemini keys, SiliconFlow, Ollama, etc.) */
export const providerConfig = sqliteTable('provider_config', {
  id: text('id').primaryKey(), // e.g. 'gemini', 'siliconflow', 'ollama', 'tts', 'asr'
  config: text('config', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Daily usage tracking per provider/key */
export const providerUsage = sqliteTable('provider_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  provider: text('provider').notNull(), // 'gemini', 'siliconflow', 'openai'
  keyHash: text('key_hash'), // hashed API key identifier (first 8 chars)
  requests: integer('requests').notNull().default(0),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0.0),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Generated course package metadata */
export const course = sqliteTable('course', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  topic: text('topic').notNull(),
  level: text('level'), // 'GCSE' | 'A-Level' | 'University' | 'General'
  sceneCount: integer('scene_count').notNull().default(0),
  packagePath: text('package_path').notNull(), // relative: 'data/courses/{id}/'
  generationCostUsd: real('generation_cost_usd').notNull().default(0.0),
  status: text('status').notNull().default('generating'), // 'generating' | 'ready' | 'failed'
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Uploaded knowledge base documents */
export const knowledgeDoc = sqliteTable('knowledge_doc', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  fileType: text('file_type').notNull(), // 'pdf' | 'txt' | 'md' | 'url' | 'image'
  chunkCount: integer('chunk_count').notNull().default(0),
  sizeBytes: integer('size_bytes').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Per-user learning progress per course */
export const learningProgress = sqliteTable('learning_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  courseId: text('course_id')
    .notNull()
    .references(() => course.id, { onDelete: 'cascade' }),
  completedScenes: text('completed_scenes', { mode: 'json' }).$type<string[]>().default([]),
  quizScores: text('quiz_scores', { mode: 'json' }).$type<Record<string, number>>().default({}),
  timeSpentSeconds: integer('time_spent_seconds').notNull().default(0),
  lastActivity: integer('last_activity', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Generic app settings key-value store */
export const appSetting = sqliteTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull().$type<unknown>(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type ProviderConfig = typeof providerConfig.$inferSelect;
export type ProviderUsage = typeof providerUsage.$inferSelect;
export type Course = typeof course.$inferSelect;
export type KnowledgeDoc = typeof knowledgeDoc.$inferSelect;
export type LearningProgress = typeof learningProgress.$inferSelect;

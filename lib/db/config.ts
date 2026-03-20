/**
 * Provider configuration service — reads/writes the provider_config SQLite table.
 * This replaces hardcoded .env values for all API keys and server URLs.
 * Falls back to .env values when the DB doesn't have a config for a provider.
 */

import { eq } from 'drizzle-orm';
import { db } from './index';
import { providerConfig } from './schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeminiConfig {
  freeKeys: string[];
  paidKey?: string;
  paidMonthlyCapGbp: number;
  generationModel: string;
  qualityModel: string;
  embeddingModel: string;
  enabled: boolean;
}

export interface SiliconFlowConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface TTSConfig {
  baseUrl: string;
  apiKey: string;
  defaultVoice: string;
}

export interface ASRConfig {
  baseUrl: string;
  apiKey: string;
}

export interface WebSearchConfig {
  tavily: { apiKey: string; enabled: boolean };
  brave: { apiKey: string; enabled: boolean };
  duckduckgo: { enabled: boolean };
}

export interface GenerationConfig {
  defaultModel: string;
  qualityModel: string;
  fallbackChain: string[];
  concurrencyLimit: number;
}

// ---------------------------------------------------------------------------
// Defaults from environment (bootstrap fallback)
// ---------------------------------------------------------------------------

function envGeminiKeys(): string[] {
  const raw = process.env.GEMINI_FREE_KEYS || process.env.GOOGLE_API_KEY || '';
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export const DEFAULTS = {
  gemini: (): GeminiConfig => ({
    freeKeys: envGeminiKeys(),
    paidKey: process.env.GEMINI_PAID_KEY || '',
    paidMonthlyCapGbp: parseFloat(process.env.GEMINI_PAID_MONTHLY_CAP_GBP || '5.0'),
    generationModel: process.env.GEMINI_GENERATION_MODEL || 'gemini-2.5-flash-lite',
    qualityModel: process.env.GEMINI_QUALITY_MODEL || 'gemini-2.5-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    enabled: true,
  }),
  siliconflow: (): SiliconFlowConfig => ({
    apiKey: process.env.SILICONFLOW_API_KEY || '',
    baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    enabled: !!process.env.SILICONFLOW_API_KEY,
  }),
  openai: (): OpenAIConfig => ({
    apiKey: process.env.OPENAI_API_KEY_DIRECT || '',
    enabled: false,
  }),
  ollama: (): OllamaConfig => ({
    baseUrl: process.env.OPENAI_BASE_URL || 'http://192.168.70.10:11434/v1',
    model: process.env.OPENAI_MODELS?.split(',')[0]?.trim() || 'qwen3.5:latest',
    apiKey: process.env.OPENAI_API_KEY || 'ollama',
  }),
  tts: (): TTSConfig => ({
    baseUrl: process.env.TTS_OPENAI_BASE_URL || 'http://192.168.70.10:8880/v1',
    apiKey: process.env.TTS_OPENAI_API_KEY || 'kokoro',
    defaultVoice: process.env.TTS_DEFAULT_VOICE || 'af_bella',
  }),
  asr: (): ASRConfig => ({
    baseUrl: process.env.ASR_OPENAI_BASE_URL || 'http://192.168.70.10:8881/v1',
    apiKey: process.env.ASR_OPENAI_API_KEY || 'whisper',
  }),
  webSearch: (): WebSearchConfig => ({
    tavily: { apiKey: process.env.TAVILY_API_KEY || '', enabled: !!process.env.TAVILY_API_KEY },
    brave: {
      apiKey: process.env.BRAVE_SEARCH_API_KEY || '',
      enabled: !!process.env.BRAVE_SEARCH_API_KEY,
    },
    duckduckgo: { enabled: true },
  }),
  generation: (): GenerationConfig => ({
    defaultModel: 'gemini:gemini-2.5-flash-lite',
    qualityModel: 'gemini:gemini-2.5-flash',
    fallbackChain: ['gemini-free', 'siliconflow', 'gemini-paid', 'openai'],
    concurrencyLimit: 3,
  }),
};

// ---------------------------------------------------------------------------
// Generic get/set
// ---------------------------------------------------------------------------

async function getConfig<T>(id: string, defaultFn: () => T): Promise<T> {
  try {
    const rows = await db.select().from(providerConfig).where(eq(providerConfig.id, id)).limit(1);
    if (rows.length > 0) return rows[0].config as T;
  } catch {
    // DB not ready yet (first run before migration) — use env defaults
  }
  return defaultFn();
}

async function setConfig<T>(id: string, config: T): Promise<void> {
  const configData = config as Record<string, unknown>;
  await db
    .insert(providerConfig)
    .values({ id, config: configData, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: providerConfig.id,
      set: { config: configData, updatedAt: new Date() },
    });
}

// ---------------------------------------------------------------------------
// Public API — typed getters/setters per provider
// ---------------------------------------------------------------------------

export const getGeminiConfig = () => getConfig('gemini', DEFAULTS.gemini);
export const setGeminiConfig = (c: GeminiConfig) => setConfig('gemini', c);

export const getSiliconFlowConfig = () => getConfig('siliconflow', DEFAULTS.siliconflow);
export const setSiliconFlowConfig = (c: SiliconFlowConfig) => setConfig('siliconflow', c);

export const getOpenAIConfig = () => getConfig('openai', DEFAULTS.openai);
export const setOpenAIConfig = (c: OpenAIConfig) => setConfig('openai', c);

export const getOllamaConfig = () => getConfig('ollama', DEFAULTS.ollama);
export const setOllamaConfig = (c: OllamaConfig) => setConfig('ollama', c);

export const getTTSConfig = () => getConfig('tts', DEFAULTS.tts);
export const setTTSConfig = (c: TTSConfig) => setConfig('tts', c);

export const getASRConfig = () => getConfig('asr', DEFAULTS.asr);
export const setASRConfig = (c: ASRConfig) => setConfig('asr', c);

export const getWebSearchConfig = () => getConfig('webSearch', DEFAULTS.webSearch);
export const setWebSearchConfig = (c: WebSearchConfig) => setConfig('webSearch', c);

export const getGenerationConfig = () => getConfig('generation', DEFAULTS.generation);
export const setGenerationConfig = (c: GenerationConfig) => setConfig('generation', c);

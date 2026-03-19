import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server';
import {
  getGeminiConfig, setGeminiConfig,
  getSiliconFlowConfig, setSiliconFlowConfig,
  getOpenAIConfig, setOpenAIConfig,
  getOllamaConfig, setOllamaConfig,
  getTTSConfig, setTTSConfig,
  getASRConfig, setASRConfig,
  getWebSearchConfig, setWebSearchConfig,
  getGenerationConfig, setGenerationConfig,
} from '@/lib/db/config';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [gemini, siliconflow, openai, ollama, tts, asr, webSearch, generation] = await Promise.all([
    getGeminiConfig(),
    getSiliconFlowConfig(),
    getOpenAIConfig(),
    getOllamaConfig(),
    getTTSConfig(),
    getASRConfig(),
    getWebSearchConfig(),
    getGenerationConfig(),
  ]);

  // Mask API keys in response — only show first 8 chars
  const mask = (key: string) => key ? key.slice(0, 8) + '••••••••' : '';

  return NextResponse.json({
    gemini: {
      ...gemini,
      freeKeys: gemini.freeKeys.map(mask),
      paidKey: mask(gemini.paidKey || ''),
    },
    siliconflow: { ...siliconflow, apiKey: mask(siliconflow.apiKey) },
    openai: { ...openai, apiKey: mask(openai.apiKey) },
    ollama,
    tts,
    asr,
    webSearch: {
      ...webSearch,
      tavily: { ...webSearch.tavily, apiKey: mask(webSearch.tavily.apiKey) },
      brave: { ...webSearch.brave, apiKey: mask(webSearch.brave.apiKey) },
    },
    generation,
  });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { provider, config } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setters: Record<string, (c: any) => Promise<void>> = {
    gemini: setGeminiConfig,
    siliconflow: setSiliconFlowConfig,
    openai: setOpenAIConfig,
    ollama: setOllamaConfig,
    tts: setTTSConfig,
    asr: setASRConfig,
    webSearch: setWebSearchConfig,
    generation: setGenerationConfig,
  };

  const setter = setters[provider];
  if (!setter) {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  await setter(config);
  return NextResponse.json({ success: true });
}

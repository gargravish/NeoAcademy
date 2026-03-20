import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import {
  setGeminiConfig,
  setOllamaConfig,
  setTTSConfig,
  setASRConfig,
  DEFAULTS,
} from '@/lib/db/config';

export async function POST(req: NextRequest) {
  try {
    // Only allow during first run
    const existing = await db.select({ id: user.id }).from(user).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Create admin account first' }, { status: 403 });
    }

    const { geminiKeys, ollamaUrl, ttsUrl, asrUrl } = await req.json();

    if (!geminiKeys?.length) {
      return NextResponse.json(
        { error: 'At least one Gemini API key is required' },
        { status: 400 },
      );
    }

    const geminiDefault = DEFAULTS.gemini();
    await setGeminiConfig({
      ...geminiDefault,
      freeKeys: geminiKeys,
    });

    await setOllamaConfig({
      baseUrl: ollamaUrl,
      model: 'qwen3.5:latest',
      apiKey: 'ollama',
    });

    await setTTSConfig({
      baseUrl: ttsUrl,
      apiKey: 'kokoro',
      defaultVoice: 'af_bella',
    });

    await setASRConfig({
      baseUrl: asrUrl,
      apiKey: 'whisper',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[setup/save-providers]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

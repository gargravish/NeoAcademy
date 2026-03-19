import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server';
import { getOllamaConfig, getTTSConfig, getASRConfig } from '@/lib/db/config';

async function ping(url: string): Promise<boolean> {
  try {
    const testUrl = url.replace(/\/v1\/?$/, '') + '/v1/models';
    const res = await fetch(testUrl, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [ollama, tts, asr] = await Promise.all([
    getOllamaConfig().then((c) => ping(c.baseUrl)),
    getTTSConfig().then((c) => ping(c.baseUrl)),
    getASRConfig().then((c) => ping(c.baseUrl)),
  ]);

  return NextResponse.json({ ollama, tts, asr });
}

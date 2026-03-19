import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ ok: false }, { status: 400 });

    // Try to hit the models endpoint (works for Ollama + Kokoro + Whisper OpenAI-compat servers)
    const testUrl = url.replace(/\/v1\/?$/, '') + '/v1/models';
    const res = await fetch(testUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

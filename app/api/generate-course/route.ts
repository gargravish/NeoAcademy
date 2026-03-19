/**
 * POST /api/generate-course
 * Generates a complete course package. Streams progress as SSE.
 */

import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { preGenerateCourse, type PreGenerationProgress } from '@/lib/server/pre-generation-engine';

export const maxDuration = 300; // Allow up to 5 minutes for large courses

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const {
    topic,
    level,
    language,
    numScenes,
    useKnowledgeBase = true,
    useWebSearch = true,
    highQuality = false,
  } = body;

  if (!topic?.trim()) {
    return new Response('Topic is required', { status: 400 });
  }

  // Stream progress via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: PreGenerationProgress) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await preGenerateCourse(
          {
            userId: user.id,
            topic: topic.trim(),
            level,
            language,
            numScenes,
            useKnowledgeBase,
            useWebSearch,
            highQuality,
          },
          send,
        );
      } catch (err) {
        send({
          step: 'error',
          progress: 0,
          message: err instanceof Error ? err.message : 'Generation failed',
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

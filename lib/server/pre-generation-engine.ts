/**
 * Pre-Generation Engine
 *
 * Generates a complete course package in one shot:
 * 1. Retrieve context from RAG knowledge base
 * 2. Fetch web search results for enrichment
 * 3. Generate scene outlines (Gemini Flash via key pool)
 * 4. Generate all scene content in parallel (controlled concurrency)
 * 5. Pre-render TTS audio for each scene's speaker notes
 * 6. Save everything to disk as a self-contained course package
 * 7. Register course in SQLite DB
 *
 * The resulting package is served instantly at runtime — zero LLM calls during playback.
 */

import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import { smartRouter } from '@/lib/ai/smart-router';
import { retrieveContext, formatContextForPrompt } from '@/lib/rag/retriever';
import { webSearch, formatSearchResultsForPrompt } from '@/lib/web-search/search';
import { generateText } from 'ai';

const log = createLogger('PreGenEngine');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreGenerationInput {
  userId: string;
  topic: string;
  level?: string; // 'GCSE' | 'A-Level' | 'University' | 'General'
  language?: string;
  numScenes?: number;
  useKnowledgeBase?: boolean;
  useWebSearch?: boolean;
  highQuality?: boolean; // Use better model (slower, higher cost)
}

export type PreGenerationStep =
  | 'initializing'
  | 'retrieving_context'
  | 'web_search'
  | 'generating_outlines'
  | 'generating_scenes'
  | 'rendering_audio'
  | 'saving'
  | 'complete'
  | 'error';

export interface PreGenerationProgress {
  step: PreGenerationStep;
  progress: number; // 0–100
  message: string;
  scenesComplete?: number;
  totalScenes?: number;
  courseId?: string;
  error?: string;
}

export type ProgressCallback = (progress: PreGenerationProgress) => void;

interface SceneOutline {
  id: string;
  title: string;
  type: 'slides' | 'quiz' | 'interactive';
  keyPoints: string[];
  speakerNotes: string;
}

interface GeneratedScene {
  id: string;
  title: string;
  type: string;
  content: Record<string, unknown>;
  speakerNotes: string;
  audioPath?: string;
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

export async function preGenerateCourse(
  input: PreGenerationInput,
  onProgress?: ProgressCallback,
): Promise<{ courseId: string; packagePath: string; sceneCount: number }> {
  const courseId = nanoid();
  const packageDir = path.join(process.cwd(), 'data', 'courses', courseId);
  fs.mkdirSync(packageDir, { recursive: true });

  const progress = (step: PreGenerationStep, pct: number, msg: string, extra: Partial<PreGenerationProgress> = {}) => {
    onProgress?.({ step, progress: pct, message: msg, ...extra });
    log.info(`[${step}] ${pct}% — ${msg}`);
  };

  try {
    progress('initializing', 0, `Preparing to generate: "${input.topic}"`);

    // 1. Create course record (status=generating)
    await registerCourse({
      id: courseId,
      userId: input.userId,
      topic: input.topic,
      level: input.level,
      packagePath: `data/courses/${courseId}`,
      status: 'generating',
    });

    // 2. RAG context retrieval (tag-aware)
    progress('retrieving_context', 5, 'Searching knowledge base…');
    let ragContext = '';
    if (input.useKnowledgeBase !== false) {
      const matchedTags = await matchTopicToTags(input.topic);
      if (matchedTags.length > 0) {
        log.info(`Auto-matched tags from topic: ${matchedTags.join(', ')}`);
      }
      const chunks = await retrieveContext(input.topic, {
        userId: input.userId,
        topK: 8,
        tags: matchedTags.length > 0 ? matchedTags : undefined,
        includeGlobal: true,
      });
      ragContext = formatContextForPrompt(chunks);
    }

    // 3. Web search
    progress('web_search', 10, 'Fetching latest information from the web…');
    let webContext = '';
    if (input.useWebSearch !== false) {
      const results = await webSearch(input.topic, { maxResults: 5 });
      webContext = formatSearchResultsForPrompt(results);
    }

    // 4. Generate outlines
    progress('generating_outlines', 15, 'Generating course structure…');
    const numScenes = input.numScenes ?? 8;
    const outlines = await generateOutlines({
      topic: input.topic,
      level: input.level,
      language: input.language,
      numScenes,
      ragContext,
      webContext,
      highQuality: input.highQuality,
    });

    progress('generating_scenes', 20, `Generating ${outlines.length} scenes…`, {
      scenesComplete: 0,
      totalScenes: outlines.length,
      courseId,
    });

    // 5. Generate scenes in parallel (controlled concurrency)
    const { getGenerationConfig } = await import('@/lib/db/config');
    const genConfig = await getGenerationConfig();
    const concurrency = genConfig.concurrencyLimit;

    const scenes: GeneratedScene[] = new Array(outlines.length);
    let completed = 0;

    // Process in batches of `concurrency`
    for (let i = 0; i < outlines.length; i += concurrency) {
      const batch = outlines.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (outline, batchIdx) => {
          const sceneIdx = i + batchIdx;
          const scene = await generateScene(outline, {
            topic: input.topic,
            level: input.level,
            language: input.language,
            ragContext,
            webContext,
            highQuality: input.highQuality,
          });
          scenes[sceneIdx] = scene;
          completed++;
          progress('generating_scenes', 20 + Math.round((completed / outlines.length) * 60), `Scene ${completed}/${outlines.length}: ${scene.title}`, {
            scenesComplete: completed,
            totalScenes: outlines.length,
            courseId,
          });
        }),
      );
    }

    // 6. Pre-render TTS audio
    progress('rendering_audio', 80, 'Pre-rendering audio narration…');
    await renderTTSAudio(scenes, packageDir, (done, total) => {
      progress('rendering_audio', 80 + Math.round((done / total) * 15), `Audio ${done}/${total} scenes`);
    });

    // 7. Save course package
    progress('saving', 95, 'Saving course package…');
    const courseTitle = outlines[0]?.title
      ? `${input.topic} — ${outlines.length} scenes`
      : input.topic;

    const packageData = {
      courseId,
      title: courseTitle,
      topic: input.topic,
      level: input.level,
      language: input.language,
      generatedAt: new Date().toISOString(),
      scenes,
    };

    fs.writeFileSync(
      path.join(packageDir, 'course.json'),
      JSON.stringify(packageData, null, 2),
      'utf-8',
    );

    // Update DB record
    await updateCourseRecord({
      id: courseId,
      title: courseTitle,
      sceneCount: scenes.length,
      status: 'ready',
    });

    progress('complete', 100, 'Course ready!', { courseId });
    log.info(`Course ${courseId} generated: ${scenes.length} scenes`);

    return { courseId, packagePath: packageDir, sceneCount: scenes.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Pre-generation failed:', err);

    await updateCourseRecord({ id: courseId, status: 'failed' }).catch(() => {});
    progress('error', 0, `Generation failed: ${message}`, { error: message, courseId });

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Outline generation
// ---------------------------------------------------------------------------

async function generateOutlines(opts: {
  topic: string;
  level?: string;
  language?: string;
  numScenes: number;
  ragContext: string;
  webContext: string;
  highQuality?: boolean;
}): Promise<SceneOutline[]> {
  const task = opts.highQuality ? 'generation-quality' : 'generation-draft';
  const { model, keyInfo } = await smartRouter.selectModel({ task });

  const contextSections = [opts.ragContext, opts.webContext].filter(Boolean).join('\n\n');
  const systemPrompt = `You are an expert educational content designer. Create engaging, accurate learning experiences for students.${opts.level ? ` Target level: ${opts.level}.` : ''}`;

  const userPrompt = `Create a structured outline for a ${opts.numScenes}-scene interactive lesson about: "${opts.topic}"
${contextSections ? `\n${contextSections}\n` : ''}
Return a JSON array of ${opts.numScenes} scene outlines. Each scene must have:
{
  "id": "scene_N",
  "title": "Scene title",
  "type": "slides" | "quiz" | "interactive",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "speakerNotes": "Brief narration for this scene (2-3 sentences)"
}

Make the first scene introductory, include 1-2 quiz scenes, and end with a summary scene.
${opts.language && opts.language !== 'en' ? `All content must be in language code: ${opts.language}` : ''}`;

  const { text, usage } = await generateText({ model, system: systemPrompt, prompt: userPrompt });
  await smartRouter.recordUsage(keyInfo, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0);

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Failed to parse scene outlines from LLM response');

  const parsed = JSON.parse(jsonMatch[0]) as SceneOutline[];
  return parsed.map((o, i) => ({ ...o, id: o.id || `scene_${i + 1}` }));
}

// ---------------------------------------------------------------------------
// Scene generation
// ---------------------------------------------------------------------------

async function generateScene(
  outline: SceneOutline,
  opts: {
    topic: string;
    level?: string;
    language?: string;
    ragContext: string;
    webContext: string;
    highQuality?: boolean;
  },
): Promise<GeneratedScene> {
  const task = opts.highQuality ? 'generation-quality' : 'generation-draft';
  const { model, keyInfo } = await smartRouter.selectModel({ task });

  const typeInstructions: Record<string, string> = {
    slides: 'Create 3-5 content slides with bullet points, examples, and diagrams',
    quiz: 'Create 3-5 multiple choice questions with explanations',
    interactive: 'Create an interactive activity with step-by-step instructions',
  };

  const prompt = `Generate the full content for this educational scene:
Title: ${outline.title}
Type: ${outline.type}
Key points to cover: ${outline.keyPoints.join(', ')}
Topic context: ${opts.topic}${opts.level ? ` (${opts.level} level)` : ''}

Instructions: ${typeInstructions[outline.type] || typeInstructions.slides}

Return a valid JSON object with this structure:
{
  "title": "${outline.title}",
  "type": "${outline.type}",
  "speakerNotes": "Full narration script for this scene (3-5 sentences, engaging and educational)",
  "content": {
    // For slides: { "slides": [{ "heading": "...", "bullets": [...], "example": "..." }] }
    // For quiz: { "questions": [{ "question": "...", "options": [...], "correct": 0, "explanation": "..." }] }
    // For interactive: { "activity": "...", "steps": [...], "outcomes": [...] }
  }
}
${opts.language && opts.language !== 'en' ? `All content in language: ${opts.language}` : ''}`;

  const { text, usage } = await generateText({ model, prompt });
  await smartRouter.recordUsage(keyInfo, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Failed to parse scene content for ${outline.id}`);

  const parsed = JSON.parse(jsonMatch[0]) as Omit<GeneratedScene, 'id'>;

  return {
    id: outline.id,
    title: parsed.title || outline.title,
    type: parsed.type || outline.type,
    content: (parsed.content as Record<string, unknown>) || {},
    speakerNotes: parsed.speakerNotes || outline.speakerNotes,
  };
}

// ---------------------------------------------------------------------------
// TTS Pre-rendering
// ---------------------------------------------------------------------------

async function renderTTSAudio(
  scenes: GeneratedScene[],
  packageDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { getTTSConfig } = await import('@/lib/db/config');
  const ttsConfig = await getTTSConfig();

  const audioDir = path.join(packageDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  let done = 0;
  for (const scene of scenes) {
    if (!scene.speakerNotes?.trim()) {
      done++;
      onProgress?.(done, scenes.length);
      continue;
    }

    try {
      const audioPath = path.join(audioDir, `${scene.id}.mp3`);

      const res = await fetch(`${ttsConfig.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ttsConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: 'kokoro',
          input: scene.speakerNotes,
          voice: ttsConfig.defaultVoice,
          response_format: 'mp3',
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(audioPath, Buffer.from(buffer));
        scene.audioPath = `audio/${scene.id}.mp3`;
        log.info(`  TTS rendered: ${scene.id}`);
      } else {
        log.warn(`  TTS failed for scene ${scene.id}: HTTP ${res.status}`);
      }
    } catch (err) {
      log.warn(`  TTS error for scene ${scene.id}:`, err);
    }

    done++;
    onProgress?.(done, scenes.length);
  }
}

// ---------------------------------------------------------------------------
// Tag matching — extract likely tags from topic by matching against known tags
// ---------------------------------------------------------------------------

async function matchTopicToTags(topic: string): Promise<string[]> {
  try {
    const { db } = await import('@/lib/db');
    const { knowledgeDoc } = await import('@/lib/db/schema');

    const rows = await db
      .selectDistinct({ tags: knowledgeDoc.tags })
      .from(knowledgeDoc);

    // Collect all unique tags from the database
    const allTags = new Set<string>();
    for (const row of rows) {
      if (row.tags) {
        for (const t of row.tags.split(',')) {
          const tag = t.trim().toLowerCase();
          if (tag) allTags.add(tag);
        }
      }
    }

    if (allTags.size === 0) return [];

    // Match topic words/phrases against available tags
    const topicLower = topic.toLowerCase();
    const topicWords = topicLower.split(/[\s,.\-—:;()[\]]+/).filter((w) => w.length >= 2);

    const matched: string[] = [];
    for (const tag of allTags) {
      // Direct substring match: tag appears in topic, or a topic word matches the tag
      if (topicLower.includes(tag) || topicWords.some((w) => tag.includes(w) || w.includes(tag))) {
        matched.push(tag);
      }
    }

    return matched;
  } catch (err) {
    log.warn('Failed to match topic to tags:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function registerCourse(data: {
  id: string;
  userId: string;
  topic: string;
  level?: string;
  packagePath: string;
  status: string;
}): Promise<void> {
  const { db } = await import('@/lib/db');
  const { course } = await import('@/lib/db/schema');

  await db.insert(course).values({
    id: data.id,
    userId: data.userId,
    title: data.topic,
    topic: data.topic,
    level: data.level,
    sceneCount: 0,
    packagePath: data.packagePath,
    status: data.status,
    generationCostUsd: 0,
  });
}

async function updateCourseRecord(data: {
  id: string;
  title?: string;
  sceneCount?: number;
  status?: string;
}): Promise<void> {
  const { db } = await import('@/lib/db');
  const { course } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  await db
    .update(course)
    .set({
      ...(data.title != null && { title: data.title }),
      ...(data.sceneCount != null && { sceneCount: data.sceneCount }),
      ...(data.status != null && { status: data.status }),
    })
    .where(eq(course.id, data.id));
}

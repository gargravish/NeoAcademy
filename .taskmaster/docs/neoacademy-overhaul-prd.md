# NeoAcademy Overhaul - Final Product Requirements Document

**Version**: 3.0 (Final)
**Date**: 19 March 2026

---

## 1. Overview

NeoAcademy is an AI-powered learning platform for generating and delivering interactive lessons on any topic. This overhaul transforms it from a runtime-dependent system into a **pre-generation + local-runtime** architecture that minimizes cost while maximizing quality, and adds **user authentication** and an **admin portal** for centralized management.

### Core Principles

1. **Two-Phase Architecture**: Generation (cloud APIs, batch) → Runtime (local, instant)
2. **Cost Minimization**: Free tiers first, cheap pay-as-you-go second, capped paid last
3. **100% Local-First**: No cloud dependencies for auth, database, or runtime
4. **Admin Portal**: Centralized API config, user management, usage monitoring
5. **Knowledge Base**: RAG with local vector DB for personalized learning

---

## 2. Current Infrastructure

### Server: 192.168.70.10 (Already Running)

| Service | Port | Protocol | Model/Engine |
|---------|------|----------|-------------|
| Ollama (Qwen 3.5) | 11434 | OpenAI-compatible | qwen3.5:latest |
| Kokoro TTS | 8880 | OpenAI-compatible | kokoro-82m (54 voices, 8 languages) |
| Whisper ASR | 8881 | OpenAI-compatible | whisper |

### Current .env.local

```
GOOGLE_API_KEY=AIzaSyAoK3ipcmw03nJ5-T09VrfWZ8IK2F46oTM
GOOGLE_MODELS=gemini-3-flash-preview,gemini-3-pro-preview,gemini-2.5-flash
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://192.168.70.10:11434/v1
OPENAI_MODELS=qwen3.5:latest
DEFAULT_MODEL=openai:qwen3.5:latest
TTS_OPENAI_API_KEY=kokoro
TTS_OPENAI_BASE_URL=http://192.168.70.10:8880/v1
ASR_OPENAI_API_KEY=whisper
ASR_OPENAI_BASE_URL=http://192.168.70.10:8881/v1
LOG_LEVEL=info
```

### Existing Subscriptions (Keeping)

- **ChatGPT Plus** ($20/month) — daily coding across multiple apps + OpenClaw instance

---

## 3. Provider Strategy

### 3.1 Gemini Multi-Key Rotation (Generation — Primary)

Create 3-5 separate Google Cloud projects. Each gets independent free tier quotas (per-project, not per-billing-account).

| Key Slot | Type | Daily Limit (Flash-Lite) | Daily Limit (Flash) |
|----------|------|--------------------------|---------------------|
| GEMINI_KEY_1 | Free (Project A) | 1,000 RPD | 250 RPD |
| GEMINI_KEY_2 | Free (Project B) | 1,000 RPD | 250 RPD |
| GEMINI_KEY_3 | Free (Project C) | 1,000 RPD | 250 RPD |
| GEMINI_KEY_PAID | Tier 1 (billing, £5 cap) | ~25,000 RPD | ~4,400 RPD |

**Total free capacity**: 3,000 RPD = ~75-120 full courses/day

**Rotation logic**:
1. Round-robin across free keys per request
2. On HTTP 429, mark key as exhausted for current period
3. Try next free key
4. All free keys exhausted → fall through to SiliconFlow
5. SiliconFlow exhausted → use paid Gemini key (if configured)
6. Paid key at budget cap → queue for retry after midnight Pacific reset
7. Track usage per key in SQLite, reset daily

**Models**:
- `gemini-2.5-flash-lite` — fast, cheap, default for most generation
- `gemini-2.5-flash` — higher quality for complex content
- `gemini-2.5-pro` — premium, used sparingly
- `gemini-embedding-001` — embeddings (free, no token cost)

### 3.2 SiliconFlow (Generation — Secondary/Overflow)

- **Signup**: cloud.siliconflow.com (Google/GitHub OAuth, no Chinese phone needed)
- **Free credits**: $1 on signup
- **API endpoint**: https://api.siliconflow.cn/v1 (OpenAI-compatible)
- **Already supported** in NeoAcademy codebase (provider ID: `siliconflow`)

| Model | Input $/M | Output $/M | Best For |
|-------|-----------|------------|----------|
| GLM-5 | $0.30 | $2.55 | Reasoning, quiz generation |
| MiniMax-M2.5 | $0.30 | $1.20 | Code, interactive HTML sims |
| Kimi-K2.5 | ~$0.45 | ~$2.20 | Long context, multimedia |
| Qwen models | $0.02-0.40 | $0.04-1.20 | General purpose |

### 3.3 ChatGPT Plus (Clarification)

ChatGPT Plus ($20/month) does NOT include API access — they are separate billing systems. OpenAI API is available as an **optional provider** in the admin panel (GPT-5-nano costs ~$0.50/month for 30 lessons). Not required — Gemini free + SiliconFlow cover everything.

### 3.4 Alibaba Coding Plan (Clarification)

The $10/month plan is **restricted to interactive coding tools** (Cursor, Cline, OpenClaw). Cannot be used for NeoAcademy backend. SiliconFlow provides the same models at cheap pay-as-you-go rates with no restrictions.

### 3.5 Ollama Qwen 3.5 (Runtime — Local)

- **Endpoint**: http://192.168.70.10:11434/v1
- **Model**: qwen3.5:latest
- **Use for**: All runtime operations (chat, Q&A, quiz grading)
- **Cost**: $0

### 3.6 Kokoro TTS + Whisper ASR (Local)

- **Kokoro TTS**: http://192.168.70.10:8880/v1 (54 voices, 8 languages)
- **Whisper ASR**: http://192.168.70.10:8881/v1
- **Cost**: $0

### 3.7 Provider Fallback Chain

```
Generation request
  ├─► Gemini Free Key Pool (3 keys, round-robin)
  │     └── All exhausted ↓
  ├─► SiliconFlow ($1 free credit, then cheap)
  │     └── Budget limit or error ↓
  ├─► Gemini Paid Key (Tier 1, £5/month cap)
  │     └── At cap ↓
  ├─► OpenAI API (optional, if configured)
  │     └── Error ↓
  └─► Queue for retry (next daily reset)
```

---

## 4. Authentication & Database (100% Local)

### 4.1 Technology Stack

| Component | Library | Why |
|-----------|---------|-----|
| **Auth** | Better Auth | TypeScript-first, built-in RBAC, session cookies, zero cloud dependency |
| **Database** | SQLite via better-sqlite3 | Single file, zero config, no external server |
| **ORM** | Drizzle ORM | Type-safe, lightweight, excellent SQLite support |
| **Password hashing** | bcrypt (built into Better Auth) | Industry standard |
| **Sessions** | httpOnly signed cookies | Secure, no JWT complexity |

### 4.2 Why Better Auth + SQLite (Not Firebase)

| Factor | Better Auth + SQLite | Firebase Auth + Firestore |
|--------|---------------------|--------------------------|
| **Cloud dependency** | None | Google Cloud required |
| **Setup complexity** | `npm install` + single config file | Firebase project, SDK config, credentials |
| **Data location** | Single `data/neoacademy.db` file | Google servers |
| **Offline capability** | 100% works offline | Requires internet |
| **Cost** | $0 forever | Free tier, but lock-in |
| **Backup** | Copy one file | Firebase export tools |
| **Privacy** | Data never leaves your network | Data on Google servers |
| **For a family app** | Perfect | Overkill |

### 4.3 Database Schema (SQLite via Drizzle)

```sql
-- Better Auth managed tables (auto-generated)
users (id, name, email, emailVerified, image, role, createdAt, updatedAt)
sessions (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
accounts (id, userId, accountId, providerId, ...)
verifications (id, identifier, value, expiresAt, createdAt, updatedAt)

-- NeoAcademy custom tables
provider_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,        -- 'gemini', 'siliconflow', 'openai', 'ollama', 'tts', 'asr'
  config JSON NOT NULL,          -- { apiKeys: [...], baseUrl, model, enabled, ... }
  updated_at INTEGER NOT NULL
)

provider_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,             -- '2026-03-19'
  provider TEXT NOT NULL,
  key_hash TEXT,                  -- hashed API key identifier
  requests INTEGER DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0.0,
  updated_at INTEGER NOT NULL
)

courses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  level TEXT,                     -- 'GCSE', 'A-Level', 'University', 'General'
  scene_count INTEGER DEFAULT 0,
  package_path TEXT NOT NULL,     -- 'data/courses/{id}/'
  generation_cost_usd REAL DEFAULT 0.0,
  created_at INTEGER NOT NULL
)

knowledge_docs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,        -- 'pdf', 'txt', 'md', 'url', 'image'
  chunk_count INTEGER DEFAULT 0,
  size_bytes INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
)

learning_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  completed_scenes TEXT,          -- JSON array of scene IDs
  quiz_scores TEXT,               -- JSON { sceneId: score }
  time_spent_seconds INTEGER DEFAULT 0,
  last_activity INTEGER NOT NULL,
  UNIQUE(user_id, course_id)
)

app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON value
)
```

### 4.4 User Roles

| Role | Access |
|------|--------|
| **admin** | Full access: admin portal, API config, user management, all features |
| **learner** | Course generation, playback, chat, knowledge base, progress |

### 4.5 Auth Flow

```
1. User visits NeoAcademy → redirected to /login if no valid session
2. Sign in with email + password (Better Auth handles hashing + validation)
3. Better Auth creates httpOnly signed session cookie
4. Next.js middleware (proxy.ts) validates session on every request
5. Server components/API routes access user via auth.api.getSession()
6. Admin routes check role === 'admin'
7. First user registered becomes admin automatically (seeded via setup wizard)
```

### 4.6 Initial Setup Wizard

On first launch (empty database), NeoAcademy shows a setup wizard:
1. Create admin account (email + password)
2. Configure primary API provider (paste Gemini API key)
3. Test connectivity to Ollama/Kokoro/Whisper servers
4. Done — ready to use

---

## 5. Admin Portal

### 5.1 Technology

- Built with existing **shadcn/ui components** (already in NeoAcademy)
- Route group: `/admin/*` (protected by admin role check)
- Data from SQLite (no external dependencies)
- No additional UI libraries needed

### 5.2 Admin Pages

#### 5.2.1 Dashboard (`/admin`)
- Overview cards: total users, courses generated, storage used
- Today's API usage: requests per provider, cost estimate
- Recent activity log
- System health: Ollama, Kokoro TTS, Whisper connectivity status (live ping)

#### 5.2.2 API Configuration (`/admin/providers`)
- **Gemini Keys**: Add/remove free tier keys, view usage per key, add/remove paid key, set £ cap
- **SiliconFlow**: Configure API key, view spend
- **OpenAI** (optional): Configure API key
- **Ollama**: Server URL, model, connectivity test button
- **Kokoro TTS**: Server URL, default voice, test button
- **Whisper ASR**: Server URL, test button
- **Web Search**: Tavily, Brave, DuckDuckGo API keys
- **Fallback Chain**: Drag-and-drop reorder of provider priority
- **Budget Caps**: Monthly spending limits per provider
- All config stored in SQLite `provider_configs` table (hot-reloaded, no restart needed)

#### 5.2.3 User Management (`/admin/users`)
- List all users with role, last activity, courses count
- Change user roles (admin/learner)
- Create new users
- Disable/enable accounts
- Reset passwords

#### 5.2.4 Course Management (`/admin/courses`)
- List all generated course packages
- View metadata: topic, creator, scenes, size, date, generation cost
- Delete course packages (removes files + DB record)
- Export/import course packages

#### 5.2.5 Knowledge Base Management (`/admin/knowledge-base`)
- View all uploaded documents across all users
- Storage usage per user
- Delete documents (removes vectors from LanceDB + DB record)

#### 5.2.6 Usage & Billing (`/admin/usage`)
- Daily/weekly/monthly API usage charts (from `provider_usage` table)
- Cost breakdown by provider
- Gemini key rotation stats (requests per key per day)
- Budget alerts and cap status

### 5.3 Config Storage: SQLite (Not .env)

Provider configuration is stored in the `provider_configs` SQLite table, loaded at runtime and cached in memory. Changes from the admin UI take effect immediately without server restart.

The `.env.local` file is only for **bootstrap** (initial setup before the database exists) and **secrets that shouldn't be in a DB** (like the auth cookie signing keys). Once the admin portal is configured, `.env.local` values serve as fallback defaults only.

---

## 6. Smart Model Router

### 6.1 Architecture

```
SmartModelRouter
├── GeminiKeyPool
│   ├── Free keys (round-robin, 429 detection, daily reset)
│   └── Paid key (spend tracking, £ cap from admin config)
├── SiliconFlowProvider
│   ├── Spend tracking
│   └── Model selection (GLM-5, MiniMax, Kimi, Qwen)
├── OpenAIProvider (optional, if configured)
│   └── GPT-5-nano or GPT-4o-mini
├── Config source: SQLite provider_configs (with .env fallback)
├── Task-to-Model mapping:
│   ├── outline → gemini-2.5-flash-lite (fast, free)
│   ├── slide_content → gemini-2.5-flash-lite or gemini-2.5-flash
│   ├── quiz → gemini-2.5-flash or siliconflow:glm-5 (reasoning)
│   ├── interactive_html → siliconflow:minimax-m2.5 (best coding)
│   ├── explanation → gemini-2.5-flash (quality)
│   ├── embedding → gemini-embedding-001 (free)
│   └── grading → ollama:qwen3.5 (local, runtime)
└── Fallback chain: configurable via admin portal
```

### 6.2 Usage Tracking

All usage written to SQLite `provider_usage` table:

```json
{
  "date": "2026-03-19",
  "provider": "gemini",
  "key_hash": "a1b2c3...",
  "requests": 450,
  "tokens_in": 225000,
  "tokens_out": 180000,
  "cost_usd": 0.00
}
```

Admin dashboard queries this table for charts and reports.

---

## 7. Content Pre-Generation Pipeline

### 7.1 One-Shot Generation Flow

```
User Input:
├── Topic: "Photosynthesis"
├── Learning level: "GCSE" / "A-Level" / "University" / "General"
├── Optional: uploaded materials (PDFs, notes, images)
├── Optional: specific subtopics to cover
└── Optional: number of scenes / lesson duration

    ↓

Step 1: Knowledge Gathering (parallel)
├── RAG retrieval from LanceDB (user's uploaded materials)
├── Web search (DuckDuckGo + Brave + Tavily free tiers)
└── Merge into enriched context document

    ↓

Step 2: Outline Generation (1 API call via SmartModelRouter)
├── Input: topic + level + context + requirements
├── Output: complete scene outlines with types, objectives, key points
└── Scene types: slide, quiz, interactive, pbl

    ↓

Step 3: Scene Content Generation (N batched API calls)
├── Slides: content + speaker notes for TTS
├── Quizzes: questions + rubrics + model answers
├── Interactive: HTML5 simulations
├── PBL: project scenarios + roles
└── Concurrency limit configurable in admin (default: 3 parallel)

    ↓

Step 4: Audio Pre-Rendering (N TTS calls to Kokoro @ :8880)
├── For each scene with speaker notes
├── Output: MP3 files stored in course package
└── Voice: configurable per course (default from admin config)

    ↓

Step 5: Package & Store
├── Save files to data/courses/{id}/
├── Record metadata in SQLite courses table
├── Record generation costs in provider_usage table
├── Notify user: "Course ready!"
└── Total time: 5-15 minutes depending on size
```

### 7.2 Course Package Structure

```
data/courses/{course-id}/
├── metadata.json           # title, topic, level, generation stats
├── outline.json            # scene outlines with learning objectives
├── scenes/
│   ├── scene-001.json      # full slide/quiz/interactive content
│   ├── scene-002.json
│   └── ...
├── audio/
│   ├── scene-001-narration.mp3
│   ├── scene-002-narration.mp3
│   └── ...
├── context/
│   ├── rag-chunks.json     # RAG context used
│   ├── web-results.json    # cached web search results
│   └── sources.json        # all sources cited
└── assets/
    └── images/
```

---

## 8. RAG System (Knowledge Base)

### 8.1 Vector Store: LanceDB

- **In-process** (no separate server)
- **Storage**: `data/vectordb/`
- **Embeddings**: Gemini `gemini-embedding-001` (free, uses key rotation)
- **Fallback**: Local `all-MiniLM-L6-v2` via Ollama if Gemini unavailable

### 8.2 Document Ingestion

```
Upload → Parse → Chunk → Embed → Store in LanceDB + record in SQLite

Supported formats:
├── PDF (existing unpdf parser)
├── Plain text / Markdown
├── Images with text (Gemini vision for OCR)
├── URLs (fetch + extract text)
└── YouTube (transcript extraction)

Chunking: LangChain RecursiveCharacterTextSplitter
├── chunk_size: 1000 tokens
├── chunk_overlap: 200 tokens
└── metadata: source, page, user_id, upload date
```

### 8.3 Collections (LanceDB tables)

```
├── knowledge_{userId}   # per-user uploaded materials
├── course_{courseId}    # generated course context
└── web_cache            # cached web search results
```

### 8.4 Retrieval

- **Generation**: Top-K (k=10) chunks injected into prompts
- **Runtime chat**: Top-K (k=5) chunks for Ollama context
- **Hybrid**: Vector similarity + keyword matching

---

## 9. Web Search Integration

| Provider | Free Tier | Priority |
|----------|-----------|----------|
| DuckDuckGo | Unlimited (unofficial) | 1st |
| Brave Search | 2,000/month | 2nd |
| Tavily (existing) | 1,000/month | 3rd |

Runs only during generation. Results cached in course package.

---

## 10. Updated .env.local Configuration

```env
# ═══════════════════════════════════════════════════════════════
# AUTH (Better Auth)
# ═══════════════════════════════════════════════════════════════
BETTER_AUTH_SECRET=generate-a-random-32-char-string-here
BETTER_AUTH_URL=http://localhost:3000

# ═══════════════════════════════════════════════════════════════
# DATABASE (SQLite — single file, zero config)
# ═══════════════════════════════════════════════════════════════
DATABASE_PATH=./data/neoacademy.db

# ═══════════════════════════════════════════════════════════════
# GEMINI MULTI-KEY ROTATION (Generation — Primary)
# ═══════════════════════════════════════════════════════════════
GEMINI_FREE_KEYS=AIzaSyAoK3ipcmw03nJ5-T09VrfWZ8IK2F46oTM,KEY2,KEY3
GEMINI_PAID_KEY=
GEMINI_PAID_MONTHLY_CAP_GBP=5.00

# ═══════════════════════════════════════════════════════════════
# SILICONFLOW (Generation — Secondary)
# ═══════════════════════════════════════════════════════════════
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1

# ═══════════════════════════════════════════════════════════════
# OLLAMA (Runtime — Local Server)
# ═══════════════════════════════════════════════════════════════
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://192.168.70.10:11434/v1
OPENAI_MODELS=qwen3.5:latest
DEFAULT_MODEL=openai:qwen3.5:latest

# ═══════════════════════════════════════════════════════════════
# KOKORO TTS (Local Server)
# ═══════════════════════════════════════════════════════════════
TTS_OPENAI_API_KEY=kokoro
TTS_OPENAI_BASE_URL=http://192.168.70.10:8880/v1

# ═══════════════════════════════════════════════════════════════
# WHISPER ASR (Local Server)
# ═══════════════════════════════════════════════════════════════
ASR_OPENAI_API_KEY=whisper
ASR_OPENAI_BASE_URL=http://192.168.70.10:8881/v1

# ═══════════════════════════════════════════════════════════════
# WEB SEARCH
# ═══════════════════════════════════════════════════════════════
TAVILY_API_KEY=
BRAVE_SEARCH_API_KEY=

# ═══════════════════════════════════════════════════════════════
# GOOGLE (backward compat — existing code)
# ═══════════════════════════════════════════════════════════════
GOOGLE_API_KEY=AIzaSyAoK3ipcmw03nJ5-T09VrfWZ8IK2F46oTM
GOOGLE_MODELS=gemini-3-flash-preview,gemini-3-pro-preview,gemini-2.5-flash

# ═══════════════════════════════════════════════════════════════
# MISC
# ═══════════════════════════════════════════════════════════════
LOG_LEVEL=info
```

---

## 11. Files to Modify

| File | Change |
|------|--------|
| `lib/ai/providers.ts` | Add Gemini rotation provider, load config from SQLite |
| `lib/ai/llm.ts` | Hook SmartModelRouter into callLLM for generation |
| `lib/server/provider-config.ts` | Add SQLite config source with .env fallback |
| `lib/server/classroom-generation.ts` | Refactor for batch pre-generation |
| `lib/generation/outline-generator.ts` | Accept RAG context + web search |
| `lib/generation/scene-generator.ts` | Accept RAG context, generate speaker notes |
| `lib/web-search/constants.ts` | Add DuckDuckGo and Brave providers |
| `app/api/generate-classroom/route.ts` | Add RAG + web search to pipeline |
| `app/layout.tsx` | Add auth session provider wrapper |
| `next.config.ts` | Add better-sqlite3 to serverExternalPackages |
| `package.json` | Add better-auth, better-sqlite3, drizzle-orm, drizzle-kit |
| `.env.example` | Add all new variables |

## 12. New Files to Create

### Database & Auth

| File | Purpose |
|------|---------|
| `lib/db/index.ts` | SQLite + Drizzle initialization (single `data/neoacademy.db`) |
| `lib/db/schema.ts` | Drizzle schema (all tables defined in §4.3) |
| `lib/db/migrate.ts` | Run migrations on startup |
| `drizzle.config.ts` | Drizzle Kit configuration for SQLite |
| `lib/auth/index.ts` | Better Auth server config (email/password, RBAC) |
| `lib/auth/client.ts` | Better Auth client (React hooks: useSession, signIn, signOut) |
| `lib/auth/middleware.ts` | Session validation for Next.js middleware |
| `proxy.ts` | Next.js 16 middleware — auth check on protected routes |
| `app/login/page.tsx` | Login page (email + password form) |
| `app/setup/page.tsx` | First-run setup wizard (create admin, configure providers) |
| `app/api/auth/[...all]/route.ts` | Better Auth API handler (auto-handles all auth endpoints) |

### Admin Portal

| File | Purpose |
|------|---------|
| `app/admin/layout.tsx` | Admin layout with sidebar, admin role guard |
| `app/admin/page.tsx` | Dashboard (overview, health, activity) |
| `app/admin/providers/page.tsx` | API provider configuration |
| `app/admin/users/page.tsx` | User management |
| `app/admin/courses/page.tsx` | Course management |
| `app/admin/knowledge-base/page.tsx` | Knowledge base management |
| `app/admin/usage/page.tsx` | Usage & billing charts |
| `components/admin/provider-config-form.tsx` | Provider config forms |
| `components/admin/user-table.tsx` | User list + role management |
| `components/admin/usage-charts.tsx` | Usage visualization |
| `components/admin/health-status.tsx` | Server connectivity cards |

### Smart Model Router & Key Rotation

| File | Purpose |
|------|---------|
| `lib/ai/gemini-key-pool.ts` | Multi-key rotation, 429 detection, daily reset |
| `lib/ai/smart-model-router.ts` | Task-based model selection, fallback chain |
| `lib/ai/provider-usage-tracker.ts` | Usage stats → SQLite provider_usage table |

### RAG / Knowledge Base

| File | Purpose |
|------|---------|
| `lib/rag/vector-store.ts` | LanceDB integration |
| `lib/rag/document-processor.ts` | Parse, chunk, embed pipeline |
| `lib/rag/embeddings.ts` | Gemini embedding-001 with key rotation |
| `lib/rag/types.ts` | RAG types |
| `app/api/knowledge-base/route.ts` | Upload, list, delete documents |
| `components/knowledge-base/upload-panel.tsx` | Drag-and-drop upload |
| `components/knowledge-base/document-library.tsx` | Browse documents |

### Pre-Generation & Course Management

| File | Purpose |
|------|---------|
| `lib/generation/batch-generator.ts` | One-shot full course generator |
| `lib/generation/audio-batch.ts` | Bulk Kokoro TTS rendering |
| `lib/storage/course-package.ts` | Course package CRUD |
| `app/api/courses/route.ts` | List, load, delete courses |
| `components/course-library/course-list.tsx` | Browse courses |
| `components/generation/generation-progress.tsx` | Real-time progress UI |

### Web Search

| File | Purpose |
|------|---------|
| `lib/web-search/duckduckgo.ts` | DuckDuckGo search provider |
| `lib/web-search/brave.ts` | Brave Search provider |

---

## 13. Implementation Phases

### Phase A: Database + Auth + Admin Foundation (Week 1)
1. Install better-auth, better-sqlite3, drizzle-orm, drizzle-kit
2. Create SQLite database schema (all tables in §4.3)
3. Set up Better Auth with email/password + admin/learner roles
4. Build login page + auth middleware (proxy.ts)
5. Build first-run setup wizard (/setup)
6. Build admin layout with sidebar + role guard
7. Build admin dashboard (overview cards, server health pings)
8. Build provider configuration page (CRUD to SQLite)
9. Build user management page (list, roles, create, reset password)
10. **Test**: first-run wizard → admin created → login → admin pages → provider config saved

### Phase B: Smart Model Router + Gemini Key Rotation (Week 2)
11. Build `GeminiKeyPool` with multi-key rotation + 429 detection + daily reset
12. Build `SmartModelRouter` with task-based selection + configurable fallback chain
13. Build `ProviderUsageTracker` writing to SQLite
14. Load provider config from SQLite (with .env fallback)
15. Add SiliconFlow overflow support
16. Build usage & billing admin page (charts from SQLite data)
17. **Test**: key rotation works, fallback triggers, usage tracked, charts render

### Phase C: RAG / Knowledge Base (Week 3)
18. Integrate LanceDB
19. Build document processor (parse, chunk)
20. Build embedding client (Gemini embedding-001 + key rotation)
21. Build vector search (similarity + hybrid)
22. Create knowledge base API routes
23. Create upload panel + document library UI
24. Build knowledge base admin page
25. **Test**: upload PDF → chunks stored → relevant retrieval on query

### Phase D: Content Pre-Generation Engine (Weeks 4-5)
26. Build batch generator (one-shot full course)
27. Integrate RAG context into generation prompts
28. Add web search enrichment (DuckDuckGo + Brave + existing Tavily)
29. Build audio batch renderer (Kokoro TTS for all scenes)
30. Build course package storage + SQLite metadata
31. Create course library UI
32. Create generation progress UI
33. Build course management admin page
34. **Test**: topic → complete course → all audio rendered

### Phase E: Runtime + Playback Integration (Week 6)
35. Instant playback from pre-generated course packages
36. Wire Ollama Qwen 3.5 for runtime chat with RAG context
37. Integrate Kokoro TTS for dynamic runtime speech
38. Integrate Whisper ASR for voice input
39. Learning progress tracking (SQLite learning_progress table)
40. **Test**: full end-to-end flow with authentication

---

## 14. Cost Summary

### Monthly Operating Cost

| Component | Cost |
|-----------|------|
| ChatGPT Plus (kept for daily coding + OpenClaw) | £16 ($20) |
| Gemini free tier (3 project keys) | £0 |
| SiliconFlow ($1 free credit, then cheap overflow) | £0-1 |
| Gemini Tier 1 paid (capped) | up to £5 |
| SQLite + Better Auth (local) | £0 |
| Ollama + Kokoro TTS + Whisper (local server) | £0 |
| LanceDB (local) | £0 |
| Web search (free tiers) | £0 |
| **NeoAcademy app cost** | **£0-6/month** |
| **Total including ChatGPT Plus** | **£16-22/month** |

### Zero Cloud Dependencies

| What | Where |
|------|-------|
| Auth + sessions | SQLite (local file) |
| User data + progress | SQLite (local file) |
| Provider config | SQLite (local file) |
| Usage tracking | SQLite (local file) |
| Vector embeddings | LanceDB (local directory) |
| Course packages | File system (local directory) |
| Client-side cache | IndexedDB (browser, existing) |
| LLM runtime | Ollama (local server) |
| TTS | Kokoro (local server) |
| STT | Whisper (local server) |

The only cloud calls are to Gemini/SiliconFlow APIs during content **generation** — and those are optional if you pre-generate everything.

---

## 15. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS APP (localhost:3000)                   │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐  │
│  │ /login     │  │ /admin/*   │  │ /        │  │ /classroom │  │
│  │ /setup     │  │ Dashboard  │  │ Home +   │  │ Lesson     │  │
│  │ Auth pages │  │ Providers  │  │ Generate │  │ Playback   │  │
│  │            │  │ Users      │  │          │  │            │  │
│  │            │  │ Courses    │  │          │  │            │  │
│  │            │  │ Usage      │  │          │  │            │  │
│  └────────────┘  └────────────┘  └──────────┘  └────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    SERVER LAYER                            │   │
│  │                                                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌───────────┐ │   │
│  │  │ Better   │  │ Smart    │  │ LanceDB │  │ Course    │ │   │
│  │  │ Auth     │  │ Model    │  │ (RAG)   │  │ Packages  │ │   │
│  │  │          │  │ Router   │  │         │  │           │ │   │
│  │  └────┬─────┘  └────┬─────┘  └─────────┘  └───────────┘ │   │
│  │       │              │                                     │   │
│  │  ┌────┴──────────────┴─────────────────────────────────┐  │   │
│  │  │            SQLite (data/neoacademy.db)               │  │   │
│  │  │  users │ sessions │ provider_configs │ courses │ ... │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────────┐
        │   GENERATION     │     RUNTIME           │
        │                  │                        │
        │  Gemini Free ────┤──── Ollama Qwen 3.5   │
        │  (3 keys)        │     192.168.70.10      │
        │       ↓          │     :11434             │
        │  SiliconFlow     │                        │
        │       ↓          │──── Kokoro TTS         │
        │  Gemini Paid     │     :8880              │
        │  (£5 cap)        │                        │
        │                  │──── Whisper ASR        │
        │  Web Search      │     :8881              │
        │  (DDG+Brave+     │                        │
        │   Tavily)        │                        │
        └──────────────────┴────────────────────────┘
```

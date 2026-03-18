<p align="center">
  <img src="assets/banner.png" alt="NeoAcademy Banner" width="680"/>
</p>

<p align="center">
  <strong>AI-Powered Interactive Classroom — Learn anything with multi-agent AI teachers</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg?style=flat-square" alt="License: AGPL-3.0"/></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js"/>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/LangGraph-1.1-purple?style=flat-square" alt="LangGraph"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
</p>

---

## Overview

**NeoAcademy** is an AI-powered interactive classroom platform that turns any topic or document into a rich, immersive learning experience. Powered by multi-agent orchestration, it generates slides, quizzes, interactive simulations, and project-based learning activities — all delivered by AI teachers and AI classmates who can speak, draw on a whiteboard, and engage in real-time discussions with you.

Built for **local-first AI** — runs primarily on local models (Ollama) with optional cloud providers for enhanced capabilities.

### Highlights

- **One-click lesson generation** — Describe a topic or attach your materials; the AI builds a full lesson in minutes
- **Multi-agent classroom** — AI teachers and peers lecture, discuss, and interact with you in real time
- **Rich scene types** — Slides, quizzes, interactive HTML simulations, and project-based learning (PBL)
- **Whiteboard & TTS** — Agents draw diagrams, write formulas, and explain out loud with natural-sounding voices
- **Export anywhere** — Download editable `.pptx` slides or interactive `.html` pages
- **Local-first** — Designed to run on local LLMs (Ollama), local TTS (Kokoro), and local ASR (Whisper)

---

## Architecture

NeoAcademy is designed for a self-hosted, local-first deployment:

```
┌─────────────────────────────────────────────────┐
│                  NeoAcademy                       │
│            (Next.js 16 + React 19)                │
│               LXC / Server                        │
└────────┬──────────────┬──────────────┬───────────┘
         │              │              │
    ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐
    │ Ollama  │   │ Kokoro TTS│  │ Whisper │
    │ Qwen3.5 │   │ Port 8880 │  │  ASR    │
    │ :11434  │   │ (54 voices│  │ Port 8881│
    │ (Local) │   │  CPU/ONNX)│  │ (CPU)   │
    └─────────┘   └───────────┘  └─────────┘
         │
    ┌────▼─────┐
    │ Gemini   │  (Optional — for slides,
    │ API      │   images, heavy generation)
    └──────────┘
```

| Component | Purpose | Model | Runs On |
|-----------|---------|-------|---------|
| **Ollama (Qwen3.5)** | Main LLM for lesson generation, chat, orchestration | Qwen3.5 (local) | CPU/GPU |
| **Kokoro TTS** | Natural text-to-speech for AI teacher voices | Kokoro v1.0 (82M ONNX) | CPU |
| **Whisper ASR** | Speech-to-text for talking to AI teachers | faster-whisper base (int8) | CPU |
| **Gemini API** | Optional cloud LLM for higher-quality generation | Gemini 3 Flash / Pro | Cloud |

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 10
- **Ollama** with a model pulled (e.g., `qwen3.5:latest`)

### 1. Clone & Install

```bash
git clone https://github.com/gargravish/NeoAcademy.git
cd NeoAcademy
pnpm install
```

### 2. Configure

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Local LLM via Ollama (OpenAI-compatible)
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODELS=qwen3.5:latest

# Default model
DEFAULT_MODEL=openai:qwen3.5:latest

# Optional: Google Gemini for higher quality
GOOGLE_API_KEY=your-gemini-key-here

# Optional: Local Kokoro TTS (OpenAI-compatible)
TTS_OPENAI_API_KEY=kokoro
TTS_OPENAI_BASE_URL=http://localhost:8880/v1

# Optional: Local Whisper ASR (OpenAI-compatible)
ASR_OPENAI_API_KEY=whisper
ASR_OPENAI_BASE_URL=http://localhost:8881/v1
```

### 3. Run

```bash
pnpm dev
```

Open **http://localhost:3000** and start learning!

### 4. Build for Production

```bash
pnpm build && pnpm start
```

### Docker Deployment

```bash
cp .env.example .env.local
# Edit .env.local with your config, then:
docker compose up --build
```

---

## Setting Up Local TTS & ASR

### Kokoro TTS (Natural AI Voices)

[Kokoro](https://github.com/thewh1teagle/kokoro-onnx) is an 82M parameter TTS model that produces natural-sounding speech on CPU via ONNX. It exposes an OpenAI-compatible API.

```bash
pip install kokoro-onnx soundfile fastapi uvicorn python-multipart
# Download models from: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
```

54 voices available across English (American/British), Hindi, Japanese, Chinese, French, Italian, Portuguese, and more.

### Whisper ASR (Local Speech Recognition)

[faster-whisper](https://github.com/SYSTRAN/faster-whisper) provides fast, accurate speech-to-text on CPU.

```bash
pip install faster-whisper fastapi uvicorn python-multipart
```

Both services expose OpenAI-compatible APIs — NeoAcademy connects to them seamlessly via `TTS_OPENAI_BASE_URL` and `ASR_OPENAI_BASE_URL`.

---

## Features

### Lesson Generation

Describe what you want to learn or attach reference materials. NeoAcademy's two-stage pipeline handles the rest:

| Stage | What Happens |
|-------|-------------|
| **Outline** | AI analyzes your input and generates a structured lesson outline |
| **Scenes** | Each outline item becomes a rich scene — slides, quizzes, interactive modules, or PBL activities |

### Classroom Components

- **🎓 Slides** — AI teachers deliver lectures with voice narration, spotlight effects, and laser pointer animations
- **🧪 Quiz** — Interactive quizzes (single/multiple choice, short answer) with real-time AI grading
- **🔬 Interactive Simulation** — HTML-based interactive experiments for hands-on learning
- **🏗️ Project-Based Learning** — Collaborate with AI agents on structured projects

### Multi-Agent Interaction

- **Classroom Discussion** — Agents proactively initiate discussions; jump in anytime
- **Roundtable Debate** — Multiple agents with different personas discuss a topic
- **Q&A Mode** — Ask questions freely; the AI teacher responds with visual aids
- **Whiteboard** — AI agents draw diagrams and solve equations in real time

### Export

| Format | Description |
|--------|-------------|
| **PowerPoint (.pptx)** | Fully editable slides with images, charts, and LaTeX formulas |
| **Interactive HTML** | Self-contained web pages with interactive simulations |

---

## Supported Providers

NeoAcademy supports multiple LLM providers through the Vercel AI SDK:

| Provider | Type | Notes |
|----------|------|-------|
| **Ollama** (any model) | OpenAI-compatible | Recommended for local-first setup |
| **Google Gemini** | Native | Best quality for slide generation |
| **OpenAI** | Native | GPT-5, GPT-4o, o3/o4 series |
| **Anthropic** | Native | Claude Opus/Sonnet/Haiku |
| **DeepSeek** | OpenAI-compatible | |
| **Qwen (DashScope)** | OpenAI-compatible | |
| **GLM (Zhipu)** | OpenAI-compatible | |
| **Kimi (Moonshot)** | OpenAI-compatible | |
| **MiniMax** | Anthropic-compatible | |
| Any OpenAI-compatible API | OpenAI-compatible | Custom providers supported |

---

## Project Structure

```
NeoAcademy/
├── app/                        # Next.js App Router
│   ├── api/                    #   Server API routes (~18 endpoints)
│   │   ├── generate/           #     Scene generation pipeline
│   │   ├── generate-classroom/ #     Async classroom job submission + polling
│   │   ├── chat/               #     Multi-agent discussion (SSE streaming)
│   │   ├── pbl/                #     Project-Based Learning endpoints
│   │   └── ...                 #     quiz-grade, parse-pdf, web-search, etc.
│   ├── classroom/[id]/         #   Classroom playback page
│   └── page.tsx                #   Home page (generation input)
│
├── lib/                        # Core business logic
│   ├── ai/                     #   LLM provider abstraction
│   ├── generation/             #   Two-stage lesson generation pipeline
│   ├── orchestration/          #   LangGraph multi-agent orchestration
│   ├── playback/               #   Playback state machine
│   ├── action/                 #   Action execution engine (28+ types)
│   ├── audio/                  #   TTS & ASR providers
│   ├── export/                 #   PPTX & HTML export
│   ├── store/                  #   Zustand state stores
│   └── ...                     #   hooks, i18n, utils
│
├── components/                 # React UI components
│   ├── slide-renderer/         #   Canvas-based slide editor
│   ├── scene-renderers/        #   Quiz, Interactive, PBL renderers
│   ├── whiteboard/             #   SVG-based whiteboard
│   ├── chat/                   #   Chat area & session management
│   └── ...                     #   settings, agent, audio
│
├── packages/                   # Workspace packages
│   ├── pptxgenjs/              #   Customized PowerPoint generation
│   └── mathml2omml/            #   MathML → Office Math conversion
│
└── configs/                    # Shared constants
```

### Key Architecture

- **Generation Pipeline** (`lib/generation/`) — Two-stage: outline generation → scene content generation
- **Multi-Agent Orchestration** (`lib/orchestration/`) — LangGraph state machine managing agent turns and discussions
- **Playback Engine** (`lib/playback/`) — State machine driving classroom playback and live interaction
- **Action Engine** (`lib/action/`) — Executes 28+ action types (speech, whiteboard, spotlight, laser, etc.)

---

## Contributing

Contributions welcome! Whether it's bug reports, feature ideas, or pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Acknowledgements

NeoAcademy is forked from [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) by THU-MAIC (Tsinghua University). We gratefully acknowledge their foundational work on multi-agent interactive classrooms.

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

Original work: Copyright © THU-MAIC contributors
Modifications: Copyright © 2026 Ravish Garg

# MRI Scout

AI-powered MRI scan analysis tool. Upload your MRI images, get structured findings with severity grading, injury pattern recognition, and exportable PDF reports.

> **DISCLAIMER**: This is a hobby/educational tool. Results are **NOT** a medical diagnosis. Always consult a qualified physician for any health decisions.

## Features

- **Smart Slice Selection** — Upload entire MRI folders (200+ images). The algorithm automatically identifies series, trims surface slices, and selects representative central slices for analysis.
- **Two-Phase Analysis** — Initial screening across all series, then automatic targeted deep-dive into areas with detected pathology.
- **Universal Radiology Protocol** — Works for any body part (knee, shoulder, spine, brain). Systematic signal analysis, ligament grading (I/II/III), bone bruise pattern recognition, and cross-sequence correlation.
- **Severity Grading** — Each finding gets severity (mild/moderate/severe/complete rupture) and temporal assessment (acute/subacute/chronic).
- **Injury Pattern Inference** — Correlates multiple findings to identify the overall injury mechanism.
- **Per-Image Findings** — Each analyzed slice shown with status badge, finding description, expandable detail, and annotation markers at the exact location of pathology.
- **Fullscreen Lightbox** — Click any image to zoom/pan with annotation overlay.
- **PDF Export** — A4 print-ready reports: summary on page 1, detailed findings with images on subsequent pages.
- **30+ Languages** — All European languages plus Chinese, Japanese, Korean, Arabic, Hindi and more. Switch anytime — results auto-translate.
- **Streaming Results** — Watch the AI analysis appear in real-time.
- **Clinical Dark Theme** — Medical-grade UI with the MRI Scout Design System.

## How It Works

1. **Upload** — Drag & drop your MRI folder or select files (PNG, JPG, WEBP)
2. **Auto-Select** — Algorithm picks ~50 representative slices from central regions of each series
3. **Analyze** — AI examines each slice with a systematic radiology protocol
4. **Deep Dive** — If pathology detected, AI requests specific slice ranges for detailed examination
5. **Results** — Summary, per-image findings sorted by severity, PDF export

## Tech Stack

- [Next.js](https://nextjs.org/) 15+ (App Router, Turbopack)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Google Generative AI SDK](https://ai.google.dev/) (Gemini 3.1 Pro Preview)
- [Lucide React](https://lucide.dev/) icons

## Getting Started

### Prerequisites

- Node.js 18+
- Google AI API key — [Get one here](https://aistudio.google.com/apikey)

### Installation

```bash
git clone https://github.com/lukashanes/AI-MRI-scout.git
cd AI-MRI-scout
npm install
```

### Configuration

Create `.env.local` in the root directory:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  page.tsx                — Main application
  report/page.tsx         — Print-optimized PDF report
  api/analyze/route.ts    — Streaming SSE analysis endpoint
components/
  finding-card.tsx        — Per-image result card with annotations
  image-viewer.tsx        — Zoomable image viewer with markers
  image-lightbox.tsx      — Fullscreen modal viewer
  upload-zone.tsx         — Drag & drop upload
  onboarding.tsx          — First-time guide
  analysis-stepper.tsx    — Progress indicator
  series-filmstrip.tsx    — Visual slice selection
  language-selector.tsx   — Language dropdown
lib/
  i18n.ts                 — 30+ languages
  image-selector.ts       — Smart slice selection
  providers/
    system-prompt.ts      — Universal radiology prompt
    gemini.ts             — Gemini API with streaming
```

## Contributing

Contributions welcome. Please open an issue first to discuss changes.

## License

[MIT](LICENSE)

## Author

**Lukas Hanes** — [@lukashanes](https://github.com/lukashanes)

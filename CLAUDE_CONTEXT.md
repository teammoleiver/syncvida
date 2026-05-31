# Syncvida — Claude Code Context

## Project

**Syncvida** is a React + TypeScript + Vite app built on Supabase.
It is a **LinkedIn content creation and social hub** platform with a visual designer, content planner, and social analytics tools.

Stack:
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS (via shadcn/ui)
- **Backend**: Supabase (Postgres + Storage + Edge Functions)
- **UI**: shadcn/ui components (`@/components/ui/`)
- **Routing**: react-router-dom v6
- **State**: Local React state + custom history hook (`useHistory` in `src/lib/designer-history.ts`)

---

## Key Directories

```
src/
  pages/
    designer/
      DesignEditor.tsx        — Blank Canvas design editor
      LinkedInTemplatesPage.tsx — LinkedIn carousel/cheatsheet/square template editor
    social/
      ContentPlannerPage.tsx  — Content calendar / post editor
      OverviewPage.tsx
      LinkedInPage.tsx
      ...
  components/
    designer/
      linkedin/
        AssetPickerDialog.tsx  — ★ Media/logo picker (recently upgraded)
        AssetPickerDialog.tsx  — tabs: My Uploads | Sector Logos | Growth Symbols | Data & Charts
        LinkedInCanvas.tsx     — Canvas rendering components
        editorHelpers.ts       — buildCarouselFromPost, buildCheatSheetFromPost, etc.
        detectLogos.ts         — Auto-detect tool names in post text → match against logo registry
      Inspector.tsx            — Right-panel element inspector (image/text/shape controls)
      Canvas.tsx               — Main canvas renderer
    GenerateWithAIDialog.tsx   — AI image generation + composite layering
  lib/
    designer-utils.ts          — ★ removeWhiteBackground (recently fixed), safeFilename, clone
    designer-queries.ts        — Supabase queries (designs, assets, templates)
    builtin-assets.ts          — Built-in SVG symbols/charts registry
public/
  logos/                       — 1295 brand logos (AVIF/PNG/SVG)
  logos-registry.json          — Searchable registry [{id, name, category, public_url, filename}]
```

---

## Recently Completed Work (May 2026)

### 1. Logo Library (1295 logos)
- **`public/logos/`** — All logos copied from `E:\GitHub\coldiq_scraper\scraper\output\logos_raw\`
- **`public/logos-registry.json`** — Static search registry, lazy-loaded in pickers
- Auto-detection: `detectLogos.ts` scans post body text and returns matching logos from the registry

### 2. Asset Picker Upgrade (`AssetPickerDialog.tsx`)
**Tab structure:**
- **My Uploads** — User's Supabase-stored assets
- **Sector Logos** — All 1295 logos from `logos-registry.json`, lazy-loaded in a grid
- **Growth Symbols** — SVG growth indicators (arrows, fire, verified, etc.)
- **Data & Charts** — SVG chart/graph assets

**New features (just added):**
- **Logo detail panel** — Clicking a logo opens a preview panel (not direct insert)
- **Remove white background** — Toggle in the logo detail panel; uses `removeWhiteBackground()` which fetches as blob (same-origin) → canvas pixel processing → transparent PNG
- **Editable logo name** — Click-to-rename in the detail panel (session-only, no server write)
- **Smart sizing** — Picker receives `canvasSize: {w, h}` prop; logos placed at ~15% canvas width
- Symbols/Charts are inserted directly (no detail panel needed)

### 3. Background Removal Fix (`designer-utils.ts → removeWhiteBackground`)
**Root cause of failure:** `crossOrigin = "anonymous"` on same-origin AVIF tainted the canvas.

**Fix strategy:**
1. For relative/same-origin URLs → `fetch()` the image as a Blob → create `objectURL` → load on canvas (bypasses CORS taint)
2. For absolute URLs → set `crossOrigin = "anonymous"` normally
3. **Better algorithm**: fully white pixels (R/G/B > 245) → alpha=0; near-white grey anti-aliased edges (brightness > 220, low color variance) → partial alpha for feathering
4. Logo is upscaled (×2-4) before canvas processing to preserve anti-aliasing quality

### 4. Smart Logo Sizing
Both editors now use ~15% of canvas width as the target logo size:
- **LinkedInTemplatesPage**: carousel=1080px → logo placed at ~162px wide
- **DesignEditor**: uses `design.width` dynamically

---

## Current Issues / Next Steps

### A. Auto-inject logos from post context ✅ DONE (May 2026)
The carousel now **auto art-directs itself**. On generation/regeneration from a
post (and via an "Auto-place on slides" button in the Detected bar), each slide
is read and decorated with:
- The **brand logo(s)** literally named on that slide (e.g. a "Clay" slide gets
  the Clay logo), matched **case-sensitively** so "Clay" the tool hits but
  "clay" the material / "Ready" / "make" don't.
- **One contextual icon/chart** per slide by intent: stat→growth arrow,
  comparison→quadrant matrix, quote→quote mark, bullets→verified check,
  data→line graph, idea→bulb, viral/fast→lightning.

Implementation: `src/components/designer/linkedin/autoDecorate.ts`
- `autoPlaceSlideAssets(carousel, {w,h}, opts)` → `Record<slideIdx, Overlay[]>`
- Placement = top-LEFT "masthead" strip aligned to the canvas's 64px padding
  (mirrors the type pill pinned top-right; the body is vertically centered so
  this band is always empty). Logos sized ~12% canvas width; white backgrounds
  auto-stripped via `removeWhiteBackground()` (cached, falls back on failure).
- `mergeAutoOverlays()` keeps hand-placed overlays on a re-run (auto overlays
  carry an `auto: true` flag; user overlays render on top).
- CTA / closing slide is left undecorated (author photo is the hero).
- Tuning: `AMBIGUOUS_NAMES` stoplist in `autoDecorate.ts` filters common-word
  brand names out of automatic placement.

Wired in `LinkedInTemplatesPage.tsx` via `runAutoPlace()` (first-gen effect,
plan seed, "Regenerate slides", Figma-template theme, manual button).

### B. Carousel template variety
The `buildCarouselFromPost` in `editorHelpers.ts` always generates similar layouts.
Needs more layout templates: full-bleed image, quote overlay, split layout, minimal text-only.
The theme picker (`TemplateStylePicker.tsx`) should offer more distinct visual presets.

### C. AI composite generation
`GenerateWithAIDialog.tsx` generates an image via DALL-E/Gemini, then should:
1. Create a Studio design with the AI image as background
2. Layer the user's avatar (from brand kit) as a circular element in the corner
3. Layer detected tool logos as non-overlapping elements
→ This removes AI face distortion and logo hallucination

### D. Mobile UX
All social hub pages use a `mobileTab` state (`"edit" | "preview" | "style"`) with a sticky bottom tab bar.
DVH (`100dvh`) fixes the mobile keyboard layout squeeze.

---

## LinkedIn Visual Design System (compliance layer) — May 2026

Source of truth: `src/lib/linkedin-design-system.ts` (encodes
`linkedin_visual_design_system.md`). Holds the FIXED rules + `validateCarousel()`
+ `validatePostText()` + filename helpers. Brand *values* (colors, fonts, face
photo, name) resolve at runtime from the Brand Kit + profile.

Implemented:
- **Carousel size = 1080×1280** (`DIMENSIONS.carousel` + `canvas.css`).
- **Cover face mandatory** — real profile `avatar_url` is loaded in
  `LinkedInTemplatesPage` and rendered as `.carousel-cover-face`. Stock photos
  are only a fallback.
- **Closing slide = follow + bell CTAs** — baked into both builders
  (`buildCarouselFromPost`, `buildSalehFigmaCarousel`) as a two-line `ctaAction`
  (`BELL_CTA` constant); rendered as two CTA buttons.
- **Target 12 slides (8–16)** — builder splits the post into ~10 body chunks;
  caps at 16.
- **≤50 words/body slide** — `trimSlideToWordLimit()` enforces it in the builder;
  `validateCarousel` flags any violation.
- **Clean PDF filenames** — `sanitizeCarouselFilename()` → `Title-Case.pdf`, no
  timestamp/v#/final/draft (storage path stays uniquely timestamped internally).
- **Hard export gate** — `saveCarouselPdfAndLink` blocks if `validateCarousel`
  returns errors; a live checklist panel sits in the editor banner stack.
- **Planner post-text rules** — `validatePostText` hints under the Body field
  (≤500 chars, hook length, generic-opener, curiosity tease) + "Insert curiosity
  tease" button (`suggestCuriosityTease`).

NOT yet done (follow-ups): cover background = brand `primary_color` (the canvas
theme system owns the bg; brand colors aren't wired into canvas CSS vars yet) ·
scheduling rules (Tue/Thu 09:00/13:30, ≤2 carousels/wk) · banner/video/profile
rules · 24pt min-font validation (can't measure rendered px reliably).

## AI Review + Learning Memory (carousel) — May 2026

- **Edge function** `supabase/functions/review-carousel` (OpenAI `gpt-4o-mini`,
  JSON mode). Input `{ slides, hook, body, author, memory[] }` → returns
  `{ score, verdict, flow, slideNotes:[{n, severity, issue, reason, suggestion,
  fix:{title?, body?}}], improvements[] }`. Honors learned `memory` rules so it
  stops re-flagging accepted patterns.
- **Tables** (RLS on, `auth.uid() = user_id`):
  - `linkedin_ai_reviews` — one cached review per design (`design_id` unique per
    user) + `applied` array of accepted note indices. So the review is NOT
    re-run on every open; the "AI review" button reopens the cache, with a
    Re-run inside the dialog.
  - `linkedin_design_memory` — learned rules (`rule`, `source`, `active`).
- **Queries:** `src/lib/linkedin-ai-review.ts` (getAiReview / saveAiReview /
  listDesignMemory / getActiveMemoryRules / add / update / deleteDesignMemory).
- **Editor flow** (`LinkedInTemplatesPage`): AI review dialog → click a slide
  note → correction popup (issue + why + editable title/body) → Accept applies
  the fix to the slide, marks the note **green**, persists `applied`, and saves
  the note's `reason` to memory so future reviews learn it.
- **Deterministic "Fix issues"** button (no AI) repairs REQUIRED failures via
  `autoFixCarousel` (cover/closing structure, follow+bell CTA, ≤50 words, split
  to 8-slide min). Validation errors are clickable → jump to the slide.
- **Settings:** `SettingsModule` → "LinkedIn design memory" section to view /
  add / edit / disable / delete the learned rules.

## Post lifecycle / stages — May 2026

Stage model in `ContentPlannerPage`: **Draft → Ready → Scheduled → Posted**
(`STATUSES`, `STATUS_META`; `normalizeStatus()` folds legacy planned/drafting →
draft). Gating:
- A post can be **Scheduled only from Ready** with a date + time — the Scheduled
  pill is locked otherwise, and `scheduleNow` blocks if not Ready.
- **Draft = no action**: the "Publishing Actions" menu is disabled on Draft.
- New posts default to `draft`. LinkedIn Review "kept" posts now land on the
  main Calendar as **Draft** (was `ready`) via `syncToCalendar`.
- Only `status='scheduled'` posts fire via the dispatcher (now working).

## Reject-learning (LinkedIn Review) — May 2026

- Reject (X) on a post opens `RejectDialog` (reason chips + free note) with
  **Reject & learn** and **Delete** actions. Delete sets a new `deleted` status
  (hidden from the grid; removed from the calendar).
- Reasons are saved to `public.linkedin_writing_memory` (RLS, user-scoped) via
  `addWritingMemory` in `src/lib/linkedin-review.ts`.
- `rewritePost` passes active rules as `avoid` to `rewrite-linkedin-post`; the
  edge function appends them to the prompt (deployed — v61).
- `deleted` status is allowed by the `linkedin_post_states_status_check`
  constraint (migration `linkedin_post_states_allow_deleted`).
- Settings → **Writing-style memory** section manages the rules (view / add /
  edit / disable / delete). Sibling of the design-memory section.
- Note: LinkedIn Review "kept" posts already sync to `social_content_plan`
  (status `ready`, `source_kind='linkedin_review'`, `notes` tagged
  `[linkedin_review:<id>]`) — relevant for the pending calendar integration.

## Scheduled posting — fixed May 2026

**Root cause:** pg_cron job #5 (`* * * * *`) called `dispatch-due-posts` with the
**anon key**, but that function requires the **service-role key** for cron mode
(`if (!isServiceRole) return 401`). Every tick 401'd → scheduled posts never went out.

**Fix (dispatch-due-posts left untouched):**
- `public.app_config` table holds a `cron_secret` (RLS on, service-role only).
- New edge function `supabase/functions/cron-dispatch` (verify_jwt=false): checks
  `x-cron-secret` against `app_config`, then calls `dispatch-due-posts` with the
  service-role key from its own env (so cron mode is authorized).
- Cron #5 repointed (via `cron.alter_job`) to `cron-dispatch` with the secret
  header. Verified: manual trigger returns `200 {"processed":N}` (was 401).
- To rotate the secret: update `app_config.cron_secret` and re-run `cron.alter_job`
  for job 5 (inject the value with `format(..., %L)` so it's never printed).

## Supabase Edge Functions

Located in `supabase/functions/`:
- `generate-design-from-prompt/` — Text → design JSON
- `generate-post/` — AI post generation
- `scrape-linkedin/` — LinkedIn scraping
- `ai-edit-image/` — Image editing

---

## Design System / Brand

**Personal brand colors (Saleh Seddik):**
- Background: `#0E0E0E` (off-black)
- Accent: `#00E18A` (mint green)
- Text: `#F5F1E8` (warm white)
- Font heading: `Inter Bold` / `Space Grotesk Bold`
- Font mono: `JetBrains Mono`

These are used in carousel templates, the designer seed data, and all generated content.

---

## Common Patterns

### Adding to the canvas (LinkedInTemplatesPage)
```ts
addOverlay({
  id: crypto.randomUUID(),
  type: "image",
  x: 150, y: 150,
  w: 162, h: 80,           // computed via idealSize()
  src: asset.public_url,
  originalSrc: asset.public_url,  // keep original for bg-removal toggle
  removeBg: false,
  objectFit: "contain",
  radius: 0,
  name: "Clay logo",       // editable label shown in layers panel
} as any);
```

### Adding to the canvas (DesignEditor)
```ts
addElement(makeImage(src, assetId, {
  x: 150, y: 150,
  w, h,
  fit: "contain",
  radius: 0,
  originalSrc: originalUrl,
  removeBg: false,
}));
```

### Remove background
```ts
import { removeWhiteBackground } from "@/lib/designer-utils";
const transparentSrc = await removeWhiteBackground("/logos/zapier.svg");
// Returns a data: URL PNG with white pixels made transparent
```

---

## Running the project

```bash
cd E:\GitHub\Syncvida
npm run dev       # dev server at http://localhost:8080
npm run build     # production build
```

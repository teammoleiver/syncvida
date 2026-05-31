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

### A. Auto-inject logos from post context
When a post in `ContentPlannerPage` mentions "Clay" or "Zapier", the `detectLogos.ts` function already returns `DetectedLogo[]`. The next step is to:
- Show a banner/chip strip below the post textarea listing detected logos
- Allow click-to-inject → opens the logo detail panel and inserts onto the active slide

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


# Designer — internal Canva/Figma-lite for social posts

A new page under **Content → Designer** (`/designer`) that lets you generate, edit and export visual posts (LinkedIn carousel PDF + single 1:1 / 4:5 / 9:16 images for LinkedIn / Facebook / Instagram / X) from a prompt + your brand style, with AI image generation, AI image editing, your own logos/photos, and an automatic style extractor that reads your website.

Everything stays inside our existing Supabase project. No Canva, no external design tool.

---

## 1. What the user can do

### 1.1 Brand Kit (one per user)
- Brand name, tagline, handle, website URL.
- Colors: primary, secondary, accent, background, text (5 swatches, hex).
- Fonts: heading + body (curated Google Fonts list).
- Logo: light + dark variants (PNG/SVG upload).
- Default avatar / author photo.
- Default footer text (e.g. "@yourhandle · yourwebsite.com").
- Toggle: "Match my website" → paste a URL, AI extracts colors + fonts + tone and pre-fills the kit (you can still override).

### 1.2 Asset Library
- Upload your own photos and logos. Stored in a private bucket, listed in a grid, drag into any slide.
- Generate new images from a prompt using Lovable AI (Nano Banana / Nano Banana Pro). Saved to the library.
- Edit any library image with a prompt (Nano Banana edit). New version saved alongside original.

### 1.3 Designer canvas
Two doc types:
- **Single post** (square 1080, portrait 1080×1350, story 1080×1920).
- **Carousel** (1–10 slides, 1080×1350 LinkedIn-friendly, exportable as PDF).

Each slide is composed of layered elements:
- `text` (editable copy, font from brand kit, size, weight, color, alignment)
- `image` (from library / uploaded / AI-generated; supports cover/contain, rounded corners)
- `shape` (rect / circle / line — colored from brand kit)
- `logo` (auto-bound to brand kit logo)

Editor controls (right-rail Inspector):
- Move / resize / rotate, z-order, duplicate, delete.
- Color pickers locked to the brand palette + free hex.
- "Edit with AI" on any image element → opens a prompt box → Nano Banana edits in place.
- Templates: a starter set (3 carousel templates × 4 styles, 3 single-post templates) generated from the brand kit so first-time experience is instant.

### 1.4 Generate-from-prompt
A top input: "Describe the post you want." Chooses doc type, calls Lovable AI to:
1. Write the copy (hook, body, CTA, per-slide text for carousels).
2. Pick template + suggest images for each slide (text-to-image via Nano Banana).
3. Drop everything onto the canvas pre-styled with the brand kit so you only fine-tune.

### 1.5 Export
- Single post → PNG download (rendered client-side from the canvas).
- Carousel → multi-page PDF (1 page per slide) + zip of PNGs.
- "Send to Content Planner" → creates a planner entry with the generated image(s) attached, scheduled draft.

---

## 2. Data model (new tables, RLS = owner-only)

```text
brand_kits
  id, user_id (unique), brand_name, website_url,
  colors jsonb { primary, secondary, accent, bg, text },
  fonts jsonb { heading, body },
  logo_light_url, logo_dark_url, avatar_url,
  footer_text, extracted_at

design_assets
  id, user_id, kind ('upload' | 'ai_generated' | 'ai_edited'),
  storage_path, public_url, prompt nullable, parent_asset_id nullable,
  width, height, mime, created_at

designs
  id, user_id, type ('single' | 'carousel'),
  title, platform ('linkedin'|'instagram'|'facebook'|'x'|'multi'),
  width, height, slides jsonb (array of { id, elements: Element[] }),
  thumbnail_url, planner_entry_id nullable, created_at, updated_at
```

Storage buckets:
- `brand-assets` (private, RLS by `auth.uid()/...`) — logos, brand photos.
- `design-assets` (private) — uploaded + AI-generated images.
- `design-exports` (private) — final PNG/PDF exports.

---

## 3. Edge functions

- `extract-brand-from-url` — fetches the user's website HTML + favicon, extracts dominant colors (CSS palette + favicon analysis) and font-family hints, asks Lovable AI to return `{ colors, fonts, tone, logoCandidates[] }`. Pre-fills brand kit.
- `generate-design-image` — takes `{ prompt, aspect, brandKitId }`, calls Lovable AI Gateway with `google/gemini-2.5-flash-image` (or `gemini-3-pro-image-preview` when `quality:"high"`), saves PNG to `design-assets`, returns row.
- `edit-design-image` — takes `{ asset_id, prompt }`, runs Nano Banana edit, saves new asset linked via `parent_asset_id`.
- `generate-design-from-prompt` — orchestrator: copy + slide structure (Lovable AI text), then N parallel `generate-design-image` calls, returns a fully-populated `designs` row.

All functions: validate input with zod, JWT-validate the caller, use `LOVABLE_API_KEY` via Lovable AI Gateway. No third-party design APIs.

---

## 4. Frontend

New routes (added to `App.tsx`, sidebar entry under **Content** right below Content Planner):
- `/designer` — gallery of your designs + "New design" button + brand-kit shortcut.
- `/designer/brand` — brand kit editor (palette, fonts, logos, "Match my website" extractor).
- `/designer/assets` — asset library (uploads + AI generations + edits).
- `/designer/:id` — the canvas editor.

Tech for the canvas:
- HTML/SVG-based editor (absolutely-positioned layers inside a fixed-px frame, scaled responsively). Lightweight, no Fabric/Konva dependency, themeable with our existing tokens.
- Export: `html-to-image` for PNG, `jspdf` for combining slides into a single PDF. Both small and already friendly with React.
- Drag/resize: a tiny custom handler (no extra dep) since elements are simple boxes.

Design tokens: all UI uses existing `--background / --foreground / --primary` tokens; brand-kit colors only apply *inside* the design canvas, never to the app chrome.

---

## 5. Build order

1. Migration: `brand_kits`, `design_assets`, `designs`, three storage buckets + RLS.
2. Sidebar entry + routes + page shells (`/designer`, `/designer/brand`, `/designer/assets`, `/designer/:id`).
3. Brand Kit page with manual editor + logo upload.
4. Edge function `extract-brand-from-url` + "Match my website" button.
5. Asset Library page: upload, AI generate, AI edit.
6. Edge functions `generate-design-image`, `edit-design-image`.
7. Canvas editor: render slides, select/move/resize, text/image/shape/logo elements, brand-palette color picker.
8. Templates (seeded JSON in code, instantiated against the active brand kit).
9. Edge function `generate-design-from-prompt` + the top "Describe your post" bar.
10. Export: PNG (single), PDF (carousel), "Send to Content Planner" hand-off.

---

## 6. Notes / out of scope for v1

- No real-time multi-user collaboration.
- No vector freehand drawing — only text, image, basic shapes, logo (covers 95% of social-post needs).
- No video/Reels — images + carousels only.
- We build entirely on Lovable AI for both text and image; no Canva, no Figma, no Gamma.

If you approve, I'll start with the migration + sidebar/routes and work down the build-order list.

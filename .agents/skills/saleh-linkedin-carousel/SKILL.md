---
name: saleh-linkedin-carousel
description: Generate LinkedIn carousel slides for Saleh Seddik (@Salehseddik) in his personal-brand visual system — dark off-black theme, mint green accent, Inter Bold hooks, JetBrains Mono support, headshot in footer + CTA. Trigger when the user asks for a carousel, slides, document post, multi-page LinkedIn post, or asks to "turn this into a carousel" / "design slides for LinkedIn." This is the canonical Saleh personal-brand carousel system.
---

# Saleh's LinkedIn Carousel System — Dark Theme

## Identity rule — read first

These carousels are posted from **Saleh Seddik's personal profile (`@Salehseddik`)**, not Moleiver. The footer carries his headshot + name + handle. **Do not** put `Moleiver`, `moleiver.com`, agency URLs, or "Book a call" CTAs on slides. The carousel's job is to build Saleh's personal authority and drive comments + follows. Lead-gen for Moleiver happens off-platform once the audience is built.

## When to use

- "Make this into a carousel"
- "Turn this post into slides"
- "Design a LinkedIn document post about X"
- "Build a carousel on [topic]"
- Any time multi-slide LinkedIn output is requested for Saleh

## Format spec

- Dimensions: **1080 × 1350 px** (LinkedIn 4:5 portrait, highest-reach format)
- Output: PDF, exported and uploaded to LinkedIn as a "Document" post
- Slide count: **6–8 typical**, 10 max. Eight is the default for technical breakdowns.
- Safe area: 80 px padding all sides; nothing critical within 140 px of bottom (footer lives there)

## Visual design system

### Colors

```
Background       #0E0E0E   Off-black. NOT pure black — pure black looks wrong on LinkedIn's light grey feed.
Surface          #1A1A1A   Code cards, comparison columns
Border           #2A2A2A   1px separators, card outlines, footer divider
Text primary     #FFFFFF   Hooks, body
Text 65%         rgba(255,255,255,0.65)   Mono body paragraphs
Text 45%         rgba(255,255,255,0.45)   Page counters, supporting labels
Text 25%         rgba(255,255,255,0.25)   Truly faint annotations
Accent mint      #00E18A   Eyebrow labels, accent rules, numbered-list markers, code traffic-light "ok", photo ring
Photo bg orange  #F26B2C   Background fill behind headshot on the CTA slide ONLY
Wrong red        #F46B6B   Comparison "wrong" column markers only — never as a general color
Warn amber       #F4C752   Code-card traffic-light dot only
```

The palette is narrow on purpose. Mint is the only general accent. Orange appears only on the CTA avatar. Red appears only in comparison slides. Don't add a fifth color.

### Typography

```
Sans:  Inter
  Bold (700)        — hooks, name, section headers, big numbers
  Semi Bold (600)   — numbered-list item titles
  Regular (400)     — numbered-list descriptions, rare body
  Bold Italic (700) — reserved (not used in this current set; available for future quote-italic variants)

Mono:  JetBrains Mono
  Medium (500)      — eyebrow tags, page counters, code filenames, "Swipe →"
  Regular (400)     — body paragraphs, supporting lines, code blocks
```

If JetBrains Mono is unavailable, fall back to: IBM Plex Mono → Geist Mono → SF Mono → Menlo.

### Type scale (1080×1350 frame)

```
Cover hook (slide 1)                96 px  Inter Bold, line-height 1.05, tracking -0.025em
Body slide hook                     72 px  Inter Bold, line-height 1.12, tracking -0.015em
Small section hook                  60 px  Inter Bold, line-height 1.15
Pull-quote body in paragraph slide  42 px  Inter Semi Bold, line-height 1.35
Big section number                 420 px  Inter Bold mint, line-height 1.0
Numbered-list item title            40 px  Inter Semi Bold, line-height 1.2
Numbered-list item description      26 px  Inter Regular 65% white, line-height 1.4
Body / mono paragraph               32 px  JBM Regular 65% white, line-height 1.55
Code block                          24 px  JBM Regular 85% white, line-height 1.6
Eyebrow tag                         30 px  JBM Medium mint, 8% tracking, UPPERCASE
Small eyebrow                       28 px  same
Tiny eyebrow                        26 px  same
Decorative quote glyph             300 px  Inter Bold mint, line-height 0.7
Page counter top-left               26 px  JBM Medium 45% white
Handle top-right                    26 px  JBM Medium 45% white
Big number / 420 px section number  Inter Bold mint
Footer name                         26 px  Inter Bold white
Footer handle                       22 px  JBM Regular 45% white
Footer tagline (right)              24 px  JBM Medium mint
```

### Layout grid

```
Frame:              1080 × 1350 px
Outer padding:      80 px on left and right
Top row:            absolute, top 80 px — page counter LEFT, handle RIGHT
Top-row baseline:   above the eyebrow on each slide
Footer:             absolute, bottom 60 px, with 1px separator at top of footer block
Hook block:         typically starts ~280–320 px from top, below the eyebrow
```

### Persistent elements on every slide

**Top row** (absolute, top 80 px, full content width):
- LEFT: page counter `01 / 08` in JBM Medium 26 px, 45% white
- RIGHT: `@Salehseddik` in JBM Medium 26 px, 45% white

**Footer** (absolute, bottom 60 px):
- 1px separator line `#2A2A2A` spanning the content width
- 22 px gap below the line
- **LEFT side:** 56 px circular headshot with 1px mint ring + 16 px gap + `Saleh Seddik` in Inter Bold 26 px white + below it `@Salehseddik` in JBM Regular 22 px 45% white
- **RIGHT side:** a tagline in JBM Medium 24 px mint — default `Barcelona · GTM Engineer`. Other allowed taglines: `Built in public · Shipped in prod`, `Cold email · GTM systems`, `n8n · Clay · Claude`.

## The 8-slide template library

Carousels combine these eight slide archetypes. Default sequence for a technical breakdown: Cover → Big Number (section 1) → Content paragraph → Numbered list → Code/workflow → Big Number (section 2) → Content paragraph → CTA. For a hot-take or POV carousel: Cover → Content → Content → Quote → Comparison → CTA.

### Type 01 — Cover · Hook

The first slide. Stops the scroll in 2 seconds or never.

- Top row (counter LEFT, handle RIGHT)
- ~y=300: eyebrow tag in mint, UPPERCASE — e.g. `GTM ENGINEERING / TACTIC`, `COLD EMAIL / INFRASTRUCTURE`, `BUILT IN PUBLIC`, `HOT TAKE`
- ~y=360: the hook in Inter Bold 96 px, max 5 lines, hugging left padding (920 px text box width)
- Bottom area (~bottom 260 px): mono support sentence in 65% white, 32 px, 2 lines max
- Above the footer: `swipe →` in mint mono
- Footer

The hook IS the post. Spend 80% of writing time here.

### Type 02 — Big Number · Section Break

For longer carousels that benefit from explicit "Part 1 / Part 2" navigation.

- Top row
- ~y=200: eyebrow `PART ONE` / `PART TWO` / `PART THREE` in mint
- ~y=260: huge mint `01` (Inter Bold 420 px) as a graphic element
- Below the number: 3-line declaration of what this section covers, in Inter Bold 88 px
- Footer

This slide is breathing room. Don't add body text.

### Type 03 — Content · Paragraph

The workhorse layout. Use 2–4 of these per carousel.

- Top row
- ~y=120 from top: eyebrow tag in mint
- ~y=200: hook in Inter Bold 60 px, 1–2 lines
- ~y=400: optional pull-quote treatment — a 4px mint vertical rule, 40 px gap, then a Semi Bold 42 px pull-line (2 lines)
- ~y=640: mono body paragraph (JBM Regular 32 px, 65% white, line-height 1.55), max 4 lines
- Footer

If using the pull-quote treatment, the body paragraph should explain or extend the pull-quote, not repeat it.

### Type 04 — Numbered List

For 5-item checklists, frameworks, sequences.

- Top row
- ~y=120: eyebrow `THE 5-STEP CHECKLIST` / `MY STACK` / etc.
- ~y=200: short hook in Inter Bold 60 px
- ~y=380: vertical list of 5 items, 24 px gap between
  - Each item: `01 →` in JBM Medium mint (90 px column) + Inter Semi Bold 40 px title + Inter Regular 26 px 65% white description
- Footer

Five is the sweet spot. Four is fine. Six pushes the slide too dense.

### Type 05 — Code · Workflow

For showing n8n, Python, JSON, code config. Saleh's most differentiated slide type — almost no peers do this well.

- Top row
- ~y=120: eyebrow `THE n8n WORKFLOW` / `THE PYTHON SCRIPT` / `THE WEBHOOK`
- ~y=200: hook in Inter Bold 52 px
- ~y=400: a code card — `#1A1A1A` background, 1px `#2A2A2A` border, 12px radius, 32px padding
  - Window bar with three traffic-light dots (#F46B6B red, #F4C752 amber, #00E18A mint) + filename in 22 px JBM 45% white
  - 1px border below the bar
  - Code block in JBM Regular 24 px, 85% white, line-height 1.6, monospace alignment preserved
- ~y=900: mono caption in 32 px 65% white describing what the workflow does — e.g. "Replaces 4 SaaS subscriptions. Runs on a $5/mo Hetzner box."
- Footer

Keep code to ≤12 lines. If longer, split across two Code slides.

### Type 06 — Quote · Insight

For a single big idea credited to Saleh himself.

- Top row
- ~y=200: a giant mint `"` (Inter Bold 300 px, line-height 0.7) as a graphic element
- ~y=440: the quote in Inter Bold 56 px, line-height 1.25 — or split into 2-3 short paragraphs if needed
- Just above footer: 80px × 4px mint horizontal rule + attribution in JBM Medium 24 px UPPERCASE 45% white — e.g. `ME, AT HACKBARNA` / `ME, AT 3 AM FIXING A BLACKLIST` / `MY THESIS, UNIVERSITY OF BARCELONA`
- Footer

The attribution is part of the voice. Self-aware, specific, slightly self-deprecating. Never just `— Saleh Seddik`.

### Type 07 — Comparison

Wrong vs Right, Before vs After, Common vs What Actually Works.

- Top row
- ~y=120: eyebrow `WHAT MOST TEAMS DO  /  WHAT WORKS` (the slash is part of the visual)
- ~y=200: hook in Inter Bold 60 px
- ~y=400: two columns, 36 px gap
  - LEFT col: `#1A1A1A` bg, 1px `#2A2A2A` border, 12 px radius — header in red `✕  WRONG` in JBM Medium 26 px UPPERCASE — 5 items each with red `—` marker + 28 px Inter text (65% white for the wrong-column items, slightly de-emphasized)
  - RIGHT col: `#1A1A1A` bg, 2px mint border (not 1px — the right column is the answer, give it weight) — header in mint `✓  RIGHT` — 5 items each with mint `→` marker + 28 px Inter text in full white
- Footer

Always 5 vs 5. Don't put 5 wrongs against 7 rights — they should weigh equally on the page so the contrast reads as opposition, not abundance.

### Type 08 — CTA Final

The closer. Drives the engagement metric LinkedIn actually rewards — comments and follows.

- Top row
- ~y=160 centered: eyebrow `FOLLOW FOR MORE GTM SYSTEMS` / `WANT MORE TEARDOWNS LIKE THIS?` in mint, centered
- ~y=240 centered: secondary line in Inter Bold 54 px, max 2 lines — e.g. `Built in public. Shipped in production.`
- ~y=440 centered: 320 px circle, orange background `#F26B2C` with 2px mint ring, with the 280 px headshot centered inside it (creates a halo effect)
- ~y=820 centered: `Saleh Seddik` in Inter Bold 60 px
- ~y=900 centered: `@Salehseddik` in JBM Regular 28 px mint
- ~y=980 centered: the prompt in Inter Bold 56 px — `Agree or disagree?` / `What would you add?` / `Tag someone who needs this.`
- ~y=1080 centered: `DROP A COMMENT  ·  FOLLOW + CONNECT` in JBM Medium 24 px UPPERCASE 65% white
- Footer

The CTA never says "Book a call." This is personal brand, not Moleiver lead-gen.

## Copy patterns

### Hook formulas (slide 1) — pick one

These match Saleh's contrarian-practitioner voice — not guru-speak.

1. **The reframe** — "Stop chasing X and start building Y."
2. **The wrong cause** — "Most teams blame X. The real problem is Y."
3. **The receipt** — "I do [unusual thing at scale]. Here's the actual stack."
4. **The hot take** — "Most [category] is just [unflattering description]."
5. **The boring truth** — "[Boring topic] decides [outcome] more than [shiny topic] ever will."
6. **The diagnosis** — "Most GTM AI is an LLM hallucinating signals." (this is Saleh's actual line)

### Voice rules

- Short sentences. Two clauses max. Periods over commas.
- Contrarian, not negative. Stake a position; don't whine.
- Specific over abstract. "65 domains" beats "many domains." "n8n + Clay" beats "automation tools."
- No hedging. Cut "I think," "maybe," "kind of," "honestly."
- No corporate filler. Cut "leverage," "synergy," "best-in-class," "ecosystem."
- No exclamation marks. Ever.
- No emojis on slides. The mono eyebrow tags do that work.
- Numbers beat adjectives. "30% lift" beats "significant improvement."

### Mono body paragraph rules

- 2–4 sentences max
- Mono font signals: this is a technical / reasoned aside
- Concrete tools, concrete outcomes
- End with a turn that sets up the next slide

### Self-quote rules (Type 06)

- One core insight, three sentences max
- The attribution adds character — specify time, place, or state of mind: `ME, AT HACKBARNA` / `ME, AT 3 AM FIXING A BLACKLIST` / `MY MASTER'S THESIS, UB 2024`
- Never end on a question
- Three to twelve words ideal for the headline-quote portion

### CTA prompts (Type 08) — pick one

- `Agree or disagree?` (default — highest comment rate)
- `What would you add?` (invites contribution)
- `Which one did you miss?` (numbered-list carousels)
- `Tag someone who needs this.` (sharing prompt)
- `What's your stack look like?` (peer-to-peer)
- `Save this for your next [event].` (save-bait)

## Topic guardrails

Saleh's content pillars (use to filter ideas before drafting):

1. **GTM engineering** — n8n workflows, Clay tactics, cold email infrastructure, Apollo + HubSpot integrations, AI in outbound. About 50% of output.
2. **Build in public** — Moleiver builds, InstaLeadSync progress, side projects (the agent for finding houses in Catalonia, the Offer Generator). The audience sees the work, not the polish. About 25%.
3. **Industry observations** — recycling/industrial B2B vs SaaS, event recaps with a take, journalism-to-GTM origin angles. About 25%.

If a draft doesn't fit one of these three pillars, push back before designing it.

## Workflow

When the user asks for a carousel:

1. Confirm the angle in one sentence. Ask whether it's right.
2. Pick the slide count. 6 for a hot take. 8 for a technical teardown. 10 max.
3. Draft the copy first in plain text. One block per slide, labeled by slide Type (01–08). Show the draft before designing.
4. Once copy is approved, render the slides — either:
   - Edit the SLIDES array in `figma-generator.js` (defined below) and paste into a `use_figma` call, or
   - Edit `preview.html` directly with the new copy and screenshot/print to PDF
5. Present the result with a brief one-line description per slide.
6. Mention that the user can export to PDF (browser print or Figma export) and upload to LinkedIn as a Document post.

Never design before copy is locked. Design wastes tokens if the words are wrong.

## Assets

- `assets/saleh-headshot.jpg` — 1000×1000 square headshot, dark gray background, no transparency. Used for:
  - 56 px circular footer avatar (with 1 px mint ring)
  - 280 px circular CTA avatar (centered inside a 320 px orange-fill circle with 2 px mint ring)
- If a future shoot replaces this, swap the file at the same path. Everything else stays.

## Generator scripts

- `figma-generator.js` — JavaScript template for the Figma Plugin API. Edit the `SLIDES` array, paste into a `use_figma` tool call, all 8 types render.
- `preview.html` — standalone browser preview, photo embedded as base64. Open in any browser. "Toggle full size" for 100% view. "Print to PDF" exports the carousel directly.

## Example reference

`examples/tool-certifications-carousel.md` contains a slide-by-slide breakdown of an earlier carousel format Saleh tested (white theme). It's kept for historical reference, but the **dark theme defined here is the canonical Saleh personal brand**.

## Anti-patterns — what to never do

- `Moleiver`, `moleiver.com`, "Book a call," or any agency-branded element on a personal carousel — this is `@Salehseddik`'s voice, not Moleiver's
- Tool logo strips (Clay, n8n, etc. as graphic elements) — keep the design typographic, mention tools in copy
- Pull quotes from other people — quotes are attributed to Saleh or no one
- Stock illustrations or icons — the only image on the carousel is Saleh's headshot
- More than one mint accent + one orange use (CTA only) + one red use (comparison only) per carousel
- Centered body text on body slides — left-align always; centering is reserved for the CTA slide only
- The word `ecosystem`
- Pure black backgrounds (`#000000`) — use `#0E0E0E` so the carousel reads as designed, not accidental
- Bullet points (`•`) — use the numbered-list pattern with mono numbers instead

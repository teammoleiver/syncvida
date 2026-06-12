## CRM Module — Scope

A new top-level **CRM** section in the sidebar (above Content) with three pages: **Contacts**, **Companies**, **Deals**. Deals supports user-defined pipelines, each with custom stages and kanban/table views. Contacts and Companies are first-class records that sync bidirectionally with Social Hub tracked profiles.

---

## Database (new tables, all RLS-scoped to `auth.uid()`)

- `crm_companies` — name, domain, industry, size, website, logo_url, notes, linkedin_url
- `crm_contacts` — first_name, last_name, email, phone, title, company_id (→ crm_companies), linkedin_url, avatar_url, notes, source ('manual' | 'card_scan' | 'csv' | 'social_hub'), source_profile_id (→ social_profiles, nullable), tags[]
- `crm_pipelines` — name, description, color, is_default, position
- `crm_pipeline_stages` — pipeline_id, name, color, position, is_won, is_lost
- `crm_deals` — pipeline_id, stage_id, contact_id, company_id, title, value, currency, expected_close_date, notes, position
- `crm_activities` — contact_id/deal_id, type ('note'|'email'|'call'|'meeting'|'task'), content, occurred_at

A trigger seeds a "Sales" default pipeline with stages (New → Qualified → Proposal → Won / Lost) for each new user. All tables get standard GRANTs + RLS (`auth.uid() = user_id`).

---

## Pages

**`/crm`** — Dashboard: counts, recent contacts, deals by stage, conversion funnel.

**`/crm/contacts`** — Table + search/filter. Header capture widgets:
- AI Card Scan (image upload → OCR via tesseract.js in-browser, then a light AI parse to structure name/email/phone/company; tesseract is free + fast, AI only structures the extracted text — cheaper than full vision call)
- Quick Add by Text (textarea → AI parse)
- CSV import with template + preview
- Manual "Add Contact" form
Each row: edit/delete + **Contact Detail Drawer** with tabs: Overview, Posts (LinkedIn), Deals, Activities.

**`/crm/companies`** — Table of companies, add/edit, click → company detail with list of associated contacts and deals.

**`/crm/deals`** — Pipeline picker dropdown + "New Pipeline" button. Kanban (drag between stages, dnd-kit) / Table toggle. Each deal card: title, value, contact, company. Click → deal drawer with stage, value, notes, activities.

**`/crm/pipelines`** — Manage pipelines: create/rename/delete, reorder stages, set colors, mark won/lost stages.

---

## Social Hub ↔ CRM Sync (bidirectional)

**On a CRM Contact detail page:**
1. **"Find LinkedIn URL"** button → edge function `crm-find-linkedin-url` uses AI search (Linkup API already configured) to locate the contact's LinkedIn URL from name + company; user confirms and saves.
2. **"Push to Social Hub Tracking"** button (enabled once LinkedIn URL exists) → creates a row in `social_profiles` linked back via `source_contact_id`; immediately schedules a scrape.
3. **"Fetch Latest Posts"** button → triggers `scrape-linkedin-profile` for this contact's URL and renders posts inline in the contact drawer (Posts tab) from `social_posts`.

**On a Social Hub tracked profile (`/social/linkedin/profiles` profile row):**
1. **"Create in CRM"** button → creates/updates `crm_contacts` row (matched by `linkedin_url`), copies display_name, headline → title, company → links/creates `crm_companies`, sets `source='social_hub'` and `source_profile_id`. Existing scrape history stays linked via `linkedin_url`.

**Auto-link rule:** whenever a contact and a tracked profile share the same normalized LinkedIn URL, they're treated as linked — the Posts tab queries `social_posts` by URL, and "Push to Tracking" upserts on URL conflict.

---

## Capture Tech Choices

- **OCR**: `tesseract.js` (free, in-browser, no API cost). Worker loaded lazily on first card scan.
- **Text structuring**: small Lovable AI Gateway call (`google/gemini-3-flash-preview`) — cheap, fast, JSON output.
- **CSV**: parsed client-side with `papaparse`.
- **Drag/drop kanban**: `@dnd-kit/core` (already in deps).

---

## Sidebar / Sitemap

- Reorder `navGroups` in `AppLayout.tsx`: **CRM** first (Dashboard, Contacts, Companies, Deals, Pipelines) → then existing Content → Productivity → Health.
- Update `scripts/generate-sitemap.ts` with the 5 new routes; regenerate `public/sitemap.xml`.

---

## File Plan

**New:**
- `supabase/migrations/<ts>_crm_module.sql` (tables + RLS + GRANTs + default pipeline trigger)
- `supabase/functions/crm-find-linkedin-url/index.ts` (AI search via Linkup)
- `supabase/functions/crm-parse-card-text/index.ts` (AI structures OCR text → contact)
- `src/lib/crm-queries.ts` (CRUD helpers)
- `src/pages/crm/CrmLayout.tsx` + `CrmDashboard.tsx` + `ContactsPage.tsx` + `CompaniesPage.tsx` + `DealsPage.tsx` + `PipelinesPage.tsx`
- `src/components/crm/ContactDrawer.tsx`, `CompanyDrawer.tsx`, `DealDrawer.tsx`, `DealKanban.tsx`, `CardScanner.tsx`, `CsvImporter.tsx`, `QuickCaptureBar.tsx`, `PipelinePicker.tsx`, `SyncToSocialButton.tsx`
- `src/lib/crm-card-ocr.ts` (tesseract.js wrapper)

**Edited:**
- `src/App.tsx` — register `/crm/*` routes
- `src/components/layout/AppLayout.tsx` — add CRM group at top
- `src/pages/social/...ProfilesTab` — add "Create in CRM" action on each tracked profile
- `scripts/generate-sitemap.ts` + `public/sitemap.xml`

---

## Out of scope for v1 (can add later)
- Email send/track integration
- Custom contact fields
- Deal pipeline templates marketplace
- Voice dictation capture (text capture covers the use case)

/**
 * Saleh's LinkedIn Carousel · Figma Generator · Dark Theme
 *
 * HOW TO USE:
 * 1. Replace the SLIDES array below with your approved copy.
 * 2. Paste this whole script into a `use_figma` tool call with your fileKey
 *    (the existing file is at vb7jUUB699TW7c91jDZAT5).
 * 3. The script creates a new page and lays out all slides left-to-right.
 *
 * To insert the actual headshot:
 * - Use the Figma upload_assets tool when available (returns an imageHash)
 * - Paste the hash into AVATAR_IMAGE_HASH below
 * - Without a hash, avatars render as colored circles (mint footer, orange CTA)
 *
 * SLIDE TYPES (see SKILL.md for full visual spec):
 *   "01-cover"     { type:"01-cover", eyebrow, hook, support }
 *   "02-bignum"    { type:"02-bignum", eyebrow, num, hook }
 *   "03-content"   { type:"03-content", eyebrow, hook, pullquote, body }
 *   "04-list"      { type:"04-list", eyebrow, hook, items:[[num,title,desc]...] }
 *   "05-code"      { type:"05-code", eyebrow, hook, filename, code, caption }
 *   "06-quote"     { type:"06-quote", quote, attribution }
 *   "07-compare"   { type:"07-compare", eyebrow, hook, wrongs:[...], rights:[...] }
 *   "08-cta"       { type:"08-cta", eyebrow, secondary, prompt }
 */

// ============ EDIT THIS ARRAY FOR EACH CAROUSEL ============
const SLIDES = [
  {
    type: "01-cover",
    eyebrow: "GTM ENGINEERING / TACTIC",
    hook: "Most GTM AI is an LLM hallucinating signals.",
    support: "The bottleneck was never the model.\nIt's the data layer underneath it."
  },
  {
    type: "03-content",
    eyebrow: "THE PROBLEM",
    hook: "Most growth teams blame the copy.",
    pullquote: "The copy isn't the problem.\nThe infrastructure is.",
    body: "DNS records, sender reputation, warmup pacing, blacklist hygiene, IP rotation — these decide whether your email lands in inbox or spam. Nobody talks about them because they're boring."
  },
  {
    type: "04-list",
    eyebrow: "THE 5-STEP CHECKLIST",
    hook: "Before you send a single cold email.",
    items: [
      ["01","SPF + DKIM + DMARC","All three. All aligned. Verify with mxtoolbox."],
      ["02","Custom tracking domain","Default tracking domains tank deliverability."],
      ["03","Slow warmup, 21 days","No tool. Manual ramp from 5 to 40/day."],
      ["04","Inbox placement testing","Glock Apps or Mail-Tester. Weekly."],
      ["05","One domain, one ICP","Don't cross-pollute sender reputation."]
    ]
  },
  {
    type: "05-code",
    eyebrow: "THE n8n WORKFLOW",
    hook: "Apollo signal → Clay enrich → Instantly send.",
    filename: "n8n / workflow.json",
    code: `{
  "trigger": "Apollo / new_lead",
  "filter": "ICP_score >= 80",
  "enrich": {
    "tool": "Clay",
    "waterfall": ["Apollo","Hunter","Snov"]
  },
  "route": {
    "if":   "company_size > 50",
    "then": "Instantly / sequence_A",
    "else": "HeyReach / sequence_B"
  }
}`,
    caption: "Replaces 4 SaaS subscriptions. Runs on a $5/mo Hetzner box."
  },
  {
    type: "06-quote",
    quote: "The useful builds weren't the ones with the fanciest prompts.\n\nThey were the ones that figured out where the LLM ends and where the source-of-truth begins.",
    attribution: "ME, AT HACKBARNA"
  },
  {
    type: "07-compare",
    eyebrow: "WHAT MOST TEAMS DO  /  WHAT WORKS",
    hook: "The cold email retry strategy.",
    wrongs: ["Same domain","Same template","Same time of day","\"Just checking in\" follow-up","Stop after 3 emails"],
    rights: ["Rotate across 3 domains","Branched variants","Spread across 72hrs","New angle per touch","7-touch + LinkedIn"]
  },
  {
    type: "08-cta",
    eyebrow: "FOLLOW FOR MORE GTM SYSTEMS",
    secondary: "Built in public. Shipped in production.",
    prompt: "Agree or disagree?"
  }
];

// Paste the imageHash here once upload_assets is available, or leave null for placeholder circles
const AVATAR_IMAGE_HASH = null;

// ============ FONTS ============
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "JetBrains Mono", style: "Regular" });
await figma.loadFontAsync({ family: "JetBrains Mono", style: "Medium" });

// ============ DESIGN TOKENS ============
const W = 1080, H = 1350, PAD = 80, GAP = 120;
const BG     = { r: 0.055, g: 0.055, b: 0.055 };
const SURF   = { r: 0.102, g: 0.102, b: 0.102 };
const BORD   = { r: 0.165, g: 0.165, b: 0.165 };
const WT     = { r: 1, g: 1, b: 1 };
const ACC    = { r: 0, g: 0.882, b: 0.541 };       // #00E18A mint
const ORANGE = { r: 0.949, g: 0.42, b: 0.173 };    // #F26B2C
const RED    = { r: 0.957, g: 0.42, b: 0.42 };     // #F46B6B
const AMBER  = { r: 0.957, g: 0.78, b: 0.32 };

// ============ NEW PAGE ============
const existing = figma.root.children.find(p => p.name === "Saleh Personal · Dark");
const page = existing || figma.createPage();
page.name = "Saleh Personal · Dark";
if (existing) { for (const c of [...page.children]) c.remove(); }
await figma.setCurrentPageAsync(page);

// ============ HELPERS ============
function T(chars, o = {}) {
  const t = figma.createText();
  t.fontName = { family: o.f || "Inter", style: o.s || "Bold" };
  t.fontSize = o.size || 76;
  t.characters = chars;
  t.fills = [{ type: "SOLID", color: o.c || WT, opacity: o.op !== undefined ? o.op : 1 }];
  if (o.ls !== undefined) t.letterSpacing = { value: o.ls, unit: "PERCENT" };
  if (o.lh !== undefined) t.lineHeight = { value: o.lh, unit: "PERCENT" };
  if (o.up) t.textCase = "UPPER";
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.w !== undefined) { t.resize(o.w, t.height); t.textAutoResize = "HEIGHT"; }
  if (o.x !== undefined) t.x = o.x;
  if (o.y !== undefined) t.y = o.y;
  return t;
}
function R(x, y, w, h, c, o = {}) {
  const r = figma.createRectangle();
  r.x = x; r.y = y; r.resize(w, h);
  r.fills = [{ type: "SOLID", color: c, opacity: o.op !== undefined ? o.op : 1 }];
  if (o.rad) r.cornerRadius = o.rad;
  if (o.stroke) { r.strokes = [{ type: "SOLID", color: o.stroke }]; r.strokeWeight = o.sw || 1; }
  return r;
}
function L(x, y, w) { return R(x, y, w, 1, BORD); }

function avatar(parent, x, y, diameter, opts = {}) {
  const e = figma.createEllipse();
  e.x = x; e.y = y; e.resize(diameter, diameter);
  if (AVATAR_IMAGE_HASH) {
    e.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: AVATAR_IMAGE_HASH }];
  } else {
    e.fills = [{ type: "SOLID", color: opts.orangeBg ? ORANGE : ACC, opacity: opts.orangeBg ? 1 : 0.15 }];
  }
  e.strokes = [{ type: "SOLID", color: ACC }];
  e.strokeWeight = opts.thick ? 2 : 1;
  parent.appendChild(e);
  if (!AVATAR_IMAGE_HASH) {
    const init = T("SS", { f: "Inter", s: "Bold", size: opts.big ? 84 : 22, c: opts.orangeBg ? WT : ACC });
    init.x = x + (diameter - init.width) / 2;
    init.y = y + (diameter - init.height) / 2;
    parent.appendChild(init);
  }
  return e;
}

function topRow(f, idx, total) {
  const counter = T(`${String(idx + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    { f: "JetBrains Mono", s: "Medium", size: 26, c: WT, op: 0.45, x: PAD, y: PAD });
  f.appendChild(counter);
  const handle = T("@Salehseddik", { f: "JetBrains Mono", s: "Medium", size: 26, c: WT, op: 0.45, y: PAD });
  handle.x = W - PAD - handle.width;
  f.appendChild(handle);
}
function footer(f) {
  f.appendChild(L(PAD, H - 140, W - 2 * PAD));
  avatar(f, PAD, H - 116, 56);
  f.appendChild(T("Saleh Seddik", { f: "Inter", s: "Bold", size: 26, c: WT, x: PAD + 56 + 16, y: H - 116 }));
  f.appendChild(T("@Salehseddik", { f: "JetBrains Mono", s: "Regular", size: 22, c: WT, op: 0.45, x: PAD + 56 + 16, y: H - 116 + 32 }));
  const tag = T("Barcelona · GTM Engineer", { f: "JetBrains Mono", s: "Medium", size: 24, c: ACC });
  tag.x = W - PAD - tag.width;
  tag.y = H - 116 + 16;
  f.appendChild(tag);
}
function mkSlide(name, x) {
  const f = figma.createFrame();
  f.name = name; f.x = x; f.y = 0;
  f.resize(W, H);
  f.fills = [{ type: "SOLID", color: BG }];
  f.clipsContent = true;
  return f;
}

// ============ BUILD SLIDES ============
const built = [];
let xPos = 0;
const total = SLIDES.length;

for (let i = 0; i < SLIDES.length; i++) {
  const s = SLIDES[i];
  const f = mkSlide(`${String(i + 1).padStart(2, "0")} · ${s.type}`, xPos);
  topRow(f, i, total);

  if (s.type === "01-cover") {
    f.appendChild(T(s.eyebrow, { f: "JetBrains Mono", s: "Medium", size: 30, c: ACC, ls: 8, x: PAD, y: 380 }));
    f.appendChild(T(s.hook, { f: "Inter", s: "Bold", size: 96, c: WT, lh: 105, w: W - 2 * PAD, x: PAD, y: 440 }));
    if (s.support) f.appendChild(T(s.support, { f: "JetBrains Mono", s: "Regular", size: 32, c: WT, op: 0.65, lh: 150, w: W - 2 * PAD, x: PAD, y: 960 }));
    f.appendChild(T("swipe →", { f: "JetBrains Mono", s: "Medium", size: 30, c: ACC, x: PAD, y: H - PAD - 130 }));
  }
  else if (s.type === "02-bignum") {
    f.appendChild(T(s.eyebrow, { f: "JetBrains Mono", s: "Medium", size: 30, c: ACC, ls: 8, x: PAD, y: 280 }));
    f.appendChild(T(s.num, { f: "Inter", s: "Bold", size: 420, c: ACC, lh: 100, x: PAD, y: 340 }));
    f.appendChild(T(s.hook, { f: "Inter", s: "Bold", size: 84, c: WT, lh: 110, w: W - 2 * PAD, x: PAD, y: 820 }));
  }
  else if (s.type === "03-content") {
    f.appendChild(T(s.eyebrow, { f: "JetBrains Mono", s: "Medium", size: 28, c: ACC, ls: 8, x: PAD, y: 200 }));
    f.appendChild(T(s.hook, { f: "Inter", s: "Bold", size: 60, c: WT, lh: 115, w: W - 2 * PAD, x: PAD, y: 260 }));
    if (s.pullquote) {
      f.appendChild(R(PAD, 510, 4, 200, ACC));
      f.appendChild(T(s.pullquote, { f: "Inter", s: "Semi Bold", size: 42, c: WT, lh: 135, w: W - 2 * PAD - 40, x: PAD + 40, y: 510 }));
    }
    if (s.body) f.appendChild(T(s.body, { f: "JetBrains Mono", s: "Regular", size: 32, c: WT, op: 0.65, lh: 155, w: W - 2 * PAD, x: PAD, y: s.pullquote ? 780 : 460 }));
  }
  else if (s.type === "04-list") {
    f.appendChild(T(s.eyebrow, { f: "JetBrains Mono", s: "Medium", size: 28, c: ACC, ls: 8, x: PAD, y: 200 }));
    f.appendChild(T(s.hook, { f: "Inter", s: "Bold", size: 56, c: WT, lh: 115, w: W - 2 * PAD, x: PAD, y: 260 }));
    let y = 500;
    for (const it of s.items) {
      f.appendChild(T(`${it[0]} →`, { f: "JetBrains Mono", s: "Medium", size: 28, c: ACC, x: PAD, y: y + 6 }));
      f.appendChild(T(it[1], { f: "Inter", s: "Semi Bold", size: 40, c: WT, lh: 120, x: PAD + 130, y: y }));
      f.appendChild(T(it[2], { f: "Inter", s: "Regular", size: 28, c: WT, op: 0.55, lh: 135, w: W - PAD - 130 - PAD, x: PAD + 130, y: y + 52 }));
      y += 130;
    }
  }
  else if (s.type === "05-code") {
    f.appendChild(T(s.eyebrow, { f: "JetBrains Mono", s: "Medium", size: 28, c: ACC, ls: 8, x: PAD, y: 200 }));
    f.appendChild(T(s.hook, { f: "Inter", s: "Bold", size: 52, c: WT, lh: 115, w: W - 2 * PAD, x: PAD, y: 260 }));
    f.appendChild(R(PAD, 500, W - 2 * PAD, 560, SURF, { rad: 12, stroke: BORD, sw: 1 }));
    f.appendChild(R(PAD + 30, 530, 14, 14, RED, { rad: 7 }));
    f.appendChild(R(PAD + 54, 530, 14, 14, AMBER, { rad: 7 }));
    f.appendChild(R(PAD + 78, 530, 14, 14, ACC, { rad: 7 }));
    f.appendChild(T(s.filename, { f: "JetBrains Mono", s: "Regular", size: 22, c: WT, op: 0.45, x: PAD + 110, y: 528 }));
    f.appendChild(L(PAD + 20, 572, W - 2 * PAD - 40));
    f.appendChild(T(s.code, { f: "JetBrains Mono", s: "Regular", size: 28, c: WT, op: 0.85, lh: 160, w: W - 2 * PAD - 60, x: PAD + 30, y: 600 }));
    if (s.caption) f.appendChild(T(s.caption, { f: "Inter", s: "Regular", size: 30, c: WT, op: 0.55, lh: 145, w: W - 2 * PAD, x: PAD, y: 1100 }));
  }
  else if (s.type === "06-quote") {
    f.appendChild(T("\u201C", { f: "Inter", s: "Bold", size: 300, c: ACC, lh: 100, x: PAD, y: 280 }));
    f.appendChild(T(s.quote, { f: "Inter", s: "Bold", size: 60, c: WT, lh: 125, w: W - 2 * PAD, x: PAD, y: 560 }));
    f.appendChild(R(PAD, H - PAD - 180, 80, 4, ACC));
    f.appendChild(T(s.attribution, { f: "JetBrains Mono", s: "Medium", size: 26, c: WT, op: 0.5, ls: 8, x: PAD, y: H - PAD - 150 }));
  }
  else if (s.type === "07-compare") {
    f.appendChild(T(s.eyebrow, { f: "JetBrains Mono", s: "Medium", size: 26, c: ACC, ls: 8, x: PAD, y: 200 }));
    f.appendChild(T(s.hook, { f: "Inter", s: "Bold", size: 56, c: WT, lh: 115, w: W - 2 * PAD, x: PAD, y: 260 }));
    const colW = (W - 2 * PAD - 60) / 2;
    f.appendChild(R(PAD, 500, colW, 640, SURF, { rad: 12, stroke: BORD, sw: 1 }));
    f.appendChild(T("✕  WRONG", { f: "JetBrains Mono", s: "Medium", size: 26, c: RED, ls: 6, x: PAD + 30, y: 530 }));
    let yL = 600;
    for (const w of s.wrongs) {
      f.appendChild(T("—", { f: "Inter", s: "Regular", size: 32, c: RED, x: PAD + 30, y: yL }));
      f.appendChild(T(w, { f: "Inter", s: "Regular", size: 30, c: WT, op: 0.85, lh: 135, w: colW - 90, x: PAD + 70, y: yL }));
      yL += 80;
    }
    const rx = PAD + colW + 60;
    f.appendChild(R(rx, 500, colW, 640, SURF, { rad: 12, stroke: ACC, sw: 2 }));
    f.appendChild(T("✓  RIGHT", { f: "JetBrains Mono", s: "Medium", size: 26, c: ACC, ls: 6, x: rx + 30, y: 530 }));
    let yR = 600;
    for (const w of s.rights) {
      f.appendChild(T("→", { f: "Inter", s: "Regular", size: 32, c: ACC, x: rx + 30, y: yR }));
      f.appendChild(T(w, { f: "Inter", s: "Regular", size: 30, c: WT, op: 0.95, lh: 135, w: colW - 90, x: rx + 70, y: yR }));
      yR += 80;
    }
  }
  else if (s.type === "08-cta") {
    const eb = T(s.eyebrow, { f: "JetBrains Mono", s: "Medium", size: 30, c: ACC, ls: 8 });
    eb.x = (W - eb.width) / 2; eb.y = 200; f.appendChild(eb);
    const sec = T(s.secondary, { f: "Inter", s: "Bold", size: 54, c: WT, lh: 120, w: W - 2 * PAD, x: PAD, y: 260, align: "CENTER" });
    f.appendChild(sec);
    // Big avatar
    const D = 320, cx = (W - D) / 2;
    avatar(f, cx, 460, D, { orangeBg: true, thick: true, big: true });
    const nm = T("Saleh Seddik", { f: "Inter", s: "Bold", size: 60, c: WT });
    nm.x = (W - nm.width) / 2; nm.y = 820; f.appendChild(nm);
    const hd = T("@Salehseddik", { f: "JetBrains Mono", s: "Regular", size: 28, c: ACC });
    hd.x = (W - hd.width) / 2; hd.y = 900; f.appendChild(hd);
    const pr = T(s.prompt, { f: "Inter", s: "Bold", size: 56, c: WT });
    pr.x = (W - pr.width) / 2; pr.y = 980; f.appendChild(pr);
    const sub = T("DROP A COMMENT  ·  FOLLOW + CONNECT", { f: "JetBrains Mono", s: "Medium", size: 24, c: WT, op: 0.65, ls: 8 });
    sub.x = (W - sub.width) / 2; sub.y = 1080; f.appendChild(sub);
  }

  footer(f);
  built.push(f);
  xPos += W + GAP;
}

figma.viewport.scrollAndZoomIntoView(built);
return { created: built.length, page: page.name };

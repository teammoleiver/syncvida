import type { BrandKit, Slide, Design } from "./designer-queries";
import { saveAsTemplate } from "./designer-queries";
import { newId } from "./designer-utils";



type Seed = {
  title: string; category: string;
  platform: Design["platform"]; type: "single" | "carousel";
  width: number; height: number;
  slides: Slide[];
};

/**
 * Hand-built LinkedIn cover-slide starter templates.
 * Variants cover the most common LinkedIn carousel/post opening looks:
 *   1. Big bold headline (light bg)
 *   2. Big bold headline (dark bg)
 *   3. Headline + accent block
 *   4. Quote-style cover
 *   5. Stat number cover
 *   6. Photo-overlay cover
 */
export function makeCoverTemplates(brand: BrandKit | null): Seed[] {
  const c = brand?.colors ?? { primary: "#1D9E75", secondary: "#0F6E56", accent: "#F5C451", bg: "#FFFFFF", text: "#0B0F0E" };
  const W = 1080, H = 1350;

  const slide = (bg: any, elements: any[]): Slide => ({ id: newId(), bg, elements });
  const t = (text: string, opts: any) => ({ id: newId(), type: "text", text, font: "heading", weight: 800, align: "left", lineHeight: 1.05, ...opts });
  const r = (opts: any) => ({ id: newId(), type: "shape", shape: "rect", radius: 0, ...opts });
  const ic = (name: string, opts: any) => ({ id: newId(), type: "icon", name, color: c.primary, strokeWidth: 1.75, ...opts });
  const lg = (variant: "light" | "dark", opts: any) => ({ id: newId(), type: "logo", variant, ...opts });

  return [
    // 1. Big bold headline, light bg
    {
      title: "Cover · Big bold headline (light)",
      category: "cover", platform: "linkedin", type: "carousel",
      width: W, height: H,
      slides: [slide(c.bg, [
        t("Stop chasing tool certifications.\nBuild discipline instead.", {
          x: 70, y: 240, w: W - 140, h: 700, size: 110, color: c.text,
        }),
        r({ x: 70, y: 1180, w: 80, h: 6, fill: c.primary }),
        t("Saleh Seddik", { x: 70, y: 1210, w: W - 140, h: 60, size: 28, weight: 600, color: c.text }),
        t("1 / N", { x: 70, y: 1260, w: W - 140, h: 40, size: 22, weight: 500, color: c.secondary }),
      ])],
    },
    // 2. Big bold headline, dark bg
    {
      title: "Cover · Big bold headline (dark)",
      category: "cover", platform: "linkedin", type: "carousel",
      width: W, height: H,
      slides: [slide(c.text, [
        t("3 lessons I wish I knew\nbefore I scaled my\nfirst startup.", {
          x: 70, y: 220, w: W - 140, h: 800, size: 100, color: "#FFFFFF",
        }),
        r({ x: 70, y: 1180, w: 80, h: 6, fill: c.accent }),
        t("Swipe →", { x: 70, y: 1210, w: W - 140, h: 60, size: 30, weight: 700, color: c.accent, align: "left" }),
      ])],
    },
    // 3. Headline + accent block
    {
      title: "Cover · Accent block",
      category: "cover", platform: "linkedin", type: "carousel",
      width: W, height: H,
      slides: [slide(c.bg, [
        r({ x: 0, y: 0, w: 18, h: H, fill: c.primary }),
        t("THE GUIDE", { x: 70, y: 200, w: 800, h: 60, size: 30, weight: 700, color: c.primary, align: "left" }),
        t("How to write a\nLinkedIn carousel\nthat actually converts.", {
          x: 70, y: 280, w: W - 140, h: 700, size: 92, color: c.text,
        }),
        t("A 7-slide playbook", { x: 70, y: 1100, w: W - 140, h: 60, size: 32, weight: 500, color: c.secondary }),
        t("@yourhandle", { x: 70, y: 1240, w: W - 140, h: 40, size: 26, weight: 600, color: c.text, align: "left" }),
      ])],
    },
    // 4. Quote-style cover
    {
      title: "Cover · Quote",
      category: "cover", platform: "linkedin", type: "carousel",
      width: W, height: H,
      slides: [slide(c.bg, [
        t("“", { x: 70, y: 120, w: 200, h: 240, size: 280, weight: 900, color: c.primary, align: "left", lineHeight: 1 }),
        t("If you can't explain it simply,\nyou don't understand it\nwell enough.", {
          x: 70, y: 380, w: W - 140, h: 600, size: 76, weight: 700, color: c.text,
          italic: true,
        }),
        r({ x: 70, y: 1140, w: 80, h: 6, fill: c.primary }),
        t("Albert Einstein", { x: 70, y: 1170, w: W - 140, h: 60, size: 30, weight: 600, color: c.text }),
        t("(allegedly)", { x: 70, y: 1230, w: W - 140, h: 40, size: 24, weight: 400, color: c.secondary }),
      ])],
    },
    // 5. Stat cover
    {
      title: "Cover · Big stat",
      category: "cover", platform: "linkedin", type: "carousel",
      width: W, height: H,
      slides: [slide(c.text, [
        t("87%", { x: 70, y: 200, w: W - 140, h: 540, size: 380, weight: 900, color: c.accent, align: "left", lineHeight: 0.9 }),
        t("of LinkedIn carousels never\nget past slide 2.\nHere's how to fix that.", {
          x: 70, y: 760, w: W - 140, h: 380, size: 56, weight: 600, color: "#FFFFFF",
        }),
        t("Swipe to see the framework →", { x: 70, y: 1240, w: W - 140, h: 40, size: 26, weight: 600, color: c.accent }),
      ])],
    },
    // 6. Photo overlay (no actual photo; uses gradient placeholder so it works without uploads)
    {
      title: "Cover · Gradient overlay",
      category: "cover", platform: "linkedin", type: "carousel",
      width: W, height: H,
      slides: [slide(
        { kind: "linear", angle: 200, stops: [{ offset: 0, color: c.primary }, { offset: 1, color: c.secondary }] } as any,
        [
          r({ x: 0, y: 0, w: W, h: H, fill: { kind: "linear", angle: 180, stops: [{ offset: 0, color: "#00000000" }, { offset: 1, color: "#00000099" }] } as any }),
          t("THE PLAYBOOK", { x: 70, y: 200, w: W - 140, h: 60, size: 30, weight: 800, color: "#FFFFFFCC", align: "left" }),
          t("Five LinkedIn\ngrowth tactics\nthat work in 2026.",
            { x: 70, y: 280, w: W - 140, h: 800, size: 110, color: "#FFFFFF" }),
          r({ x: 70, y: 1180, w: 60, h: 6, fill: c.accent }),
          t("by Saleh Seddik", { x: 70, y: 1210, w: W - 140, h: 60, size: 28, weight: 600, color: "#FFFFFF" }),
        ],
      )],
    },
  ];
}

export async function seedCoverTemplates(brand: BrandKit | null) {
  const seeds = makeCoverTemplates(brand);
  const created: any[] = [];
  for (const s of seeds) {
    try {
      const t = await saveAsTemplate({
        title: s.title, category: s.category,
        platform: s.platform, type: s.type,
        width: s.width, height: s.height,
        slides: s.slides, thumbnail_url: null,
      });
      created.push(t);
    } catch { /* keep going */ }
  }
  return created;
}

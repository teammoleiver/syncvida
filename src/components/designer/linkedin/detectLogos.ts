import { listAssets, type DesignAsset } from "@/lib/designer-queries";

/**
 * Known tool keywords (matches the canvas TOOL_REGISTRY) plus common variants.
 * Returns the canonical tool name when matched.
 */
const TOOL_KEYWORDS: { name: string; matchers: RegExp }[] = [
  { name: "Clay", matchers: /\bclay(\.com)?\b/i },
  { name: "n8n", matchers: /\bn8n\b/i },
  { name: "Claude", matchers: /\bclaude(\s+code)?\b/i },
  { name: "ChatGPT", matchers: /\bchat\s*gpt\b|\bchatgpt\b/i },
  { name: "OpenAI", matchers: /\bopenai\b/i },
  { name: "HubSpot", matchers: /\bhub\s*spot\b|\bhubspot\b/i },
  { name: "Apollo", matchers: /\bapollo\b/i },
  { name: "Smartlead", matchers: /\bsmart\s*lead\b|\bsmartlead\b/i },
  { name: "Instantly", matchers: /\binstantly\b/i },
  { name: "ZoomInfo", matchers: /\bzoom\s*info\b|\bzoominfo\b/i },
  { name: "FindyMail", matchers: /\bfindy\s*mail\b|\bfindymail\b/i },
  { name: "BetterContact", matchers: /\bbetter\s*contact\b|\bbettercontact\b/i },
  { name: "LinkedIn", matchers: /\blinked\s*in\b|\blinkedin\b/i },
  { name: "Sales Navigator", matchers: /\bsales\s*nav(igator)?\b/i },
  { name: "Google", matchers: /\bgoogle\b/i },
  { name: "Microsoft", matchers: /\bmicrosoft\b/i },
  { name: "Make", matchers: /\bmake(\.com)?\b/i },
  { name: "Zapier", matchers: /\bzapier\b/i },
  { name: "Slack", matchers: /\bslack\b/i },
  { name: "Notion", matchers: /\bnotion\b/i },
  { name: "Airtable", matchers: /\bairtable\b/i },
  { name: "Segment", matchers: /\bsegment(\.com)?\b/i },
  { name: "MCP", matchers: /\bmcp\b/i },
];

export type DetectedLogo = {
  name: string;
  asset?: DesignAsset;
  hasAsset: boolean;
};

/**
 * Common English words that are ALSO brand names in the 1295-logo registry
 * (e.g. "Follow", "Impact", "Ready", "Make"). They constantly false-fire on
 * ordinary post copy and CTA chrome ("Follow Saleh…"), so they're excluded
 * from detection. A user who genuinely means one of these tools can still add
 * it by hand from the asset picker. Edit freely to tune precision.
 */
export const DETECTION_STOPWORDS = new Set([
  "follow", "impact", "ready", "make", "close", "front", "default", "live",
  "loop", "loops", "segment", "now", "later", "next", "lead", "leads", "motion",
  "pitch", "frame", "reach", "boost", "sense", "flow", "build", "ship", "launch",
  "grow", "growth", "win", "focus", "brand", "scale", "sync", "signal", "pulse",
  "spark", "beam", "range", "attention", "simple", "smart", "boldly", "drift",
]);

let cachedRegistry: any[] | null = null;

async function getLogosRegistry() {
  if (cachedRegistry) return cachedRegistry;
  try {
    const res = await fetch("/logos-registry.json");
    if (!res.ok) throw new Error();
    cachedRegistry = await res.json();
    return cachedRegistry ?? [];
  } catch {
    return [];
  }
}

/**
 * Scan a body of text for tool/brand mentions, then look them up in our 1295+
 * sector logos registry and the user's Asset Library. Returns detected entries
 * with instantly bindable asset structures.
 */
export async function detectMentionedLogos(text: string): Promise<DetectedLogo[]> {
  if (!text) return [];

  const registry = await getLogosRegistry();
  const lowerText = text.toLowerCase();

  // 1. Scan text for exact word boundaries in our rich sector logos registry
  const matchedEntries = registry.filter((entry) => {
    // Escape special characters to construct a safe RegExp boundary
    const escaped = entry.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(lowerText);
  });

  // 2. Also run the original TOOL_KEYWORDS matchers as a backup/enhancement
  const foundBackup = new Map<string, true>();
  for (const t of TOOL_KEYWORDS) {
    if (t.matchers.test(text)) {
      foundBackup.set(t.name, true);
    }
  }

  // 3. Combine them into unique output structures
  const outMap = new Map<string, DetectedLogo>();

  // Process matched entries from registry first
  matchedEntries.forEach((entry) => {
    outMap.set(entry.name.toLowerCase(), {
      name: entry.name,
      asset: {
        id: entry.id,
        name: entry.name,
        public_url: entry.public_url,
        storage_path: entry.public_url,
        created_at: new Date().toISOString(),
        user_id: "",
        mime: "image/png"
      } as any,
      hasAsset: true
    });
  });

  // Check backup matchers and supplement registry matches
  for (const name of foundBackup.keys()) {
    const lowerName = name.toLowerCase();
    if (!outMap.has(lowerName)) {
      const matchedReg = registry.find((entry) => entry.name.toLowerCase() === lowerName);
      if (matchedReg) {
        outMap.set(lowerName, {
          name: matchedReg.name,
          asset: {
            id: matchedReg.id,
            name: matchedReg.name,
            public_url: matchedReg.public_url,
            storage_path: matchedReg.public_url,
            created_at: new Date().toISOString(),
            user_id: "",
            mime: "image/png"
          } as any,
          hasAsset: true
        });
      } else {
        outMap.set(lowerName, { name, hasAsset: false });
      }
    }
  }

  // Resolve custom uploads for any remaining unmatched logos
  const unmatchedKeys = Array.from(outMap.entries())
    .filter(([_, v]) => !v.hasAsset)
    .map(([k]) => k);

  if (unmatchedKeys.length > 0) {
    const assets = await listAssets().catch(() => [] as DesignAsset[]);
    unmatchedKeys.forEach((needle) => {
      const asset = assets.find((a) =>
        [(a as any).name, a.prompt, a.storage_path]
          .filter(Boolean)
          .some((s: string) => s.toLowerCase().includes(needle)),
      );
      if (asset) {
        const item = outMap.get(needle);
        if (item) {
          item.asset = asset;
          item.hasAsset = true;
        }
      }
    });
  }

  // Drop common-word false positives so the bar + auto-place only show real tools.
  return Array.from(outMap.values()).filter((d) => !DETECTION_STOPWORDS.has(d.name.trim().toLowerCase()));
}

/** Convert a tool name to the chip format the canvas uses ("Name :: Mono :: #bg :: #fg"). */
export function toolNameToChip(name: string): string {
  return name;
}


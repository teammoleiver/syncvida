const fs = require("fs");
const path = require("path");

const LOGOS_DIR = path.join(__dirname, "../public/logos");
const OUTPUT_FILE = path.join(__dirname, "../public/logos-registry.json");

// Special casing capitalization for well-known tech brands
const CUSTOM_CAPS = {
  "n8n": "n8n",
  "clay": "Clay",
  "claude": "Claude",
  "chatgpt": "ChatGPT",
  "hubspot": "HubSpot",
  "smartlead": "Smartlead",
  "instantly": "Instantly",
  "apollo": "Apollo",
  "zoominfo": "ZoomInfo",
  "linkedin": "LinkedIn",
  "zapier": "Zapier",
  "openai": "OpenAI",
  "airtable": "Airtable",
  "salesforce": "Salesforce",
  "crm": "CRM",
  "saas": "SaaS",
  "ai": "AI",
  "github": "GitHub",
  "gitlab": "GitLab",
  "pdf": "PDF",
  "csv": "CSV",
  "api": "API",
  "facebook": "Facebook",
  "instagram": "Instagram",
  "youtube": "YouTube",
  "tiktok": "TikTok",
  "google": "Google",
  "microsoft": "Microsoft",
  "slack": "Slack",
  "notion": "Notion",
  "segment": "Segment",
  "stripe": "Stripe",
  "shopify": "Shopify",
  "mailchimp": "Mailchimp",
  "intercom": "Intercom",
  "figma": "Figma",
  "phanthombuster": "PhantomBuster",
  "lemlist": "lemlist",
  "woodpecker": "Woodpecker",
  "close": "Close",
  "pipedrive": "Pipedrive",
  "hunter": "Hunter",
  "lusha": "Lusha",
};

function capitalizeName(filename) {
  const base = path.parse(filename).name;
  
  // If exact match in custom caps, return it
  if (CUSTOM_CAPS[base.toLowerCase()]) {
    return CUSTOM_CAPS[base.toLowerCase()];
  }

  // Split by common delimiters: space, hyphen, underscore
  const words = base.split(/[-_\s]+/);
  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (CUSTOM_CAPS[lower]) return CUSTOM_CAPS[lower];
      if (word.length === 0) return "";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function generate() {
  if (!fs.existsSync(LOGOS_DIR)) {
    console.error(`Logos directory not found: ${LOGOS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(LOGOS_DIR);
  console.log(`Scanning ${files.length} logo assets...`);

  const registry = files
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return [".png", ".jpg", ".jpeg", ".svg", ".webp", ".avif"].includes(ext);
    })
    .map((file) => {
      const base = path.parse(file).name;
      const cleanId = `sector-logo-${base.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      const name = capitalizeName(file);
      
      return {
        id: cleanId,
        name: name,
        category: "logo",
        public_url: `/logos/${file}`,
        filename: file
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2), "utf8");
  console.log(`Successfully generated registry at ${OUTPUT_FILE} containing ${registry.length} entries.`);
}

generate();

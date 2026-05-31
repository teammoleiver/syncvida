/**
 * Curated registry of high-quality corporate sector logos, expert growth symbols, 
 * and data organizers (graphs/tables) encoded as clean, lightweight vector SVG data URLs.
 * These are fully compatible with both the linkedin template editor and blank canvas editors.
 */

export interface BuiltinAsset {
  id: string;
  name: string;
  category: "logo" | "symbol" | "chart";
  public_url: string;
  width: number;
  height: number;
}

export const BUILTIN_ASSETS: BuiltinAsset[] = [
  // ── SECTOR LOGOS ──
  {
    id: "builtin-logo-clay",
    name: "Clay",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='%2334D399'><rect width='100' height='100' rx='20' fill='%230A0E1A'/><circle cx='50' cy='50' r='25' fill='none' stroke='%2334D399' stroke-width='8'/><path d='M50 25c13.8 0 25 11.2 25 25S63.8 75 50 75' fill='%2334D399'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-n8n",
    name: "n8n",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%23EA4B71'/><circle cx='35' cy='50' r='10' fill='%23FFFFFF'/><circle cx='65' cy='35' r='10' fill='%23FFFFFF'/><circle cx='65' cy='65' r='10' fill='%23FFFFFF'/><path d='M35 50h30M65 35v30' stroke='%23FFFFFF' stroke-width='6' stroke-linecap='round'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-claude",
    name: "Claude",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%23D97757'/><path d='M50 22c-15.5 0-28 12.5-28 28s12.5 28 28 28 28-12.5 28-28-12.5-28-28-28zm0 46c-9.9 0-18-8.1-18-18s8.1-18 18-18 18 8.1 18 18-8.1 18-18 18z' fill='%23FFFFFF'/><circle cx='50' cy='50' r='8' fill='%23FFFFFF'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-chatgpt",
    name: "ChatGPT",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%2310A37F'/><path d='M70 48.5c-.8-4.5-4-8-8.5-8.8-1.5-.3-3-.2-4.5.3l-1-.7c1.3-4.3.4-9.1-2.9-12.4-4-4-10.4-4.5-15-.8-1.5 1.2-2.5 2.8-3.1 4.5l-1-.2c-1.3-4.3-5-7.4-9.5-7.7-5.5-.4-10.5 3.3-11.4 8.8-.5 3 .5 6.1 2.5 8.3l-.3 1.1c-4.3-1.3-9.1-.4-12.4 2.9-4 4-4.5 10.4-.8 15 1.2 1.5 2.8 2.5 4.5 3.1l-.2 1c-4.3 1.3-7.4 5-7.7 9.5-.4 5.5 3.3 10.5 8.8 11.4 3 .5 6.1-.5 8.3-2.5l1.1.3c-1.3 4.3-.4 9.1 2.9 12.4 4 4 10.4 4.5 15 .8 1.5-1.2 2.5-2.8 3.1-4.5l1 .2c1.3 4.3 5 7.4 9.5 7.7 5.5.4 10.5-3.3 11.4-8.8.5-3-.5-6.1-2.5-8.3l.3-1.1c4.3 1.3 9.1.4 12.4-2.9 4-4 4.5-10.4.8-15-1.2-1.5-2.8-2.5-4.5-3.1l.2-1z' stroke='%23FFFFFF' stroke-width='4' stroke-linejoin='round'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-hubspot",
    name: "HubSpot",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%23FF7A59'/><circle cx='50' cy='65' r='12' fill='%23FFFFFF'/><circle cx='30' cy='35' r='8' fill='%23FFFFFF'/><circle cx='70' cy='35' r='8' fill='%23FFFFFF'/><path d='M50 65L30 35M50 65L70 35' stroke='%23FFFFFF' stroke-width='6'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-smartlead",
    name: "Smartlead",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%230EA5E9'/><path d='M25 35h50v35H25z' stroke='%23FFFFFF' stroke-width='6' stroke-linejoin='round'/><path d='M25 35l25 20 25-20' stroke='%23FFFFFF' stroke-width='5' stroke-linejoin='round'/><path d='M15 50h6M15 60h4' stroke='%23FFFFFF' stroke-width='4' stroke-linecap='round'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-instantly",
    name: "Instantly",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%237C3AED'/><circle cx='50' cy='50' r='25' stroke='%23FFFFFF' stroke-width='5'/><circle cx='50' cy='50' r='12' stroke='%23FFFFFF' stroke-width='4'/><path d='M50 20v10M50 70v10' stroke='%23FFFFFF' stroke-width='4' stroke-linecap='round'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-apollo",
    name: "Apollo",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%231B5BFF'/><path d='M50 20l18 35H32l18-35z' fill='%23FFFFFF'/><path d='M50 55v25M40 70h20' stroke='%23FFFFFF' stroke-width='6' stroke-linecap='round'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-mcp",
    name: "MCP",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%23E8654A'/><rect x='30' y='30' width='40' height='40' rx='6' stroke='%23FFFFFF' stroke-width='6'/><circle cx='30' cy='30' r='6' fill='%23FFFFFF'/><circle cx='70' cy='30' r='6' fill='%23FFFFFF'/><circle cx='30' cy='70' r='6' fill='%23FFFFFF'/><circle cx='70' cy='70' r='6' fill='%23FFFFFF'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-linkedin",
    name: "LinkedIn",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%230A66C2'/><path d='M35 32c0 2.2-1.8 4-4 4s-4-1.8-4-4 1.8-4 4-4 4 1.8 4 4zm-8 12h8v24h-8V44zm14 0h8v3.3c1.2-2 3.5-3.8 7-3.8 7.5 0 8.8 4.6 8.8 10.7V68h-8V54.8c0-3.1-.1-7.2-4.4-7.2-4.4 0-5.1 3.4-5.1 7V68h-8V44z' fill='%23FFFFFF'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-google",
    name: "Google",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%23FFFFFF' stroke='%23E2E8F0' stroke-width='2'/><path d='M75 51.4c0-1.8-.2-3.6-.5-5.4H50v10.2h14c-.6 3.1-2.4 5.8-5.1 7.6v6.3h8.3C72 64.7 75 58.7 75 51.4z' fill='%234285F4'/><path d='M50 77c7.3 0 13.4-2.4 17.9-6.5l-8.3-6.3c-2.3 1.5-5.2 2.5-9.6 2.5-7.4 0-13.6-5-15.8-11.7h-8.5v6.6C20.3 71 34 77 50 77z' fill='%2334A853'/><path d='M34.2 60c-.5-1.5-.8-3.2-.8-4.9s.3-3.4.8-4.9v-6.6h-8.5C24.1 47 23 51.4 23 56.1s1.1 9.1 2.9 12.6l8.3-12.7z' fill='%23FBBC05'/><path d='M50 35c4 0 7.6 1.4 10.4 4l7.8-7.8C63.4 26.7 57.3 25 50 25c-16 0-29.7 6-35.3 15.1l8.5 6.6c2.2-6.7 8.4-11.7 15.8-11.7z' fill='%23EA4335'/></svg>`,
    width: 200,
    height: 200,
  },
  {
    id: "builtin-logo-zapier",
    name: "Zapier",
    category: "logo",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'><rect width='100' height='100' rx='20' fill='%23FF4F00'/><path d='M50 25l6 17h18l-14 11 5 17-15-10-15 10 5-17-14-11h18l6-17z' fill='%23FFFFFF'/></svg>`,
    width: 200,
    height: 200,
  },

  // ── GROWTH & VIRAL SYMBOLS ──
  {
    id: "builtin-symbol-verified",
    name: "LinkedIn Verified",
    category: "symbol",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2300E18A'><path d='M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'/></svg>`,
    width: 150,
    height: 150,
  },
  {
    id: "builtin-symbol-growth-arrow",
    name: "Growth Arrow",
    category: "symbol",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300E18A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='22 7 13.5 15.5 8.5 10.5 2 17'/><polyline points='16 7 22 7 22 13'/></svg>`,
    width: 150,
    height: 150,
  },
  {
    id: "builtin-symbol-viral-fire",
    name: "Viral Fire",
    category: "symbol",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23E8654A'><path d='M12 2C11.5 2 11 2.5 11 3c0 2-2 3.5-2 5.5 0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5C18 5.5 15.5 2 12 2zm-2 16.5c0-2.5 2.5-4.5 2.5-4.5s2.5 2 2.5 4.5S13.5 22 12 22s-2-1.5-2-3.5z'/></svg>`,
    width: 150,
    height: 150,
  },
  {
    id: "builtin-symbol-lightning",
    name: "Viral Lightning",
    category: "symbol",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23F4C752'><path d='M13 2v9h7L11 22v-9H4l9-11z'/></svg>`,
    width: 150,
    height: 150,
  },
  {
    id: "builtin-symbol-quotes",
    name: "Sleek Quotes",
    category: "symbol",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%235C6781'><path d='M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z'/></svg>`,
    width: 150,
    height: 150,
  },
  {
    id: "builtin-symbol-lightbulb",
    name: "Idea Bulb",
    category: "symbol",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23F4C752' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 21h6M9 18h6M10 22h4M12 2v2M4.93 4.93l1.41 1.41M19.07 4.93l-1.41 1.41M12 6a6 6 0 0 0-6 6c0 1.66.8 3.13 2.05 4.07a3 3 0 0 1 .95 2.23V19h6v-.7a3 3 0 0 1 .95-2.23C17.2 15.13 18 13.66 18 12a6 6 0 0 0-6-6z'/></svg>`,
    width: 150,
    height: 150,
  },

  // ── DATA & CHARTS ──
  {
    id: "builtin-chart-dashboard",
    name: "Dashboard Line Graph",
    category: "chart",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='12' fill='%23141928' stroke='%23ffffff' stroke-opacity='0.08' stroke-width='1.5'/><path d='M20 90h80' stroke='%235C6781' stroke-width='2' stroke-linecap='round'/><path d='M20 90 L40 60 L60 70 L80 40 L100 50' fill='none' stroke='%2300E18A' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/><circle cx='40' cy='60' r='4' fill='%23FFFFFF'/><circle cx='60' cy='70' r='4' fill='%23FFFFFF'/><circle cx='80' cy='40' r='4' fill='%23FFFFFF'/><circle cx='100' cy='50' r='4' fill='%23FFFFFF'/></svg>`,
    width: 320,
    height: 320,
  },
  {
    id: "builtin-chart-table",
    name: "Metrics Grid Table",
    category: "chart",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='12' fill='%23141928' stroke='%23ffffff' stroke-opacity='0.08' stroke-width='1.5'/><line x1='15' y1='35' x2='105' y2='35' stroke='%2300E18A' stroke-width='2'/><line x1='15' y1='65' x2='105' y2='65' stroke='%235C6781' stroke-width='1' stroke-dasharray='3 3'/><line x1='15' y1='95' x2='105' y2='95' stroke='%235C6781' stroke-width='1' stroke-dasharray='3 3'/><circle cx='30' cy='50' r='4' fill='%235C6781'/><circle cx='90' cy='50' r='4' fill='%2300E18A'/><circle cx='30' cy='80' r='4' fill='%235C6781'/><circle cx='90' cy='80' r='4' fill='%2300E18A'/></svg>`,
    width: 320,
    height: 320,
  },
  {
    id: "builtin-chart-matrix",
    name: "2x2 Quadrant Matrix",
    category: "chart",
    public_url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='12' fill='%23141928' stroke='%23ffffff' stroke-opacity='0.08' stroke-width='1.5'/><line x1='60' y1='15' x2='60' y2='105' stroke='%235C6781' stroke-width='1.5'/><line x1='15' y1='60' x2='105' y2='60' stroke='%235C6781' stroke-width='1.5'/><circle cx='35' cy='35' r='8' fill='%23E8654A' fill-opacity='0.2' stroke='%23E8654A' stroke-width='1.5'/><circle cx='85' cy='35' r='8' fill='%2300E18A' fill-opacity='0.2' stroke='%2300E18A' stroke-width='1.5'/><circle cx='35' cy='85' r='8' fill='%235C6781' fill-opacity='0.2' stroke='%235C6781' stroke-width='1.5'/><circle cx='85' cy='85' r='8' fill='%235C6781' fill-opacity='0.2' stroke='%235C6781' stroke-width='1.5'/></svg>`,
    width: 320,
    height: 320,
  },
];

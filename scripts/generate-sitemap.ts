// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://instaleadsync.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const entries: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/auth", changefreq: "monthly", priority: "0.3" },
  // CRM
  { path: "/crm", changefreq: "daily", priority: "0.9" },
  { path: "/crm/contacts", changefreq: "daily", priority: "0.8" },
  { path: "/crm/companies", changefreq: "weekly", priority: "0.7" },
  { path: "/crm/deals", changefreq: "daily", priority: "0.8" },
  { path: "/crm/pipelines", changefreq: "monthly", priority: "0.4" },
  // Content
  { path: "/social", changefreq: "daily", priority: "0.9" },
  { path: "/social/search", changefreq: "weekly", priority: "0.6" },
  { path: "/social/linkedin", changefreq: "weekly", priority: "0.7" },
  { path: "/social/youtube", changefreq: "weekly", priority: "0.6" },
  { path: "/social/news", changefreq: "weekly", priority: "0.6" },
  { path: "/social/settings", changefreq: "monthly", priority: "0.3" },
  { path: "/content-studio", changefreq: "weekly", priority: "0.8" },
  { path: "/content-planner", changefreq: "weekly", priority: "0.8" },
  { path: "/carousel-generator", changefreq: "weekly", priority: "0.6" },
  { path: "/carousel-history", changefreq: "weekly", priority: "0.5" },
  { path: "/designer", changefreq: "weekly", priority: "0.7" },
  { path: "/designer/brand", changefreq: "monthly", priority: "0.5" },
  { path: "/designer/assets", changefreq: "monthly", priority: "0.5" },
  { path: "/designer/linkedin-templates", changefreq: "monthly", priority: "0.5" },
  // Productivity
  { path: "/projects", changefreq: "weekly", priority: "0.7" },
  { path: "/tasks", changefreq: "weekly", priority: "0.7" },
  { path: "/calendar", changefreq: "weekly", priority: "0.7" },
  { path: "/goals", changefreq: "weekly", priority: "0.6" },
  // Health
  { path: "/nutrition", changefreq: "weekly", priority: "0.6" },
  { path: "/fasting", changefreq: "weekly", priority: "0.6" },
  { path: "/exercise", changefreq: "weekly", priority: "0.6" },
  { path: "/sleep", changefreq: "weekly", priority: "0.5" },
  { path: "/health", changefreq: "weekly", priority: "0.6" },
  { path: "/body", changefreq: "weekly", priority: "0.5" },
  // App
  { path: "/assistant", changefreq: "weekly", priority: "0.5" },
  { path: "/settings", changefreq: "monthly", priority: "0.3" },
];

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ].filter(Boolean).join("\n")
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
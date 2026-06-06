import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    // Pinned: the LinkedIn/Canva/Meta OAuth redirect URIs are registered for
    // localhost:8080. If Vite silently falls back to another port the callback
    // lands on a dead port (ERR_CONNECTION_REFUSED). strictPort makes startup
    // fail loudly instead, so the redirect always matches.
    port: 8080,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "motion-vendor": ["framer-motion"],
          "charts-vendor": ["recharts"],
          "pdf-vendor": ["pdfjs-dist", "jspdf"],
          "image-vendor": ["html-to-image"],
          "markdown-vendor": ["react-markdown"],
          "supabase-vendor": ["@supabase/supabase-js"],
        },
      },
    },
  },
}));

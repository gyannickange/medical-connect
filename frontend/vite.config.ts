import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  optimizeDeps: {
    // Force these onto the initial dependency scan instead of letting Vite
    // discover them lazily the first time a new component imports them —
    // a lazy discovery mid-session forces a re-optimize + cache-hash bump,
    // which orphans any already-open tab ("Outdated Optimize Dep" 504s)
    // until it's hard-refreshed. Add to this list whenever a newly-added
    // component is the first real user of a dependency in the repo.
    include: ["cmdk", "react-day-picker", "date-fns"],
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5200",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

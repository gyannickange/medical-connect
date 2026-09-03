const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");
const path = require("path");

module.exports = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point to the actual frontend source folder
      "@": path.resolve(__dirname, "..", "frontend", "src"),
      "@shared": path.resolve(__dirname, "src", "shared"),
      "@assets": path.resolve(__dirname, "..", "attached_assets"),
    },
  },
  // Serve the real frontend workspace
  root: path.resolve(__dirname, "..", "frontend"),
  publicDir: path.resolve(__dirname, "..", "frontend", "public"),
  css: {
    // Tailwind v3's own config lookup resolves against process.cwd(), not
    // against Vite's `root` above - when this runs from backend/ (dev
    // server, or `npm run build:client`), cwd is backend/, so it would
    // silently fall back to an empty default theme instead of finding
    // frontend/tailwind.config.ts. Load frontend's own postcss/tailwind
    // toolchain explicitly (not backend's, which has an unrelated v4
    // tailwindcss devDependency) so it always resolves the same way this
    // config runs.
    postcss: {
      plugins: [
        require(path.resolve(__dirname, "..", "frontend", "node_modules", "tailwindcss"))(
          path.resolve(__dirname, "..", "frontend", "tailwind.config.ts")
        ),
        require(path.resolve(__dirname, "..", "frontend", "node_modules", "autoprefixer"))(),
      ],
    },
  },
  build: {
    // Output where the Nest static server expects assets
    outDir: path.resolve(__dirname, "dist", "public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: false,
      allow: [
        // Allow the entire workspace
        path.resolve(__dirname, ".."),
      ],
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime"],
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      events: "events",
    },
  },
  optimizeDeps: {
    include: ["events"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-deckgl": [
            "@deck.gl/core",
            "@deck.gl/layers",
            "@deck.gl/mesh-layers",
            "@deck.gl/react",
            "@nebula.gl/edit-modes",
            "@nebula.gl/layers",
          ],
          "vendor-plotly": ["plotly.js-dist-min", "react-plotly.js"],
          "vendor-markdown": ["react-markdown", "remark-gfm", "remark-breaks"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
    include: ["src/**/*.{test,spec}.{js,jsx}"],
  },
});

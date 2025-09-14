import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "POS PWA",
        short_name: "POS",
        start_url: "/",
        display: "standalone",
        background_color: "#0b1020",
        theme_color: "#4f46e5",
        icons: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
     /** 👇 Ensure dev server listens on all interfaces (IPv4),
     * so http://127.0.0.1:5173 works in addition to http://localhost:5173
     */
    host: true, // equivalent to "0.0.0.0"
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});



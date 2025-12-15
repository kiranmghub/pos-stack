import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/features/reports/**/*.{ts,tsx}"],
    },
  },
  server: isDev
    ? {
        host: true,
        port: 5173,
        proxy: {
          // Only used in dev; in prod we serve /api via nginx → gunicorn
          "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
          // Proxy media files to backend
          "/media": { target: "http://127.0.0.1:8000", changeOrigin: true }
        }
      }
    : undefined,
});

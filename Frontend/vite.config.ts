import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development, /api is proxied to the store backend (Node.js), never to SageAPI.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.STORE_BACKEND_URL || "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
  };
});

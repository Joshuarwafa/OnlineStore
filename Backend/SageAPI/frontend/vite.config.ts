import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development, /api calls are forwarded so the browser never makes a cross-origin request:
// /api/admin (sign-in, settings) and /api/images (product pictures) to StoreBackend, which holds the SageAPI key; everything else to
// SageAPI. Override the targets with STORE_BACKEND_URL and SAGE_API_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // 5173 is used by the storefront (Online store/Frontend)
    proxy: {
      "/api/admin": {
        target: process.env.STORE_BACKEND_URL ?? "http://localhost:4000",
      },
      "/api/images": {
        target: process.env.STORE_BACKEND_URL ?? "http://localhost:4000",
      },
      "/api": {
        target: process.env.SAGE_API_URL ?? "http://localhost:5071",
        changeOrigin: true,
      },
    },
  },
});

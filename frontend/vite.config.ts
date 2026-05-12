import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API calls to the FastAPI backend during dev
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
    // Serve static GeoJSON files from the project root's static/ folder
    fs: {
      allow: [".."],
    },
  },
  // Make static/ available at / via the publicDir
  publicDir: "../static",
});

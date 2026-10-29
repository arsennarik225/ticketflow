import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port is pinned to 3000: the backend's emails and Campaign QR codes link to
// http://localhost:3000 routes (README.md "Before you start").
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});

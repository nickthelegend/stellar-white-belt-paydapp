import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` is set for GitHub Pages project sites (served from /<repo>/).
// Override with VITE_BASE when deploying elsewhere (e.g. Netlify/Vercel use "/").
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
});

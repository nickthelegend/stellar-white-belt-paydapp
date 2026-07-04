import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` is set for GitHub Pages project sites (served from /<repo>/).
// Override with VITE_BASE when deploying elsewhere (e.g. Netlify/Vercel use "/").
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
  // Some wallet-kit dependencies (near-js, randombytes) reference Node's
  // `global`, which doesn't exist in the browser. Map it to `globalThis`.
  define: {
    global: "globalThis",
  },
});

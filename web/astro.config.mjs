// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// Static site for GitHub Pages at the custom domain bootcamp.grc.engineering.
// Custom (sub)domain serves at root, so base is '/', not '/repo/'.
export default defineConfig({
  site: "https://bootcamp.grc.engineering",
  base: "/",
  output: "static",
  trailingSlash: "ignore",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: { theme: "github-dark", wrap: true },
  },
});

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/** Fills __PUBLIC_URL__ in index.html (link-preview tags need absolute URLs). */
function publicUrl(url: string): Plugin {
  return {
    name: "kweezlet-public-url",
    transformIndexHtml: (html) => html.replaceAll("__PUBLIC_URL__", url.replace(/\/$/, "")),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), cloudflare(), publicUrl(env.PUBLIC_URL ?? "")],
  };
});

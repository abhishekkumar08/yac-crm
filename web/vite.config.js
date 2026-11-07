import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { kasumi } from "@kasumi/ui/vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), kasumi()],
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom", "recharts", "lucide-react"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
  css: { postcss: { plugins: [tailwindcss(fileURLToPath(new URL("../tailwind.config.js", import.meta.url))), autoprefixer()] } },
  server: { port: 5180, strictPort: true, proxy: { "/api": "http://127.0.0.1:4400" } },
  build: { outDir: fileURLToPath(new URL("../dist", import.meta.url)), emptyOutDir: true },
});

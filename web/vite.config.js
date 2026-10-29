import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  // es2022 for the top-level await in backend.js.
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});

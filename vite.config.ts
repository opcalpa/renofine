import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 5002,
    strictPort: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "/",
  // Implicit process.env -> import.meta.env inlining proved flaky in CI for
  // VITE_TEAM_V2_MASKING (secrets-sourced vars inlined, this literal did not),
  // leaving masking silently OFF in prod. Bake it deterministically here.
  define: {
    "import.meta.env.VITE_TEAM_V2_MASKING": JSON.stringify(
      process.env.VITE_TEAM_V2_MASKING ?? "",
    ),
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});

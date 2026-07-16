import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const rawPort = process.env.PORT;
  const basePath = process.env.BASE_PATH;

  // PORT and BASE_PATH are required for dev/preview but not for production builds.
  // The deployment system provides them via artifact.toml [services.env]; from bash
  // (typecheck, CI) they are absent — only the server config needs them.
  const isServing = command === "serve";

  if (isServing && !rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }

  if (isServing && !basePath) {
    throw new Error("BASE_PATH environment variable is required but was not provided.");
  }

  const port = Number(rawPort ?? "3000");
  const base = basePath ?? "/ai-receptionist/dashboard";

  if (isServing && (Number.isNaN(port) || port <= 0)) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});

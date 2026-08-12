import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { posix as path, resolve } from "node:path";

const viteDefaultFsDeny = [".env", ".env.*", "*.{crt,pem}", "**/.git/**"];

const denyBackendPrivateStorage = {
  name: "deny-backend-private-storage",
  configureServer(server: {
    middlewares: {
      use: (
        handler: (
          request: { url?: string },
          response: { statusCode: number; end: (body: string) => void },
          next: () => void,
        ) => void,
      ) => void;
    };
  }) {
    server.middlewares.use((request, response, next) => {
      try {
        const pathname = path.normalize(
          decodeURIComponent(
            new URL(request.url ?? "/", "http://localhost").pathname,
          ).replace(/\\/g, "/"),
        );
        if (pathname.includes("/backend/storage/app/private/")) {
          response.statusCode = 404;
          response.end("Not Found");
          return;
        }
      } catch {
        response.statusCode = 400;
        response.end("Bad Request");
        return;
      }

      next();
    });
  },
};

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const allowedHosts = (environment.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).hostname);

  return {
    plugins: [denyBackendPrivateStorage, react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      cors: false,
      allowedHosts,
      fs: {
        allow: [process.cwd(), resolve(process.cwd(), "../node_modules")],
        deny: [...viteDefaultFsDeny, "**/backend/storage/app/private/**"],
      },
      proxy: {
        "/api": environment.DEV_API_PROXY_TARGET || "http://127.0.0.1:3001",
      },
    },
  };
});

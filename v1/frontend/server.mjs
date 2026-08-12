import crypto from "node:crypto";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import express from "express";
import httpProxy from "http-proxy";

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile?.(path.resolve(root, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function configuredOrigin(value, name, production) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(`${name} must be an HTTP(S) origin.`);
  }
  if (production && name === "PUBLIC_ORIGIN" && url.protocol !== "https:") {
    throw new Error("PUBLIC_ORIGIN must use HTTPS in production.");
  }
  return url.origin;
}

function configuredInteger(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return number;
}

function safePathname(requestUrl) {
  const pathname = decodeURIComponent(
    new URL(requestUrl, "http://researchnav.local").pathname,
  )
    .replaceAll("\\", "/")
    .toLowerCase();
  if (
    pathname.includes("/backend/storage/app/private/") ||
    pathname.startsWith("/@fs/")
  ) {
    return null;
  }
  return pathname;
}

function securityHeaders(nonce) {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://accounts.google.com`,
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self' https://accounts.google.com",
      "frame-src https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join("; "),
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function createApp(options = {}) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const configuredApiOrigin = options.apiOrigin ?? process.env.SSR_API_ORIGIN;
  if (production && !configuredApiOrigin) {
    throw new Error("SSR_API_ORIGIN is required in production.");
  }
  const apiOrigin = configuredOrigin(
    configuredApiOrigin ?? "http://127.0.0.1:3001",
    "SSR_API_ORIGIN",
    false,
  );
  if (production) {
    configuredOrigin(
      options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? "",
      "PUBLIC_ORIGIN",
      true,
    );
  }
  const apiTimeoutMs = configuredInteger(
    options.apiTimeoutMs ?? process.env.SSR_API_TIMEOUT_MS ?? 5_000,
    "SSR_API_TIMEOUT_MS",
    100,
    120_000,
  );
  const maxBodyBytes = configuredInteger(
    options.maxBodyBytes ?? process.env.SSR_MAX_BODY_BYTES ?? 27 * 1024 * 1024,
    "SSR_MAX_BODY_BYTES",
    32 * 1024,
    100 * 1024 * 1024,
  );

  const app = express();
  const proxy = httpProxy.createProxyServer({
    target: apiOrigin,
    xfwd: true,
    proxyTimeout: apiTimeoutMs,
    timeout: apiTimeoutMs,
  });
  let vite;
  let template = options.template;
  let renderer = options.renderer;

  if (!template) {
    if (production) {
      template = await fs.readFile(
        path.resolve(root, "dist/client/index.html"),
        "utf8",
      );
      renderer ??= await import(
        pathToFileURL(path.resolve(root, "dist/server/entry-server.js")).href
      );
    } else {
      const { createServer } = await import("vite");
      vite = await createServer({
        root,
        server: { middlewareMode: true },
        appType: "custom",
      });
    }
  }

  app.use((request, response, next) => {
    try {
      const pathname = safePathname(request.originalUrl);
      if (pathname === null) return response.status(404).send("Not Found");
      if (!pathname.startsWith("/api/")) return next();

      const transferEncoding = request.headers["transfer-encoding"];
      const contentLengthHeader = request.headers["content-length"];
      if (transferEncoding && contentLengthHeader) {
        return response.status(400).json({ error: "AMBIGUOUS_REQUEST_BODY" });
      }
      if (transferEncoding) {
        return response.status(411).json({ error: "CONTENT_LENGTH_REQUIRED" });
      }
      const contentLength = Number(contentLengthHeader ?? 0);
      const jsonLimit = 32 * 1024;
      const requestLimit = request.is("application/json")
        ? jsonLimit
        : maxBodyBytes;
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength < 0 ||
        contentLength > requestLimit
      ) {
        return response.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
      }
      request.setTimeout(apiTimeoutMs);

      proxy.web(request, response, {}, () => {
        if (!response.headersSent) {
          response.status(502).json({ error: "API_UPSTREAM_UNAVAILABLE" });
        }
      });
    } catch {
      response.status(400).send("Bad Request");
    }
  });

  app.get("/_health", (_request, response) => {
    response.json({ status: "ok" });
  });

  if (production) {
    app.use(
      "/assets",
      express.static(path.resolve(root, "dist/client/assets"), {
        immutable: true,
        maxAge: "1y",
      }),
    );
  } else {
    app.use(vite.middlewares);
  }

  app.use(async (request, response) => {
    const nonce = crypto.randomBytes(18).toString("base64");
    try {
      const requestTemplate = vite
        ? await vite.transformIndexHtml(
            request.originalUrl,
            await fs.readFile(path.resolve(root, "index.html"), "utf8"),
          )
        : template;
      const ssr =
        renderer ?? (await vite.ssrLoadModule("/src/entry-server.tsx"));
      const result = await ssr.render(request.originalUrl, {
        apiOrigin,
        cookie: request.headers.cookie,
        timeoutMs: apiTimeoutMs,
      });
      const html = requestTemplate
        .replace("__INITIAL_STATE__", result.serializedState)
        .replace("__CSP_NONCE__", nonce)
        .replace("<!--app-html-->", result.appHtml);

      if (production) response.set(securityHeaders(nonce));
      for (const cookie of result.setCookies)
        response.append("Set-Cookie", cookie);
      response.status(result.statusCode).type("html").send(html);
    } catch (error) {
      vite?.ssrFixStacktrace(error);
      console.error(
        "SSR request failed",
        error instanceof Error ? error.message : error,
      );
      if (production) response.set(securityHeaders(nonce));
      response
        .status(request.path === "/app" ? 503 : 500)
        .type("html")
        .send(
          "<!doctype html><title>ResearchNAV unavailable</title><h1>ResearchNAV is temporarily unavailable.</h1>",
        );
    }
  });

  return app;
}

export async function start() {
  const app = await createApp();
  const port = configuredInteger(process.env.PORT ?? 5173, "PORT", 1, 65_535);
  const host = process.env.HOST ?? "0.0.0.0";
  return app.listen(port, host, () => {
    console.log(`ResearchNAV SSR listening on http://${host}:${port}`);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await start();
}

// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { resolve } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";

describe("Vite backend private storage denial", () => {
  let server: ViteDevServer;
  let origin: string;
  const privateDirectory = resolve(
    "../backend/storage/app/private/vite-security-test",
  );
  const privateFile = resolve(privateDirectory, "sentinel.txt");

  beforeAll(async () => {
    await mkdir(privateDirectory, { recursive: true });
    await writeFile(privateFile, "private sentinel");
    server = await createServer({
      configFile: "vite.config.ts",
      optimizeDeps: { noDiscovery: true },
    });
    server.config.server.port = 0;
    server.config.server.strictPort = false;
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new Error("Vite did not expose an HTTP address");
    }
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await server?.close();
    await rm(privateDirectory, { recursive: true, force: true });
  });

  it("retains Vite defaults and denies canonical and /@fs corpus URLs", async () => {
    expect(server.config.server.fs.deny).toEqual(
      expect.arrayContaining([
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/backend/storage/app/private/**",
      ]),
    );
    expect(server.config.server.fs.allow).toContain(
      resolve("../node_modules").replace(/\\/g, "/"),
    );

    const absoluteDocumentPath = privateFile.replace(/\\/g, "/");
    const [index, canonical, encoded, absolute] = await Promise.all([
      fetch(`${origin}/`),
      fetch(
        `${origin}/backend/storage/app/private/vite-security-test/sentinel.txt`,
      ),
      fetch(
        `${origin}/backend/storage/app/%70rivate/vite-security-test/sentinel.txt`,
      ),
      fetch(`${origin}/@fs/${absoluteDocumentPath}`),
    ]);

    expect(index.status).toBe(200);
    expect(canonical.status).not.toBe(200);
    expect(encoded.status).not.toBe(200);
    expect(absolute.status).not.toBe(200);
  }, 20_000);
});

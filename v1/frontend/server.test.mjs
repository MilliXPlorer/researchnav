// @vitest-environment node
import http from "node:http";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./server.mjs";

const template = `<!doctype html><html><body><div id="root"><!--app-html--></div><script id="__RESEARCHNAV_STATE__" type="application/json" nonce="__CSP_NONCE__">__INITIAL_STATE__</script></body></html>`;
const servers = [];

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      servers.push(server);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function upstream(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, "127.0.0.1", () => {
      servers.push(server);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise((resolve) => server.close(() => resolve(undefined))),
      ),
  );
});

describe("SSR gateway", () => {
  it("documents a browser-safe development host", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    );

    expect(source).toContain('production ? "0.0.0.0" : "127.0.0.1"');
    expect(source).toContain('browserHost = ["0.0.0.0", "::"]');
  });

  it("allows Vite filesystem modules in development", async () => {
    const app = await createApp({ production: false });
    const origin = await listen(app);
    const fontPath = resolve("../node_modules/@fontsource/inter/400.css")
      .replace(/\\/g, "/")
      .replace(/^\//, "");

    const response = await fetch(`${origin}/@fs/${fontPath}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
  });

  it("adds production security headers and denies private paths", async () => {
    const apiOrigin = await upstream((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [], links: { next: null } }));
    });
    const app = await createApp({
      production: true,
      publicOrigin: "https://researchnav.example.test",
      apiOrigin,
      template,
      renderer: {
        render: async () => ({
          appHtml: "<main>SSR content</main>",
          serializedState: '{"version":1}',
          statusCode: 200,
          setCookies: ["researchnav_sid=renewed; HttpOnly; SameSite=Lax"],
        }),
      },
    });
    const origin = await listen(app);

    const page = await fetch(origin);
    expect(await page.text()).toContain("SSR content");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(page.headers.get("set-cookie")).toContain("researchnav_sid=renewed");

    const privateResponse = await fetch(
      `${origin}/backend/storage/app/%70rivate/research_studies/ics/file.docx`,
    );
    expect(privateResponse.status).toBe(404);
    expect(await privateResponse.text()).not.toContain("SSR content");

    const viteFsResponse = await fetch(`${origin}/@fs/C:/workspace/file.css`);
    expect(viteFsResponse.status).toBe(404);
    expect(await viteFsResponse.text()).not.toContain("SSR content");
  });

  it("redirects protected anonymous renders to the landing page", async () => {
    const apiOrigin = await upstream((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [], links: { next: null } }));
    });
    const app = await createApp({
      production: true,
      publicOrigin: "https://researchnav.example.test",
      apiOrigin,
      template,
      renderer: {
        render: async () => ({
          appHtml: "",
          serializedState: "{}",
          statusCode: 302,
          redirectTo: "/",
          setCookies: [
            "researchnav_sid=expired; Max-Age=0; HttpOnly; SameSite=Lax",
          ],
        }),
      },
    });
    const origin = await listen(app);

    const response = await fetch(`${origin}/app`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain(
      "researchnav_sid=expired",
    );
    expect(await response.text()).not.toContain("SSR content");
  });

  it("streams API method, body, cookie, origin, and response", async () => {
    const apiOrigin = await upstream(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          method: request.method,
          body: Buffer.concat(chunks).toString(),
          cookie: request.headers.cookie,
          origin: request.headers.origin,
        }),
      );
    });
    const app = await createApp({
      production: true,
      publicOrigin: "https://researchnav.example.test",
      apiOrigin,
      template,
      renderer: {
        render: async () => ({
          appHtml: "",
          serializedState: "{}",
          statusCode: 200,
          setCookies: [],
        }),
      },
    });
    const origin = await listen(app);

    const response = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "researchnav_sid=abc",
        origin: "https://researchnav.example.test",
      },
      body: '{"title":"SSR"}',
    });

    await expect(response.json()).resolves.toEqual({
      method: "POST",
      body: '{"title":"SSR"}',
      cookie: "researchnav_sid=abc",
      origin: "https://researchnav.example.test",
    });
  });

  it("returns JSON 502 when the API upstream is unavailable", async () => {
    const unavailable = http.createServer();
    const apiOrigin = await listen(unavailable);
    await new Promise((resolve) => unavailable.close(() => resolve(undefined)));
    servers.splice(servers.indexOf(unavailable), 1);
    const app = await createApp({
      production: true,
      publicOrigin: "https://researchnav.example.test",
      apiOrigin,
      template,
      renderer: {
        render: async () => ({
          appHtml: "",
          serializedState: "{}",
          statusCode: 200,
          setCookies: [],
        }),
      },
    });
    const origin = await listen(app);

    const response = await fetch(`${origin}/api/health`);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "API_UPSTREAM_UNAVAILABLE",
    });
  });

  it("rejects oversized API bodies before proxying", async () => {
    let proxied = false;
    const apiOrigin = await upstream((_request, response) => {
      proxied = true;
      response.end();
    });
    const app = await createApp({
      production: true,
      publicOrigin: "https://researchnav.example.test",
      apiOrigin,
      maxBodyBytes: 64 * 1024,
      template,
      renderer: {
        render: async () => ({
          appHtml: "",
          serializedState: "{}",
          statusCode: 200,
          setCookies: [],
        }),
      },
    });
    const origin = await listen(app);

    const response = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ value: "x".repeat(33 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(proxied).toBe(false);
  });

  it("applies the smaller transport limit to profile photos", async () => {
    let proxied = false;
    const apiOrigin = await upstream((_request, response) => {
      proxied = true;
      response.end();
    });
    const app = await createApp({
      production: true,
      publicOrigin: "https://researchnav.example.test",
      apiOrigin,
      template,
      renderer: {
        render: async () => ({
          appHtml: "",
          serializedState: "{}",
          statusCode: 200,
          setCookies: [],
        }),
      },
    });
    const origin = await listen(app);

    for (const path of ["/api/profile/photo", "/api/profile/photo/"]) {
      const response = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=test" },
        body: Buffer.alloc(3 * 1024 * 1024 + 1),
      });
      expect(response.status).toBe(413);
    }
    expect(proxied).toBe(false);
  });

  it("keeps security headers on SSR failures", async () => {
    const apiOrigin = await upstream((_request, response) => response.end());
    const app = await createApp({
      production: true,
      publicOrigin: "https://researchnav.example.test",
      apiOrigin,
      template,
      renderer: {
        render: async () => {
          throw new Error("forced failure");
        },
      },
    });
    const origin = await listen(app);

    const response = await fetch(origin);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});

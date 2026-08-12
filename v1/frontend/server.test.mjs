// @vitest-environment node
import http from "node:http";
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
          setCookies: ["researchnav.sid=renewed; HttpOnly; SameSite=Lax"],
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
    expect(page.headers.get("set-cookie")).toContain("researchnav.sid=renewed");

    const privateResponse = await fetch(
      `${origin}/backend/storage/app/%70rivate/research_studies/ics/file.docx`,
    );
    expect(privateResponse.status).toBe(404);
    expect(await privateResponse.text()).not.toContain("SSR content");
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
        cookie: "researchnav.sid=abc",
        origin: "https://researchnav.example.test",
      },
      body: '{"title":"SSR"}',
    });

    await expect(response.json()).resolves.toEqual({
      method: "POST",
      body: '{"title":"SSR"}',
      cookie: "researchnav.sid=abc",
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

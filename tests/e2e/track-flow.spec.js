import { test, expect, chromium } from "@playwright/test";
import http from "http";
import fs from "fs";
import path from "path";

function startFixtureServer() {
  const fixturePath = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "yad2_item.html"
  );
  const html = fs.readFileSync(fixturePath);

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/realestate/item/")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function startApiServer(options = {}) {
  const { unauthorized = false } = options;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString() || "{}";
      const data = JSON.parse(body);

      if (req.url === "/auth/login" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            token: "test-token",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            user: { name: "Test" }
          })
        );
        return;
      }

      if (req.url === "/auth/request-code" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.url === "/auth/verify-code" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            token: "test-token",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            user: { name: "Test" }
          })
        );
        return;
      }

      if (req.url === "/properties/check" && req.method === "POST") {
        if (unauthorized) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ tracked: false, signals: [] }));
        return;
      }

      if (req.url === "/properties/track" && req.method === "POST") {
        if (unauthorized) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ tracked: true, redoxUrl: "https://redox.local/1" })
        );
        return;
      }

      if (req.url === "/properties/tracked" && req.method === "GET") {
        if (unauthorized) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([]));
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function getExtensionId(context) {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 10000 }));
  return worker.url().split("/")[2];
}

test("track property flow", async () => {
  const fixtureServer = await startFixtureServer();
  const apiServer = await startApiServer();

  const extensionPath = path.join(process.cwd(), "dist");
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const listingPage = await context.newPage();
    await listingPage.goto(
      `http://127.0.0.1:${fixtureServer.port}/realestate/item/abc123`
    );

    const extensionId = await getExtensionId(context);

    const popup = await context.newPage();
    const apiBaseUrl = `http://127.0.0.1:${apiServer.port}`;
    await popup.goto(
      `chrome-extension://${extensionId}/popup.html?apiBaseUrl=${encodeURIComponent(
        apiBaseUrl
      )}`
    );

    await popup.waitForSelector("#send-redox-btn");
    await popup.click("#send-redox-btn");
    await popup.fill("input[name=contact]", "test@example.com");
    await popup.click("#request-code-form button[type=submit]");
    await popup.fill("input[name=code]", "1234");

    await popup.waitForSelector("#send-redox-btn");
    await popup.click("#send-redox-btn");

    await popup.waitForSelector("#open-redox-btn");

    const url = await popup.waitForFunction(() => window.__redoxLastUrl, null, {
      timeout: 3000
    });
    const redoxUrl = await url.jsonValue();
    expect(
      redoxUrl.startsWith("http://localhost:1721/#/AddProperty/?data=")
    ).toBeTruthy();

    const hash = new URL(redoxUrl).hash || "";
    const query = hash.split("?")[1] || "";
    const params = new URLSearchParams(query);
    const encoded = params.get("data");
    const payload = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8")
    );
    expect(payload?.ReferenceId).toBe("yad2:abc123");
    expect(payload?.Address).toBe("Herzl 1");
  } finally {
    await context.close();
    fixtureServer.server.close();
    apiServer.server.close();
  }
});

test("logs out on unauthorized response", async () => {
  const fixtureServer = await startFixtureServer();
  const apiServer = await startApiServer({ unauthorized: true });

  const extensionPath = path.join(process.cwd(), "dist");
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const listingPage = await context.newPage();
    await listingPage.goto(
      `http://127.0.0.1:${fixtureServer.port}/realestate/item/abc123`
    );

    const extensionId = await getExtensionId(context);

    const popup = await context.newPage();
    const apiBaseUrl = `http://127.0.0.1:${apiServer.port}`;
    await popup.goto(
      `chrome-extension://${extensionId}/popup.html?apiBaseUrl=${encodeURIComponent(
        apiBaseUrl
      )}`
    );

    await popup.waitForSelector("#send-redox-btn");
    await popup.click("#send-redox-btn");
    await popup.fill("input[name=contact]", "test@example.com");
    await popup.click("#request-code-form button[type=submit]");
    await popup.fill("input[name=code]", "1234");
    await popup.waitForSelector("#request-code-form");
  } finally {
    await context.close();
    fixtureServer.server.close();
    apiServer.server.close();
  }
});

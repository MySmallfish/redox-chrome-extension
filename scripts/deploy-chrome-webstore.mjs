import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const zipPath = path.resolve(process.cwd(), args.zip || process.env.PACKAGE_ZIP || "");

const config = {
  publisherId: firstSet("CHROME_WEBSTORE_PUBLISHER_ID", "CWS_PUBLISHER_ID"),
  extensionId: firstSet("CHROME_EXTENSION_ID", "CHROME_WEBSTORE_EXTENSION_ID", "CWS_EXTENSION_ID"),
  clientId: firstSet("CHROME_WEBSTORE_CLIENT_ID", "CWS_CLIENT_ID"),
  clientSecret: firstSet("CHROME_WEBSTORE_CLIENT_SECRET", "CWS_CLIENT_SECRET"),
  refreshToken: firstSet("CHROME_WEBSTORE_REFRESH_TOKEN", "CWS_REFRESH_TOKEN")
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.log(`Skipping Chrome Web Store deployment; missing ${missing.join(", ")}.`);
  process.exit(0);
}

if (!zipPath || !(await exists(zipPath))) {
  throw new Error(`Package ZIP does not exist: ${zipPath}`);
}

const token = await getAccessToken(config);
const itemName = `publishers/${config.publisherId}/items/${config.extensionId}`;
const upload = await uploadPackage(itemName, zipPath, token);
await waitForUploadIfNeeded(itemName, token, upload);
const publish = await publishPackage(itemName, token);

console.log(
  `Chrome Web Store publish submitted for ${publish.itemId || config.extensionId} with state ${
    publish.state || "unknown"
  }.`
);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    parsed[key] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function firstSet(...names) {
  return names.map((name) => process.env[name]).find(Boolean);
}

async function exists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.access_token) {
    throw new Error("Chrome Web Store OAuth response did not include an access token.");
  }
  return response.access_token;
}

async function uploadPackage(itemName, packagePath, token) {
  const zipBytes = await fs.promises.readFile(packagePath);
  const url = `https://chromewebstore.googleapis.com/upload/v2/${itemName}:upload`;
  const response = await fetchJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/zip"
    },
    body: zipBytes
  });

  const uploadState = response.uploadState || "SUCCEEDED";
  if (uploadState === "FAILED") {
    throw new Error(`Chrome Web Store upload failed: ${JSON.stringify(response)}`);
  }
  console.log(`Chrome Web Store upload state: ${uploadState}.`);
  return response;
}

async function waitForUploadIfNeeded(itemName, token, upload) {
  if (upload.uploadState !== "IN_PROGRESS") {
    return;
  }

  const statusUrl = `https://chromewebstore.googleapis.com/v2/${itemName}:fetchStatus`;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await delay(5000);
    const status = await fetchJson(statusUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    const uploadState = status.lastAsyncUploadState;
    console.log(`Chrome Web Store async upload state: ${uploadState || "unknown"}.`);

    if (uploadState === "SUCCEEDED") {
      return;
    }
    if (uploadState === "FAILED" || uploadState === "NOT_FOUND") {
      throw new Error(`Chrome Web Store async upload failed: ${JSON.stringify(status)}`);
    }
  }

  throw new Error("Chrome Web Store upload did not finish before the timeout.");
}

async function publishPackage(itemName, token) {
  return fetchJson(`https://chromewebstore.googleapis.com/v2/${itemName}:publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" })
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

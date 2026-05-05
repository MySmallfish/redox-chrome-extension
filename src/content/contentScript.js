import { getAdapterForUrl } from "../adapters/registry.js";
import { emptyNormalized } from "../shared/normalizedModel.js";

const NAVIGATION_EVENT = "REDOX_NAVIGATION";
let lastUrl = window.location.href;

function notifyNavigation() {
  const current = window.location.href;
  if (current === lastUrl) return;
  lastUrl = current;
  try {
    chrome.runtime.sendMessage({ type: NAVIGATION_EVENT, url: current });
  } catch {
    // Ignore navigation broadcast errors (e.g. if extension is reloading).
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "DETECT_PROPERTY") return false;
  detectAndExtract()
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({
        detected: false,
        error: error?.message || "detect_failed",
        warnings: ["detect_failed"]
      });
    });
  return true;
});

// SPA navigation support: trigger re-detect on history changes.
const originalPushState = history.pushState;
history.pushState = function (...args) {
  originalPushState.apply(this, args);
  notifyNavigation();
};
const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  notifyNavigation();
};
window.addEventListener("popstate", () => notifyNavigation());

async function detectAndExtract() {
  const url = window.location.href;
  const adapter = getAdapterForUrl(url);
  if (!adapter) {
    return { detected: false, warnings: [] };
  }
  let detected = adapter.detect(document, url);
  if (!detected) {
    detected = await waitForDetect(adapter, url);
  }

  let normalized = emptyNormalized();
  let warnings = [];

  try {
    normalized = adapter.extract(document, url);
  } catch {
    warnings.push("extract_failed");
  }

  const externalId = adapter.getExternalId(url);
  const canonicalUrl = adapter.canonicalizeUrl(url);

  if (!externalId) warnings.push("missing_external_id");
  if (!normalized.address && !normalized.title) warnings.push("missing_title");

  return {
    detected: detected || Boolean(normalized.address || normalized.title || normalized.price),
    siteId: adapter.siteId,
    canonicalUrl,
    externalId,
    normalized,
    warnings
  };
}

async function waitForDetect(adapter, url) {
  const start = Date.now();
  const timeoutMs = 3500;
  const intervalMs = 250;

  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs);
    if (adapter.detect(document, url)) return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}



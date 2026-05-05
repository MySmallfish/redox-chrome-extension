const SAMPLE_FILES = {
  requestCode: "data/auth-request-code-response.json",
  verifyCode: "data/auth-verify-code-response.json",
  checkTracked: "data/check-tracked-response.json",
  trackProperty: "data/track-property-response.json",
  listTracked: "data/list-tracked-response.json"
};

function buildFallbackLogin() {
  return {
    token: "mock-token",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    user: { name: "Mock" }
  };
}

const sampleCache = new Map();

function getRuntimeUrl(path) {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

async function loadSample(path, fallback) {
  if (sampleCache.has(path)) return sampleCache.get(path);
  if (typeof fetch !== "function") return fallback;
  try {
    const response = await fetch(getRuntimeUrl(path));
    if (!response.ok) throw new Error("sample_unavailable");
    const json = await response.json();
    sampleCache.set(path, json);
    return json;
  } catch {
    sampleCache.set(path, fallback);
    return fallback;
  }
}

export function createMockApiClient() {
  const tracked = [];

  async function login() {
    return buildFallbackLogin();
  }

  async function requestCode() {
    return loadSample(SAMPLE_FILES.requestCode, { ok: true });
  }

  async function verifyCode() {
    const fallback = buildFallbackLogin();
    const sample = await loadSample(SAMPLE_FILES.verifyCode, fallback);
    const result = { ...sample, ...fallback };
    const exp = Date.parse(result.expiresAt || "");
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      result.expiresAt = fallback.expiresAt;
    }
    if (!result.token) {
      result.token = fallback.token;
    }
    if (!result.user) {
      result.user = fallback.user;
    }
    return result;
  }

  async function checkTracked() {
    return loadSample(SAMPLE_FILES.checkTracked, { tracked: false, signals: [] });
  }

  async function trackProperty(payload) {
    tracked.push(payload);
    const sample = await loadSample(SAMPLE_FILES.trackProperty, {
      tracked: true,
      redoxUrl: "https://redox.local/mock"
    });
    return { ...sample, tracked: true };
  }

  async function listTracked() {
    const sample = await loadSample(SAMPLE_FILES.listTracked, null);
    if (Array.isArray(sample) && sample.length) return sample;
    return tracked.map((item) => ({
      title: item.Address || item.City || "Property",
      canonicalUrl: "",
      redoxUrl: "https://redox.local/mock"
    }));
  }

  return { login, requestCode, verifyCode, checkTracked, trackProperty, listTracked };
}

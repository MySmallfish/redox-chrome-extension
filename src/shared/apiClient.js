export class UnauthorizedError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
    this.code = "unauthorized";
  }
}

export function createApiClient({ baseUrl, getToken, fetchFn = fetch }) {
  const normalizedBase = baseUrl?.replace(/\/$/, "") || "";

  async function request(path, options = {}) {
    const url = `${normalizedBase}${path}`;
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");

    const token = typeof getToken === "function" ? await getToken() : null;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetchFn(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedError();
    }
    if (!response.ok) {
      const text = await safeText(response);
      throw new Error(text || `Request failed: ${response.status}`);
    }
    return safeJson(response);
  }

  async function login(credentials) {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    });
  }

  async function requestCode(payload) {
    return request("/auth/request-code", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function verifyCode(payload) {
    return request("/auth/verify-code", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function checkTracked(payload) {
    return request("/properties/check", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function trackProperty(payload) {
    return request("/properties/track", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function listTracked() {
    return request("/properties/tracked", { method: "GET" });
  }

  return {
    login,
    requestCode,
    verifyCode,
    checkTracked,
    trackProperty,
    listTracked
  };
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}



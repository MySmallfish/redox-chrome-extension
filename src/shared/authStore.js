const AUTH_KEY = "redox.auth";
const USER_KEY = "redox.user";
const PROPERTY_TYPES_KEY = "redox.propertyTypes";

export function createMemoryStorage() {
  const store = new Map();
  return {
    get: async (key) => {
      if (Array.isArray(key)) {
        const out = {};
        for (const k of key) out[k] = store.get(k);
        return out;
      }
      return { [key]: store.get(key) };
    },
    set: async (data) => {
      Object.entries(data).forEach(([k, v]) => store.set(k, v));
    },
    remove: async (key) => {
      const keys = Array.isArray(key) ? key : [key];
      keys.forEach((k) => store.delete(k));
    }
  };
}

export function defaultStorage() {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return chromeStorageAdapter(chrome.storage.local);
  }
  if (typeof localStorage !== "undefined") {
    return localStorageAdapter(localStorage);
  }
  return createMemoryStorage();
}

export async function getAuth(storage = defaultStorage()) {
  const data = await storage.get(AUTH_KEY);
  return data[AUTH_KEY] || null;
}

export async function setAuth(auth, storage = defaultStorage()) {
  await storage.set({ [AUTH_KEY]: auth });
}

export async function clearAuth(storage = defaultStorage()) {
  await storage.remove(AUTH_KEY);
}

export async function getUser(storage = defaultStorage()) {
  const data = await storage.get(USER_KEY);
  return data[USER_KEY] || null;
}

export async function setUser(user, storage = defaultStorage()) {
  await storage.set({ [USER_KEY]: user });
}

export async function clearUser(storage = defaultStorage()) {
  await storage.remove(USER_KEY);
}

export async function getPropertyTypes(storage = defaultStorage()) {
  const data = await storage.get(PROPERTY_TYPES_KEY);
  return data[PROPERTY_TYPES_KEY] || [];
}

export async function setPropertyTypes(propertyTypes, storage = defaultStorage()) {
  await storage.set({ [PROPERTY_TYPES_KEY]: propertyTypes || [] });
}

export async function clearPropertyTypes(storage = defaultStorage()) {
  await storage.remove(PROPERTY_TYPES_KEY);
}

export function isExpired(auth, now = Date.now()) {
  if (!auth?.expiresAt) return false;
  const exp = new Date(auth.expiresAt).getTime();
  if (!Number.isFinite(exp)) return false;
  return now >= exp;
}

function chromeStorageAdapter(area) {
  return {
    get: (key) =>
      new Promise((resolve) => {
        area.get(key, (result) => resolve(result || {}));
      }),
    set: (data) =>
      new Promise((resolve) => {
        area.set(data, () => resolve());
      }),
    remove: (key) =>
      new Promise((resolve) => {
        area.remove(key, () => resolve());
      })
  };
}

function localStorageAdapter(storage) {
  return {
    get: async (key) => {
      const raw = storage.getItem(key);
      return { [key]: raw ? JSON.parse(raw) : null };
    },
    set: async (data) => {
      for (const [k, v] of Object.entries(data)) {
        storage.setItem(k, JSON.stringify(v));
      }
    },
    remove: async (key) => {
      storage.removeItem(key);
    }
  };
}



const STORAGE_KEY = "redox.localTracked";

const memoryStore = {
  _data: {},
  getItem(key) {
    return this._data[key] ?? null;
  },
  setItem(key, value) {
    this._data[key] = String(value);
  },
  removeItem(key) {
    delete this._data[key];
  }
};

function getStorage() {
  if (typeof localStorage !== "undefined") return localStorage;
  return memoryStore;
}

export function loadLocalTracked() {
  const storage = getStorage();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLocalTracked(map) {
  const storage = getStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(map || {}));
}

export function upsertLocalTracked(map, record) {
  if (!record?.canonicalUrl) return map || {};
  return { ...(map || {}), [record.canonicalUrl]: record };
}

export function listLocalTracked(map) {
  return Object.values(map || {}).sort((a, b) => {
    const aTime = Date.parse(a.trackedAt || 0);
    const bTime = Date.parse(b.trackedAt || 0);
    return bTime - aTime;
  });
}

export function buildLocalRecord(detection) {
  const normalized = detection?.normalized || {};
  return {
    canonicalUrl: detection?.canonicalUrl || "",
    siteId: detection?.siteId || "",
    externalId: detection?.externalId || "",
    title: normalized.title || normalized.address || "",
    address: normalized.address || "",
    city: normalized.city || "",
    price: normalized.price ?? null,
    rooms: normalized.rooms ?? null,
    areaSqm: normalized.areaSqm ?? null,
    floor: normalized.floor ?? null,
    trackedAt: new Date().toISOString(),
    lastSeen: null,
    visitCount: 0,
    notes: "",
    comments: [],
    tags: [],
    reminderAt: "",
    lastSnapshot: null,
    changeHistory: [],
    lastChangeAt: null,
    lastChangeFields: []
  };
}

export function normalizeTags(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((tag) => String(tag || "").trim())
          .filter(Boolean)
      )
    );
  }
  return Array.from(
    new Set(
      String(input)
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

export function applyLocalDetails(record, details = {}) {
  const updated = { ...record };
  if (details.notes != null) updated.notes = String(details.notes);
  if (details.tags != null) updated.tags = normalizeTags(details.tags);
  if (details.reminderAt != null) updated.reminderAt = details.reminderAt || "";
  if (details.comment) {
    const text = String(details.comment).trim();
    if (text) {
      const next = Array.isArray(updated.comments) ? [...updated.comments] : [];
      next.unshift({ text, at: new Date().toISOString() });
      updated.comments = next.slice(0, 50);
    }
  }
  return updated;
}

export function updateLocalFromDetection(map, detection, options = {}) {
  const { createIfMissing = false } = options;
  const canonicalUrl = detection?.canonicalUrl;
  if (!canonicalUrl) return { map: map || {}, record: null, list: listLocalTracked(map) };

  const existing = map?.[canonicalUrl];
  if (!existing && !createIfMissing) {
    return { map: map || {}, record: null, list: listLocalTracked(map) };
  }

  const base = existing ? { ...existing } : buildLocalRecord(detection);
  const now = new Date().toISOString();
  const normalized = detection?.normalized || {};

  if (!base.trackedAt) base.trackedAt = now;
  base.lastSeen = now;
  base.visitCount = (base.visitCount || 0) + 1;

  base.title = normalized.title || normalized.address || base.title || "";
  base.address = normalized.address || base.address || "";
  base.city = normalized.city || base.city || "";
  if (normalized.price != null) base.price = normalized.price;
  if (normalized.rooms != null) base.rooms = normalized.rooms;
  if (normalized.areaSqm != null) base.areaSqm = normalized.areaSqm;
  if (normalized.floor != null) base.floor = normalized.floor;

  const snapshot = {
    price: base.price,
    rooms: base.rooms,
    areaSqm: base.areaSqm,
    floor: base.floor
  };

  if (base.lastSnapshot) {
    const changes = diffSnapshot(base.lastSnapshot, snapshot);
    if (changes.length) {
      base.changeHistory = [...(base.changeHistory || []), { at: now, changes, snapshot }];
      base.lastChangeAt = now;
      base.lastChangeFields = changes;
    }
  }
  base.lastSnapshot = snapshot;

  const updatedMap = upsertLocalTracked(map || {}, base);
  return { map: updatedMap, record: base, list: listLocalTracked(updatedMap) };
}

export function updateLocalWithDetails(map, detection, details = {}) {
  const canonicalUrl = detection?.canonicalUrl;
  if (!canonicalUrl) return { map: map || {}, record: null, list: listLocalTracked(map) };
  const existing = map?.[canonicalUrl];
  const base = existing ? { ...existing } : buildLocalRecord(detection);
  const updated = applyLocalDetails(base, details);
  const updatedMap = upsertLocalTracked(map || {}, updated);
  return { map: updatedMap, record: updated, list: listLocalTracked(updatedMap) };
}

function diffSnapshot(prev, next) {
  const fields = [];
  if (prev.price !== next.price) fields.push("price");
  if (prev.rooms !== next.rooms) fields.push("rooms");
  if (prev.areaSqm !== next.areaSqm) fields.push("area");
  if (prev.floor !== next.floor) fields.push("floor");
  return fields;
}

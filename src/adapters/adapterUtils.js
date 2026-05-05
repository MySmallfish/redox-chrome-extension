import { emptyNormalized } from "../shared/normalizedModel.js";
import { toNumber } from "../shared/utils.js";

const REAL_ESTATE_TYPES = new Set([
  "RealEstateListing",
  "Residence",
  "Apartment",
  "House",
  "SingleFamilyResidence",
  "Product"
]);

const NOISY_TEXT_PATTERN = /[{}[\]"]/;

export function parseJsonLd(doc) {
  const scripts = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]')
  );
  const results = [];
  for (const script of scripts) {
    const text = script.textContent?.trim();
    if (!text) continue;
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        results.push(...json);
      } else if (json && typeof json === "object") {
        results.push(json);
      }
    } catch {
      continue;
    }
  }
  return results;
}

export function parseEmbeddedState(doc) {
  const scripts = Array.from(
    doc.querySelectorAll(
      'script#__NEXT_DATA__, script#__NUXT__, script[type="application/json"], script[data-state]'
    )
  );
  const results = [];
  for (const script of scripts) {
    const text = script.textContent?.trim();
    if (!text) continue;
    try {
      const json = JSON.parse(text);
      results.push(json);
    } catch {
      continue;
    }
  }
  return results;
}

export function hasEmbeddedState(doc) {
  return Boolean(
    doc.querySelector(
      'script#__NEXT_DATA__, script#__NUXT__, script[type="application/json"], script[data-state]'
    )
  );
}

export function findListingJsonLd(items) {
  for (const item of items) {
    const types = Array.isArray(item?.["@type"])
      ? item["@type"]
      : [item?.["@type"]];
    if (types.some((type) => REAL_ESTATE_TYPES.has(type))) {
      return item;
    }
  }
  return null;
}

export function mapJsonLdToNormalized(item) {
  const normalized = emptyNormalized();
  if (!item) return normalized;

  normalized.title = item.name || null;
  const address = item.address || {};
  normalized.address = address.streetAddress || null;
  normalized.city = address.addressLocality || null;

  if (item.description) normalized.description = item.description;
  if (item.numberOfRooms != null) {
    normalized.rooms = toNumber(item.numberOfRooms);
  }

  const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
  if (offers?.price != null) {
    normalized.price = toNumber(offers.price);
  }

  const floorSize = item.floorSize || item.floorArea;
  if (floorSize?.value != null) {
    normalized.areaSqm = toNumber(floorSize.value);
  } else if (floorSize != null) {
    normalized.areaSqm = toNumber(floorSize);
  }

  if (item.floorLevel != null) {
    normalized.floor = toNumber(item.floorLevel) ?? String(item.floorLevel);
  }
  if (item.numberOfFloors != null) {
    normalized.totalFloors = toNumber(item.numberOfFloors);
  }

  const contactPoint = item.contactPoint || item.agent;
  if (contactPoint?.telephone) normalized.contact.phone = contactPoint.telephone;
  if (contactPoint?.email) normalized.contact.email = contactPoint.email;

  if (item.image) {
    const images = Array.isArray(item.image) ? item.image : [item.image];
    normalized.images = images.filter(Boolean);
  }

  return normalized;
}

function normalizeText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

export function textFromSelectors(doc, selectors) {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const text = normalizeText(el?.textContent);
    if (text && !isNoisyText(text)) return text;
  }
  return null;
}

export function textFromLabels(doc, labels) {
  const labelSet = labels.map((label) => label.toLowerCase());
  const candidates = Array.from(
    doc.querySelectorAll("dt, th, span, div, li, p, label, strong, b")
  );

  for (const el of candidates) {
    const raw = normalizeText(el.textContent);
    if (!raw) continue;
    if (raw.length > 40 || isNoisyText(raw)) continue;
    const lower = raw.toLowerCase();
    const matched = labelSet.some(
      (label) => lower === label || lower.startsWith(`${label} `) || lower.includes(label)
    );
    if (!matched) continue;

    const siblingText = normalizeText(el.nextElementSibling?.textContent);
    if (siblingText && !isNoisyText(siblingText)) return siblingText;

    const parent = el.parentElement;
    if (parent) {
      const valueEl = parent.querySelector("dd, td, span, div");
      const valueText = normalizeText(valueEl?.textContent);
      if (valueText && valueText !== raw && !isNoisyText(valueText)) return valueText;

      const parentText = normalizeText(parent.textContent);
      if (parentText && parentText !== raw && !isNoisyText(parentText)) {
        const withoutLabel = normalizeText(parentText.replace(raw, ""));
        if (withoutLabel && !isNoisyText(withoutLabel)) return withoutLabel;
      }
    }

    if (hasNumber(raw)) return raw;
  }

  return null;
}

export function booleanFromLabels(doc, labels) {
  const found = textFromLabels(doc, labels);
  if (!found) return null;
  return true;
}

export function findListingInState(state) {
  let best = null;
  let bestScore = 0;
  const visited = new WeakSet();
  const stack = Array.isArray(state) ? [...state] : [state];

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const score = scoreListingCandidate(current);
    if (score > bestScore && isListingCandidate(current)) {
      best = current;
      bestScore = score;
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) {
        stack.push(...value);
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return bestScore >= 3 ? best : null;
}

export function mapStateListingToNormalized(listing) {
  const normalized = emptyNormalized();
  if (!listing) return normalized;

  const title = sanitizeText(
    getFirstValue(listing, [
      "title",
      "name",
      "headline",
      "listingTitle",
      "displayTitle"
    ])
  );
  if (title) normalized.title = title;

  const addressObj =
    listing.address ||
    listing.Address ||
    listing.location?.address ||
    listing.location ||
    null;
  const addressFromObject = buildAddressFromObject(addressObj);
  if (addressFromObject.address && !normalized.address) {
    normalized.address = addressFromObject.address;
  }
  if (addressFromObject.city && !normalized.city) {
    normalized.city = addressFromObject.city;
  }

  const address = sanitizeText(
    getFirstValue(listing, ["fullAddress", "addressLine", "address"])
  );
  if (address && !normalized.address) normalized.address = address;

  const city = sanitizeText(
    getFirstValue(listing, ["city", "cityName", "city_name", "addressLocality"])
  );
  if (city && !normalized.city) normalized.city = city;

  const price = getFirstValue(listing, [
    "price",
    "requestedPrice",
    "priceNis",
    "priceILS",
    "askingPrice",
    "salePrice"
  ]);
  if (price != null) normalized.price = toNumber(price);

  const rooms = getFirstValue(listing, [
    "rooms",
    "numberOfRooms",
    "rooms_count",
    "numRooms"
  ]);
  if (rooms != null) normalized.rooms = toNumber(rooms);

  const area = getFirstValue(listing, [
    "areaSqm",
    "area",
    "homeArea",
    "builtArea",
    "size",
    "floorSize"
  ]);
  if (area != null) normalized.areaSqm = toNumber(area);

  const floor = getFirstValue(listing, ["floor", "floorNumber", "floor_level"]);
  if (floor != null) normalized.floor = toNumber(floor) ?? String(floor);

  const totalFloors = getFirstValue(listing, [
    "totalFloors",
    "numberOfFloors",
    "floorsCount"
  ]);
  if (totalFloors != null) normalized.totalFloors = toNumber(totalFloors);

  const description = sanitizeText(
    getFirstValue(listing, ["description", "desc", "text"])
  );
  if (description) normalized.description = description;

  const images = getFirstValue(
    listing,
    ["images", "photos", "gallery", "image"],
    { allowArrays: true, allowObjects: true }
  );
  if (images) {
    const list = Array.isArray(images) ? images : [images];
    normalized.images = list
      .map((item) => (typeof item === "string" ? item : item?.url || item?.src))
      .filter(Boolean);
  }

  if (typeof listing.elevator === "boolean") {
    normalized.features.elevator = listing.elevator;
  }
  if (typeof listing.accessible === "boolean") {
    normalized.features.accessible = listing.accessible;
  }
  if (typeof listing.balcony === "boolean") {
    normalized.features.balcony = listing.balcony;
  }
  if (typeof listing.solarHeater === "boolean") {
    normalized.features.solarHeater = listing.solarHeater;
  }

  return normalized;
}

export function mergeNormalized(base, next) {
  if (!next) return base;
  const merged = { ...base };
  for (const key of [
    "title",
    "address",
    "city",
    "price",
    "rooms",
    "floor",
    "totalFloors",
    "areaSqm",
    "description"
  ]) {
    if (merged[key] == null && next[key] != null) {
      merged[key] = next[key];
    }
  }

  merged.features = {
    ...base.features,
    ...Object.fromEntries(
      Object.entries(next.features || {}).filter(
        ([, value]) => value !== null && value !== undefined
      )
    )
  };
  merged.contact = {
    ...base.contact,
    ...Object.fromEntries(
      Object.entries(next.contact || {}).filter(
        ([, value]) => value !== null && value !== undefined
      )
    )
  };

  if (!merged.images?.length && next.images?.length) {
    merged.images = next.images;
  }

  return merged;
}

function scoreListingCandidate(obj) {
  let score = 0;
  if (hasAny(obj, ["price", "requestedPrice", "priceNis", "priceILS"])) score += 2;
  if (hasAny(obj, ["rooms", "numberOfRooms", "rooms_count", "numRooms"])) score += 1;
  if (hasAny(obj, ["address", "streetAddress", "fullAddress"])) score += 2;
  if (hasAny(obj, ["city", "cityName", "addressLocality"])) score += 1;
  if (hasAny(obj, ["area", "areaSqm", "homeArea", "builtArea"])) score += 1;
  return score;
}

function hasAny(obj, keys) {
  return keys.some((key) => obj && obj[key] != null);
}

function isListingCandidate(obj) {
  const hasLocation =
    hasAny(obj, [
      "address",
      "streetAddress",
      "fullAddress",
      "city",
      "cityName",
      "addressLocality"
    ]) || hasAny(obj?.location || {}, ["address", "streetAddress", "fullAddress", "city"]);
  const hasStats = hasAny(obj, [
    "price",
    "requestedPrice",
    "priceNis",
    "priceILS",
    "rooms",
    "numberOfRooms",
    "rooms_count",
    "numRooms",
    "area",
    "areaSqm",
    "homeArea",
    "builtArea"
  ]);
  return hasLocation && hasStats;
}

function getFirstValue(obj, keys, options = {}) {
  const { allowArrays = false, allowObjects = false } = options;
  if (!obj) return null;
  for (const key of keys) {
    if (obj == null) continue;
    if (key.includes(".")) {
      const parts = key.split(".");
      let cur = obj;
      for (const part of parts) {
        if (cur == null) break;
        cur = cur[part];
      }
      const value = normalizeValue(cur, allowArrays, allowObjects);
      if (value != null) return value;
      continue;
    }
    const value = normalizeValue(obj[key], allowArrays, allowObjects);
    if (value != null) return value;
  }
  return null;
}

function isNoisyText(text) {
  if (!text) return true;
  if (text.length > 240) return true;
  if (text === "[object Object]" || text.includes("object Object")) return true;
  return NOISY_TEXT_PATTERN.test(text);
}

function normalizeValue(value, allowArrays, allowObjects) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return allowArrays ? value : null;
  if (typeof value === "object") return allowObjects ? value : null;
  return value;
}

function sanitizeText(value) {
  if (value == null) return null;
  const text = normalizeText(String(value));
  if (!text || isNoisyText(text)) return null;
  return text;
}

function hasNumber(text) {
  return /\d/.test(text);
}

function buildAddressFromObject(obj) {
  if (!obj || typeof obj !== "object") return { address: null, city: null };

  const street = sanitizeText(
    getFirstValue(obj, ["streetAddress", "street", "streetName", "street_name"])
  );
  const number = sanitizeText(
    getFirstValue(obj, [
      "streetNumber",
      "houseNumber",
      "house_number",
      "number",
      "buildingNumber"
    ])
  );
  const unit = sanitizeText(
    getFirstValue(obj, ["apartment", "apartmentNumber", "unit"])
  );

  const addressParts = [street, number, unit].filter(Boolean);
  const address = addressParts.length ? addressParts.join(" ") : null;

  const city = sanitizeText(
    getFirstValue(obj, ["city", "cityName", "city_name", "addressLocality"])
  );

  return { address, city };
}



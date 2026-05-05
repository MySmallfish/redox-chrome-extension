import { emptyNormalized } from "../shared/normalizedModel.js";
import { canonicalizeUrl, getPathId } from "../shared/url.js";
import { toNumber } from "../shared/utils.js";
import {
  parseJsonLd,
  findListingJsonLd,
  mapJsonLdToNormalized,
  parseEmbeddedState,
  findListingInState,
  mapStateListingToNormalized,
  mergeNormalized,
  hasEmbeddedState
} from "./adapterUtils.js";

const siteId = "madlan";

function matchesUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.pathname.startsWith("/listings/");
  } catch {
    return false;
  }
}

function detect(doc, rawUrl) {
  if (!matchesUrl(rawUrl)) return false;
  const root = doc.getElementById("root");
  const hasDataAuto = root?.querySelector("[data-auto]");
  const hasJsonLd = doc.querySelector('script[type="application/ld+json"]');
  return Boolean(hasDataAuto || hasJsonLd || hasEmbeddedState(doc));
}

function extract(doc, rawUrl) {
  let normalized = emptyNormalized();

  const root = doc.getElementById("root") || doc.body;
  const rootValues = extractFromRoot(root);

  const jsonLdItems = parseJsonLd(doc);
  const listing = findListingJsonLd(jsonLdItems);
  if (listing) {
    normalized = mapJsonLdToNormalized(listing);
  }

  const embeddedState = parseEmbeddedState(doc);
  if (embeddedState.length) {
    const candidate = findListingInState(embeddedState);
    if (candidate) {
      const mapped = mapStateListingToNormalized(candidate);
      normalized = mergeNormalized(normalized, mapped);
    }
  }

  normalized = applyOverrides(normalized, rootValues);

  return normalized;
}

function getExternalId(rawUrl) {
  return getPathId(rawUrl, "/listings/");
}

function canonicalizeUrlFn(rawUrl) {
  return canonicalizeUrl(rawUrl);
}

export const madlanAdapter = {
  siteId,
  matchesUrl,
  detect,
  extract,
  getExternalId,
  canonicalizeUrl: canonicalizeUrlFn
};

function extractFromRoot(root) {
  const normalized = emptyNormalized();
  if (!root) return normalized;

  const title = textByDataAuto(root, [
    "listing-title",
    "title",
    "headline",
    "address-title"
  ]);
  if (title) normalized.title = title;

  const address = textByDataAuto(root, [
    "address",
    "street-address",
    "full-address",
    "listing-address",
    "address-line"
  ]);
  if (address) normalized.address = address;

  const city = textByDataAuto(root, ["city", "city-name", "location-city"]);
  if (city) normalized.city = city;

  const priceText = textByDataAuto(root, [
    "price",
    "listing-price",
    "price-value",
    "deal-price"
  ]);
  if (priceText) normalized.price = toNumber(priceText);

  const roomsText = textByDataAuto(root, [
    "beds-count",
    "rooms",
    "rooms-count",
    "number-of-rooms"
  ]);
  if (roomsText) normalized.rooms = toNumber(roomsText);

  const floorText = textByDataAuto(root, [
    "floor",
    "floor-number",
    "floor-value"
  ]);
  if (floorText) normalized.floor = toNumber(floorText) ?? floorText;

  const areaText = textByDataAuto(root, [
    "area",
    "area-size",
    "home-area",
    "home-size",
    "built-area",
    "square-meter",
    "sqm",
    "area-sqm",
    "size"
  ]);
  if (areaText) normalized.areaSqm = toNumber(areaText);

  const description = textByDataAuto(root, [
    "description",
    "listing-description",
    "details"
  ]);
  if (description) normalized.description = description;

  return normalized;
}

function textByDataAuto(root, names) {
  for (const name of names) {
    const el = root.querySelector(`[data-auto="${name}"]`);
    const text = normalizeText(el?.textContent || el?.value);
    if (text) return text;
  }
  return null;
}

function normalizeText(text) {
  if (!text) return "";
  return String(text).replace(/\s+/g, " ").trim();
}

function applyOverrides(base, overrides) {
  const out = { ...base };
  if (overrides.title) out.title = overrides.title;
  if (overrides.address) out.address = overrides.address;
  if (overrides.city) out.city = overrides.city;
  if (overrides.price != null) out.price = overrides.price;
  if (overrides.rooms != null) out.rooms = overrides.rooms;
  if (overrides.floor != null) out.floor = overrides.floor;
  if (overrides.areaSqm != null) out.areaSqm = overrides.areaSqm;
  if (overrides.description) out.description = overrides.description;
  return out;
}

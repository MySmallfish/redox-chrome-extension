import template from "./schema/redoxPropertyTemplate.json";
import { buildReferenceId } from "./url.js";

const PROPERTY_KEYS = new Set(Object.keys(template));

export class RedoxPropertyMapper {
  constructor(options = {}) {
    this.propertyTypes = Array.isArray(options.propertyTypes)
      ? options.propertyTypes
      : [];
  }

  map(normalized, meta = {}) {
    const out = {};
    const address = normalized?.address || normalized?.title || null;
    setIf(out, "Address", address);
    setIf(out, "City", normalized?.city);
    setIf(out, "Rooms", normalized?.rooms);
    setIf(out, "Floor", normalizeFloor(normalized?.floor));
    setIf(out, "HomeArea", normalized?.areaSqm);
    setIf(out, "RequestedPrice", normalized?.price);
    setIf(out, "Description", normalized?.description);

    const referenceId =
      meta.referenceId || buildReferenceId(meta.siteId, meta.externalId);
    setIf(out, "ReferenceId", referenceId);

    const { homeNumber, appartmentNumber } = parseAddressParts(address);
    if (homeNumber) setIf(out, "HomeNumber", homeNumber);
    if (appartmentNumber) setIf(out, "AppartmentNumber", appartmentNumber);

    const propertyType = this.resolvePropertyType(normalized);
    const propertyTypeId = extractTypeId(propertyType);
    if (propertyTypeId != null) {
      setIf(out, "PropertyTypeId", propertyTypeId);
    }
    if (propertyType && PROPERTY_KEYS.has("Type")) {
      out.Type = propertyType;
    }

    return out;
  }

  resolvePropertyType(normalized) {
    if (!this.propertyTypes.length) return null;
    const keyword = buildKeyword(normalized);
    const matched = keyword
      ? this.propertyTypes.find((item) =>
          matchTypeName(item?.Name || item?.name || "", keyword)
        )
      : null;
    const fallback = matched || this.propertyTypes[0] || null;
    return fallback;
  }
}

export function mapToRedox(normalized, meta = {}, propertyTypes = []) {
  const mapper = new RedoxPropertyMapper({ propertyTypes });
  return mapper.map(normalized, meta);
}

function setIf(target, key, value) {
  if (!PROPERTY_KEYS.has(key)) return;
  if (value == null) return;
  if (typeof value === "string" && value.trim() === "") return;
  target[key] = value;
}

function normalizeFloor(floor) {
  if (floor == null || floor === "") return null;
  return String(floor).trim();
}

function parseAddressParts(address) {
  if (!address) return { homeNumber: null, appartmentNumber: null };
  const match = String(address).match(/\b(\d+[a-zA-Z]?)\b/);
  const homeNumber = match ? match[1] : null;
  const aptMatch = String(address).match(/(?:\u05d3\u05d9\u05e8\u05d4|\u05d3\u05d9\u05e8\u05ea|apt\.?|apartment|unit|#)\s*(\d+)/i);
  const appartmentNumber = aptMatch ? aptMatch[1] : null;
  return { homeNumber, appartmentNumber };
}

function buildKeyword(normalized) {
  const source = `${normalized?.title || ""} ${normalized?.description || ""}`.toLowerCase();
  if (source.includes("\u05e4\u05e0\u05d8\u05d4\u05d0\u05d5\u05d6") || source.includes("penthouse")) return "\u05e4\u05e0\u05d8\u05d4\u05d0\u05d5\u05d6";
  if (source.includes("\u05d3\u05d5\u05e4\u05dc\u05e7\u05e1") || source.includes("duplex")) return "\u05d3\u05d5\u05e4\u05dc\u05e7\u05e1";
  if (source.includes("\u05d1\u05d9\u05ea") || source.includes("house")) return "\u05d1\u05d9\u05ea";
  if (source.includes("\u05d5\u05d9\u05dc\u05d4") || source.includes("villa")) return "\u05d5\u05d9\u05dc\u05d4";
  if (source.includes("\u05d3\u05d9\u05e8\u05d4") || source.includes("apartment")) return "\u05d3\u05d9\u05e8\u05d4";
  return "";
}

function matchTypeName(name, keyword) {
  if (!name || !keyword) return false;
  const lower = String(name).toLowerCase();
  return lower.includes(keyword.toLowerCase());
}

function extractTypeId(item) {
  if (!item || typeof item !== "object") return null;
  const value = item.Id ?? item.id ?? item.TypeId ?? item.typeId ?? item.Value ?? item.value;
  return value ?? null;
}


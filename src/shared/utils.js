export function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value)
    .replace(/[\s,\u20aa$]/g, "")
    .replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function toStringOrEmpty(value) {
  if (value == null) return "";
  return String(value);
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}



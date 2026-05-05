export function canonicalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

export function getPathId(rawUrl, prefix) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname || "";
    const idx = path.indexOf(prefix);
    if (idx === -1) return "";
    const rest = path.slice(idx + prefix.length);
    const parts = rest.split("/").filter(Boolean);
    return parts[0] || "";
  } catch {
    return "";
  }
}

export function buildReferenceId(siteId, externalId) {
  if (!siteId || !externalId) return "";
  return `${siteId}:${externalId}`;
}



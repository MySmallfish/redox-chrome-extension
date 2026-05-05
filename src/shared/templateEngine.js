const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.:-]+)\s*\}\}/g;

export function renderTemplate(html, data) {
  return html.replace(TOKEN_PATTERN, (_, key) => {
    const value = resolvePath(data, key);
    return escapeHtml(value == null ? "" : String(value));
  });
}

export function resolvePath(obj, path) {
  if (!obj) return "";
  if (path.startsWith("t:")) {
    const tKey = path.slice(2);
    return typeof obj.t === "function" ? obj.t(tKey) : "";
  }
  const parts = path.split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return "";
    cur = cur[part];
  }
  return cur == null ? "" : cur;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}



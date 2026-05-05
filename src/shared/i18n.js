export function createI18n(dictionaries, defaultLang = "he") {
  let currentLang = defaultLang;

  function t(key) {
    const dict = dictionaries[currentLang] || {};
    const value = key.split(".").reduce((acc, part) => {
      if (acc && typeof acc === "object" && part in acc) return acc[part];
      return null;
    }, dict);
    if (typeof value === "string") return value;
    return key;
  }

  function setLang(lang) {
    currentLang = lang in dictionaries ? lang : defaultLang;
    applyDocumentDirection(currentLang);
    return currentLang;
  }

  function getLang() {
    return currentLang;
  }

  return { t, setLang, getLang };
}

export function applyDocumentDirection(lang) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root) return;
  if (lang === "he") {
    root.lang = "he";
    root.dir = "rtl";
  } else {
    root.lang = lang || "en";
    root.dir = "ltr";
  }
}



import { describe, it, expect, beforeEach } from "vitest";
import { createI18n } from "../../src/shared/i18n.js";

const dicts = {
  he: { sample: { key: "שלום" } },
  en: { sample: { key: "Hello" } }
};

describe("i18n", () => {
  beforeEach(() => {
    document.documentElement.lang = "";
    document.documentElement.dir = "";
  });

  it("returns fallback when key missing", () => {
    const i18n = createI18n(dicts, "he");
    expect(i18n.t("missing.key")).toBe("missing.key");
  });

  it("toggles dir and lang for hebrew", () => {
    const i18n = createI18n(dicts, "en");
    i18n.setLang("he");
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
  });
});



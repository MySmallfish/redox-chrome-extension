import { describe, it, expect } from "vitest";
import { renderTemplate } from "../../src/shared/templateEngine.js";

describe("templateEngine", () => {
  it("replaces keys", () => {
    const html = "Hello {{name}}";
    expect(renderTemplate(html, { name: "Redox" })).toBe("Hello Redox");
  });

  it("supports nested paths", () => {
    const html = "City: {{property.city}}";
    expect(
      renderTemplate(html, { property: { city: "Tel Aviv" } })
    ).toBe("City: Tel Aviv");
  });

  it("escapes html by default", () => {
    const html = "{{value}}";
    expect(renderTemplate(html, { value: "<b>x</b>" })).toBe(
      "&lt;b&gt;x&lt;/b&gt;"
    );
  });

  it("renders missing keys as empty string", () => {
    const html = "Hello {{missing}}";
    expect(renderTemplate(html, {})).toBe("Hello ");
  });
});



import { describe, it, expect } from "vitest";
import {
  canonicalizeUrl,
  getPathId,
  buildReferenceId
} from "../../src/shared/url.js";

describe("url utilities", () => {
  it("canonicalizes url by stripping query and hash", () => {
    const raw = "https://example.com/path/item?x=1#section";
    expect(canonicalizeUrl(raw)).toBe("https://example.com/path/item");
  });

  it("extracts external id for yad2", () => {
    const raw = "https://www.yad2.co.il/realestate/item/abc123?foo=1";
    expect(getPathId(raw, "/realestate/item/")).toBe("abc123");
  });

  it("extracts external id for madlan", () => {
    const raw = "https://www.madlan.co.il/listings/98765?x=1";
    expect(getPathId(raw, "/listings/")).toBe("98765");
  });

  it("builds reference id", () => {
    expect(buildReferenceId("yad2", "abc")).toBe("yad2:abc");
  });
});



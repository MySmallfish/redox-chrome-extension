import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { yad2Adapter } from "../../src/adapters/yad2.js";
import { madlanAdapter } from "../../src/adapters/madlan.js";

function loadFixture(name) {
  const filePath = path.join(process.cwd(), "tests", "fixtures", name);
  const html = fs.readFileSync(filePath, "utf8");
  return new JSDOM(html).window.document;
}

describe("adapters", () => {
  it("yad2 detects and extracts listing", () => {
    const doc = loadFixture("yad2_item.html");
    const url = "https://www.yad2.co.il/realestate/item/abc123";
    expect(yad2Adapter.matchesUrl(url)).toBe(true);
    expect(yad2Adapter.detect(doc, url)).toBe(true);

    const normalized = yad2Adapter.extract(doc, url);
    expect(normalized.address).toBe("Herzl 1");
    expect(normalized.city).toBe("Tel Aviv");
    expect(normalized.rooms).toBe(4);
    expect(normalized.areaSqm).toBe(90);

    expect(yad2Adapter.getExternalId(url)).toBe("abc123");
    expect(yad2Adapter.canonicalizeUrl(url)).toBe(
      "https://www.yad2.co.il/realestate/item/abc123"
    );
  });

  it("yad2 extracts listing from __NEXT_DATA__", () => {
    const doc = loadFixture("yad2_next_data.html");
    const url = "https://www.yad2.co.il/realestate/item/abc123";
    expect(yad2Adapter.detect(doc, url)).toBe(true);

    const normalized = yad2Adapter.extract(doc, url);
    expect(normalized.address).toBe("\u05ea\u05d3\u05d4\u05e8 6");
    expect(normalized.city).toBe("\u05e7\u05e6\u05e8\u05d9\u05df");
    expect(normalized.rooms).toBe(5);
    expect(normalized.areaSqm).toBe(123);
    expect(normalized.floor).toBe(2);
  });

  it("madlan detects and extracts listing", () => {
    const doc = loadFixture("madlan_listing.html");
    const url = "https://www.madlan.co.il/listings/98765";
    expect(madlanAdapter.matchesUrl(url)).toBe(true);
    expect(madlanAdapter.detect(doc, url)).toBe(true);

    const normalized = madlanAdapter.extract(doc, url);
    expect(normalized.address).toBe("Allenby 10");
    expect(normalized.city).toBe("Haifa");
    expect(normalized.rooms).toBe(4);
    expect(normalized.areaSqm).toBe(75);
    expect(normalized.floor).toBe(3);

    expect(madlanAdapter.getExternalId(url)).toBe("98765");
    expect(madlanAdapter.canonicalizeUrl(url)).toBe(
      "https://www.madlan.co.il/listings/98765"
    );
  });
});



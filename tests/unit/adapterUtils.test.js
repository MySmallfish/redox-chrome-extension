import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { textFromLabels } from "../../src/adapters/adapterUtils.js";

function makeDoc(html) {
  return new JSDOM(html).window.document;
}

describe("adapterUtils", () => {
  it("extracts value next to a label", () => {
    const doc = makeDoc(`
      <dl>
        <dt>\u05d7\u05d3\u05e8\u05d9\u05dd</dt>
        <dd>4</dd>
      </dl>
    `);
    expect(textFromLabels(doc, ["\u05d7\u05d3\u05e8\u05d9\u05dd"])).toBe("4");
  });

  it("ignores noisy JSON blobs", () => {
    const doc = makeDoc(`
      <div>{"city":"\u05e6\u05d5\u05e7\u05d9\u05dd","price":2650000}</div>
      <div>
        <span>\u05e2\u05d9\u05e8</span>
        <span>\u05e6\u05d5\u05e7\u05d9\u05dd</span>
      </div>
    `);
    expect(textFromLabels(doc, ["\u05e2\u05d9\u05e8"])).toBe(
      "\u05e6\u05d5\u05e7\u05d9\u05dd"
    );
  });
});

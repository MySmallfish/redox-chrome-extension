import { describe, it, expect } from "vitest";
import {
  buildLocalRecord,
  upsertLocalTracked,
  listLocalTracked,
  updateLocalWithDetails
} from "../../src/shared/localTracking.js";

describe("localTracking", () => {
  it("builds and stores local records", () => {
    const record = buildLocalRecord({
      canonicalUrl: "https://example.com",
      siteId: "yad2",
      externalId: "123",
      normalized: { title: "Test" }
    });

    const map = upsertLocalTracked({}, record);
    const list = listLocalTracked(map);

    expect(list).toHaveLength(1);
    expect(list[0].canonicalUrl).toBe("https://example.com");
  });

  it("appends comments on enter", () => {
    const detection = {
      canonicalUrl: "https://example.com",
      siteId: "yad2",
      externalId: "123",
      normalized: { title: "Test" }
    };
    const record = buildLocalRecord(detection);
    const map = upsertLocalTracked({}, record);
    const updated = updateLocalWithDetails(map, detection, { comment: "First" });

    expect(updated.record.comments).toHaveLength(1);
    expect(updated.record.comments[0].text).toBe("First");
  });
});

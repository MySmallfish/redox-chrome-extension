import { describe, it, expect } from "vitest";
import { mapToRedox } from "../../src/shared/redoxMapper.js";

const sampleNormalized = {
  title: "\u05d3\u05d9\u05e8\u05d4 Sample",
  address: "Main 1",
  city: "Tel Aviv",
  price: 1000000,
  rooms: 3,
  floor: 2,
  areaSqm: 80,
  description: "Nice",
  features: {
    elevator: true,
    accessible: true,
    balcony: false,
    solarHeater: false
  }
};

describe("redoxMapper", () => {
  it("maps key fields", () => {
    const propertyTypes = [{ Id: 7, Name: "\u05d3\u05d9\u05e8\u05d4" }];
    const out = mapToRedox(
      sampleNormalized,
      {
        siteId: "yad2",
        externalId: "abc"
      },
      propertyTypes
    );
    expect(out.Address).toBe("Main 1");
    expect(out.City).toBe("Tel Aviv");
    expect(out.Rooms).toBe(3);
    expect(out.HomeArea).toBe(80);
    expect(out.RequestedPrice).toBe(1000000);
    expect(out.ReferenceId).toBe("yad2:abc");
    expect(out.PropertyTypeId).toBe(7);
    expect(out.Type?.Id).toBe(7);
    expect(out.Seller).toBeUndefined();
  });
});



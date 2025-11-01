import { buildMediaPayload, buildPropertyPayload } from "./property-form.utils";

describe("property-form.utils", () => {
  describe("buildPropertyPayload", () => {
    it("normalizes rich payloads and strips empty values", () => {
      const payload = buildPropertyPayload({
        name: "  Azure Suites ",
        description: "   ",
        addressType: " simple ",
        address: {
          city: " Nairobi ",
          estate: "",
          note: null,
        },
        location: { lat: " -1.2921 ", lng: "36.8219" },
        details: {
          occupancyModes: "nightly, monthly , ",
          baseRates: "  KES 2000 ",
        },
        amenities: " Wifi, Pool , ",
        policies: {
          cancellation: "",
          houseRules: " Quiet hours ",
        },
      });

      expect(payload).toEqual({
        name: "Azure Suites",
        addressType: "simple",
        address: { city: "Nairobi" },
        location: { lat: -1.2921, lng: 36.8219 },
        details: {
          occupancyModes: ["nightly", "monthly"],
          baseRates: "KES 2000",
        },
        amenities: ["Wifi", "Pool"],
        policies: {
          houseRules: "Quiet hours",
        },
      });
    });

    it("returns minimal payload when optional sections are missing", () => {
      const payload = buildPropertyPayload({
        name: "Minimal House",
        addressType: "hybrid",
      });

      expect(payload).toEqual({
        name: "Minimal House",
        addressType: "hybrid",
      });
    });
  });

  describe("buildMediaPayload", () => {
    it("falls back to defaults and trims values", () => {
      const payload = buildMediaPayload({
        url: " https://cdn.berjis.tech/photo.jpg ",
        kind: " ",
        caption: " Front Elevation ",
        unitId: "  ",
      });

      expect(payload).toEqual({
        kind: "interior",
        url: "https://cdn.berjis.tech/photo.jpg",
        caption: "Front Elevation",
      });
    });
  });
});

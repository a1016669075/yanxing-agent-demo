import test from "node:test";
import assert from "node:assert/strict";

import { fetchFirmsFireOverlay, normalizeWildfireProviderConfig } from "./firmsProvider.mjs";

test("normalizeWildfireProviderConfig keeps wildfire defaults stable", () => {
  const profile = normalizeWildfireProviderConfig({});

  assert.equal(profile.provider, "firms");
  assert.equal(profile.mode, "nrt");
  assert.equal(profile.dayRange, 1);
  assert.deepEqual(profile.products, ["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT"]);
  assert.equal(profile.minimumConfidenceLevel, "nominal");
});

test("fetchFirmsFireOverlay filters low confidence by default and builds clusters", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        mode: "nrt",
        dayRange: 1,
        products: ["VIIRS_NOAA21_NRT"],
        rows: [
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.1",
            longitude: "101.1",
            acq_date: "2026-04-11",
            acq_time: "0530",
            confidence: "h",
            frp: "18.4",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.5",
            longitude: "101.5",
            acq_date: "2026-04-11",
            acq_time: "0610",
            confidence: "l",
            frp: "6.2",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
        ],
      };
    },
  });

  try {
    const overlay = await fetchFirmsFireOverlay(
      {
        imageryProfile: {
          bbox: [100, 19, 103, 22],
        },
        analysisProfile: {
          maxRois: 6,
        },
      },
      new Date("2026-04-11T08:00:00.000Z"),
      {}
    );

    assert.equal(overlay.available, true);
    assert.equal(overlay.detections.length, 1);
    assert.equal(overlay.summary.pointCount, 1);
    assert.equal(overlay.clusters.length, 1);
    assert.equal(overlay.rois.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchFirmsFireOverlay uses the packaged demo snapshot when the Pages API is absent", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    if (String(input) === "/api/firms-area") {
      return {
        ok: false,
        async json() {
          return {};
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {
          snapshotDate: "2026-09-11",
          generatedAt: "2026-09-11T08:00:00.000Z",
          bbox: [96, 16, 104, 24],
          rows: [{
            product: "VIIRS_NOAA21_NRT",
            latitude: "21.44",
            longitude: "101.18",
            acq_date: "2026-09-11",
            acq_time: "0548",
            confidence: "n",
            frp: "3.01",
            daynight: "D",
            scan: "0.37",
            track: "0.58",
            satellite: "N21",
          }],
        };
      },
    };
  };

  try {
    const overlay = await fetchFirmsFireOverlay(
      {
        id: "wildfire-firms-demo",
        imageryProfile: { bbox: [96, 16, 104, 24] },
        analysisProfile: { maxRois: 6 },
      },
      new Date("2026-09-11T08:00:00.000Z"),
      {}
    );

    assert.equal(overlay.available, true);
    assert.equal(overlay.sourceMode, "local_cache");
    assert.equal(overlay.summary.pointCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

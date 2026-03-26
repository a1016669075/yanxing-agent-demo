const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCloudMaskSearchUrl,
  cloudMaskCatalog,
  normalizeCloudMaskPayload,
  searchCloudMaskFiles,
} = require("./cloudMaskCatalog.cjs");

function makePayload(overrides = {}) {
  return {
    productId: "CLDMSK_L2_VIIRS_NOAA21",
    bbox: [110.2, 20.4, 117.6, 25.6],
    startDate: "2026-03-17",
    endDate: "2026-03-24",
    threshold: 0.45,
    limit: 3,
    sourceLabel: "珠三角场景",
    ...overrides,
  };
}

test("云掩膜查询参数会被规范化", () => {
  const request = normalizeCloudMaskPayload(makePayload());
  assert.equal(request.productId, "CLDMSK_L2_VIIRS_NOAA21");
  assert.equal(request.region, "[BBOX]W110.2 N25.6 E117.6 S20.4");
  assert.equal(request.temporalRange, "2026-03-17..2026-03-24");
});

test("云掩膜 URL 会带上 product、time 和 region", () => {
  const request = normalizeCloudMaskPayload(makePayload());
  const url = buildCloudMaskSearchUrl(request);
  assert.ok(url.includes("products=CLDMSK_L2_VIIRS_NOAA21"));
  assert.ok(url.includes("temporalRanges=2026-03-17..2026-03-24"));
});

test("云掩膜搜索会返回条目和覆盖度估计", async () => {
  const fetchMock = async () => ({
    ok: true,
    json: async () => ({
      content: [
        {
          fileId: 1,
          name: "CLDMSK_1.nc",
          products: "CLDMSK_L2_VIIRS_NOAA21",
          start: "2026-03-17 18:48:00",
          size: 2048,
          downloadsLink: "https://example.test/CLDMSK_1.nc",
        },
        {
          fileId: 2,
          name: "OTHER.hdf",
          products: "OTHER",
        },
      ],
    }),
  });

  const result = await searchCloudMaskFiles(fetchMock, makePayload());
  assert.equal(result.itemCount, 1);
  assert.ok(result.estimatedCoverage > 0);
});

test("目录里至少有一个云掩膜产品", () => {
  assert.ok(cloudMaskCatalog.products.length >= 1);
});

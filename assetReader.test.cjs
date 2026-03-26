const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAssetReadPlan,
  inferAssetKind,
  inspectAsset,
  normalizeAssetInspectPayload,
} = require("./assetReader.cjs");

function makePayload(overrides = {}) {
  return {
    assetUrl: "https://example.test/data/example.tif",
    sourceLabel: "STAC 首选资产",
    sourceType: "stac_latest",
    window: {
      bbox: [110.2, 20.4, 117.6, 25.6],
      width: 512,
      height: 512,
    },
    ...overrides,
  };
}

test("资产检查请求会被规范化为统一窗口契约", () => {
  const request = normalizeAssetInspectPayload(makePayload());

  assert.equal(request.assetUrl, "https://example.test/data/example.tif");
  assert.deepEqual(request.window.bbox, [110.2, 20.4, 117.6, 25.6]);
  assert.equal(request.window.crs, "EPSG:4326");
});

test("GeoTIFF URL 会被识别为 COG 候选", () => {
  const assetMeta = inferAssetKind("https://example.test/data/example.tif", "image/tiff");
  assert.equal(assetMeta.kind, "cog_candidate");
});

test("支持 Range 的 GeoTIFF 会进入 remote-cog-window 策略", () => {
  const plan = buildAssetReadPlan(
    normalizeAssetInspectPayload(makePayload()),
    {
      accessible: true,
      contentType: "image/tiff",
      supportsHttpRange: true,
    }
  );

  assert.equal(plan.reader, "remote-cog-window");
  assert.equal(plan.supportsWindowRead, true);
});

test("HDF 资产会提示先下载再走 GDAL 子数据集", async () => {
  const fetchMock = async (url, options = {}) => {
    if (options.method === "HEAD") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/x-hdf",
          "content-length": "4096",
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: {
        cancel: async () => {},
      },
    };
  };

  const result = await inspectAsset(
    fetchMock,
    makePayload({
      assetUrl: "https://example.test/data/file.hdf",
      sourceType: "laads_latest",
    })
  );

  assert.equal(result.readPlan.reader, "download-then-gdal-subdataset");
  assert.equal(result.readPlan.supportsWindowRead, false);
});

test("不可访问资产会回到 unavailable", async () => {
  const fetchMock = async () => {
    throw new Error("network");
  };

  const result = await inspectAsset(fetchMock, makePayload());
  assert.equal(result.readPlan.reader, "unavailable");
});

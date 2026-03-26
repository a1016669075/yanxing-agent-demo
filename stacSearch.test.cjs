const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStacSearchBody,
  normalizeStacSearchPayload,
  searchStacItems,
  stacProviderCatalog,
  summarizeFeature,
} = require("./stacSearch.cjs");

function makePayload(overrides = {}) {
  return {
    providerId: "earth-search",
    collections: ["sentinel-2-l2a"],
    bbox: [110, 20, 120, 30],
    startDate: "2026-03-10",
    endDate: "2026-03-17",
    limit: 3,
    sourceLabel: "场景范围",
    ...overrides,
  };
}

test("STAC 查询参数会被规范化为统一请求结构", () => {
  const request = normalizeStacSearchPayload(makePayload());

  assert.equal(request.providerId, "earth-search");
  assert.deepEqual(request.collections, ["sentinel-2-l2a"]);
  assert.deepEqual(request.bbox, [110, 20, 120, 30]);
  assert.equal(request.datetime, "2026-03-10T00:00:00Z/2026-03-17T23:59:59Z");
});

test("STAC body 会保留 bbox、datetime 和 collections", () => {
  const request = normalizeStacSearchPayload(makePayload());
  const body = buildStacSearchBody(request);

  assert.deepEqual(body.collections, ["sentinel-2-l2a"]);
  assert.equal(body.limit, 3);
  assert.equal(body.datetime, "2026-03-10T00:00:00Z/2026-03-17T23:59:59Z");
});

test("搜索结果会自动合并分页", async () => {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body || null });

    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => ({
          features: [{ id: "item-a", collection: "sentinel-2-l2a", assets: {} }],
          links: [
            {
              rel: "next",
              href: "https://example.test/page-2",
              method: "POST",
              type: "application/json",
              body: {
                collections: ["sentinel-2-l2a"],
                next: "token-1",
              },
            },
          ],
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({
        features: [{ id: "item-b", collection: "sentinel-2-l2a", assets: {} }],
        links: [],
      }),
    };
  };

  const result = await searchStacItems(fetchMock, makePayload(), { maxPages: 3 });

  assert.equal(result.itemCount, 2);
  assert.equal(result.pagesFetched, 2);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "POST");
  assert.ok(String(calls[1].body).includes("token-1"));
});

test("空结果会被稳定返回，而不是报错", async () => {
  const fetchMock = async () => ({
    ok: true,
    json: async () => ({
      features: [],
      links: [],
    }),
  });

  const result = await searchStacItems(fetchMock, makePayload());
  assert.equal(result.itemCount, 0);
  assert.deepEqual(result.features, []);
});

test("分页中混入非目标 collection 时会被过滤掉", async () => {
  let count = 0;
  const fetchMock = async () => {
    count += 1;
    if (count === 1) {
      return {
        ok: true,
        json: async () => ({
          features: [{ id: "item-a", collection: "sentinel-2-l2a", assets: {} }],
          links: [
            {
              rel: "next",
              href: "https://example.test/page-2",
              method: "POST",
              type: "application/json",
              body: { collections: ["sentinel-2-l2a"], next: "token-2" },
            },
          ],
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({
        features: [{ id: "item-b", collection: "sentinel-1-grd", assets: {} }],
        links: [],
      }),
    };
  };

  const result = await searchStacItems(fetchMock, makePayload(), { maxPages: 2 });
  assert.equal(result.itemCount, 1);
  assert.equal(result.filteredOutCount, 1);
  assert.deepEqual(
    result.features.map((feature) => feature.collection),
    ["sentinel-2-l2a"]
  );
});

test("缺少 collection 时会 fail-fast", () => {
  assert.throws(
    () => normalizeStacSearchPayload(makePayload({ collections: [] })),
    /collections must not be empty/
  );
});

test("结果摘要会提取时间、云量和资产数量", () => {
  const summary = summarizeFeature({
    id: "item-a",
    collection: "sentinel-2-l2a",
    assets: { visual: {} },
    properties: {
      datetime: "2026-03-12T02:31:00Z",
      "eo:cloud_cover": 18.6,
    },
  });

  assert.equal(summary.id, "item-a");
  assert.equal(summary.cloudCover, 18.6);
  assert.equal(summary.assets, 1);
});

test("provider 目录里至少有一个 provider 和 collection", () => {
  assert.ok(stacProviderCatalog.providers.length >= 1);
  assert.ok(stacProviderCatalog.providers[0].collections.length >= 1);
});

test("CMR-STAC provider 已接入 MODIS 近实时大气产品 collection", () => {
  const request = normalizeStacSearchPayload(
    makePayload({
      providerId: "cmr-lancemodis",
      collections: ["MYD04_3K_6.1NRT"],
    })
  );

  assert.equal(request.providerId, "cmr-lancemodis");
  assert.equal(request.provider.label, "NASA CMR-STAC / LANCEMODIS");
  assert.deepEqual(request.collections, ["MYD04_3K_6.1NRT"]);
});

test("Copernicus provider 已接入 Sentinel-2 collection", () => {
  const request = normalizeStacSearchPayload(
    makePayload({
      providerId: "copernicus-stac",
      collections: ["sentinel-2-l2a"],
    })
  );

  assert.equal(request.providerId, "copernicus-stac");
  assert.equal(request.provider.label, "Copernicus Data Space STAC");
  assert.deepEqual(request.collections, ["sentinel-2-l2a"]);
});

test("Copernicus provider 在可重试状态码下会自动重试", async () => {
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    if (calls < 3) {
      return {
        ok: false,
        status: 503,
      };
    }

    return {
      ok: true,
      json: async () => ({
        features: [{ id: "s2-a", collection: "sentinel-2-l2a", assets: {} }],
        links: [],
      }),
    };
  };

  const result = await searchStacItems(
    fetchMock,
    makePayload({
      providerId: "copernicus-stac",
      collections: ["sentinel-2-l2a"],
    }),
    { maxPages: 1 }
  );

  assert.equal(calls, 3);
  assert.equal(result.itemCount, 1);
});

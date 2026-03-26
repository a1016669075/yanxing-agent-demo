const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bboxToLaadsRegion,
  buildLaadsDownloadPlan,
  buildLaadsSearchUrl,
  laadsProductCatalog,
  normalizeLaadsSearchPayload,
  searchLaadsContent,
} = require("./laadsSearch.cjs");

function makePayload(overrides = {}) {
  return {
    productId: "MYD04_3K",
    bbox: [110.2, 20.4, 117.6, 25.6],
    startDate: "2026-03-17",
    endDate: "2026-03-24",
    limit: 3,
    sourceLabel: "珠三角场景",
    ...overrides,
  };
}

test("LAADS bbox 会被转成官方 regions 字符串", () => {
  assert.equal(
    bboxToLaadsRegion([110.2, 20.4, 117.6, 25.6]),
    "[BBOX]W110.2 N25.6 E117.6 S20.4"
  );
});

test("LAADS 查询参数会被规范化为统一请求结构", () => {
  const request = normalizeLaadsSearchPayload(makePayload());

  assert.equal(request.productId, "MYD04_3K");
  assert.equal(request.temporalRange, "2026-03-17..2026-03-24");
  assert.equal(request.region, "[BBOX]W110.2 N25.6 E117.6 S20.4");
});

test("LAADS 搜索 URL 会带上 products、time 和 region", () => {
  const request = normalizeLaadsSearchPayload(makePayload());
  const url = buildLaadsSearchUrl(request);

  assert.ok(url.includes("products=MYD04_3K"));
  assert.ok(url.includes("temporalRanges=2026-03-17..2026-03-24"));
  assert.ok(url.includes("regions=%5BBBOX%5DW110.2+N25.6+E117.6+S20.4"));
});

test("LAADS 搜索会跟随 nextPageLink 并只保留目标 product", async () => {
  let count = 0;
  const fetchMock = async () => {
    count += 1;
    if (count === 1) {
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              fileId: 1,
              name: "A.hdf",
              products: "MYD04_3K",
              start: "2026-03-17 06:30:00",
              size: 1024,
              downloadsLink: "https://example.test/A.hdf",
            },
          ],
          nextPageLink: "https://example.test/page-2",
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({
        content: [
          {
            fileId: 2,
            name: "B.hdf",
            products: "OTHER_PRODUCT",
            start: "2026-03-18 06:30:00",
            size: 2048,
            downloadsLink: "https://example.test/B.hdf",
          },
          {
            fileId: 3,
            name: "C.hdf",
            products: "MYD04_3K",
            start: "2026-03-19 06:30:00",
            size: 4096,
            downloadsLink: "https://example.test/C.hdf",
          },
        ],
      }),
    };
  };

  const result = await searchLaadsContent(fetchMock, makePayload(), { maxPages: 2 });

  assert.equal(result.itemCount, 2);
  assert.equal(result.filteredOutCount, 1);
  assert.equal(result.pagesFetched, 2);
  assert.deepEqual(
    result.items.map((item) => item.name),
    ["A.hdf", "C.hdf"]
  );
});

test("下载计划会输出 PowerShell 和 Shell 脚本", () => {
  const plan = buildLaadsDownloadPlan({
    productId: "MYD04_3K",
    targetDirectory: "./downloads",
    items: [
      {
        name: "A.hdf",
        downloadsLink: "https://example.test/A.hdf",
        sizeBytes: 1024,
      },
      {
        name: "B.hdf",
        downloadsLink: "https://example.test/B.hdf",
        sizeBytes: 2048,
      },
    ],
  });

  assert.equal(plan.fileCount, 2);
  assert.ok(plan.powerShellScript.includes("Authorization = \"Bearer <EARTHDATA_TOKEN>\""));
  assert.ok(plan.shellScript.includes("curl -L -H \"Authorization: Bearer <EARTHDATA_TOKEN>\""));
  assert.ok(plan.targetDirectory.endsWith("/MYD04_3K"));
});

test("product 目录里至少包含 1 个可用产品", () => {
  assert.ok(laadsProductCatalog.products.length >= 1);
  assert.equal(laadsProductCatalog.defaultProductId, "MYD04_3K");
});

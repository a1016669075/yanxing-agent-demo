const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildUpstreamGibsUrl,
  cacheKeyForParams,
  createProxyCache,
  normalizeProxyParams,
} = require("./basemapProxy.cjs");

function makeSearchParams(overrides = {}) {
  const defaults = new URLSearchParams({
    layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
    bbox: "110,20,120,30",
    width: "1200",
    height: "800",
    time: "2026-03-24",
    format: "image/jpeg",
    transparent: "false",
  });

  Object.entries(overrides).forEach(([key, value]) => {
    defaults.set(key, value);
  });

  return defaults;
}

test("代理参数会被规范化成稳定结构", () => {
  const params = normalizeProxyParams(makeSearchParams());

  assert.equal(params.layer, "VIIRS_NOAA21_CorrectedReflectance_TrueColor");
  assert.deepEqual(params.bbox, [110, 20, 120, 30]);
  assert.equal(params.width, 1200);
  assert.equal(params.time, "2026-03-24");
});

test("不同日期会生成不同缓存 key，避免跨日期串图", () => {
  const dayOne = cacheKeyForParams(normalizeProxyParams(makeSearchParams({ time: "2026-03-24" })));
  const dayTwo = cacheKeyForParams(normalizeProxyParams(makeSearchParams({ time: "2026-03-25" })));

  assert.notEqual(dayOne, dayTwo);
});

test("相同请求第二次读取会命中缓存", () => {
  const cache = createProxyCache(4);
  const key = cacheKeyForParams(normalizeProxyParams(makeSearchParams()));

  assert.equal(cache.read(key), null);
  cache.write(key, { contentType: "image/jpeg", body: Buffer.from("demo") });
  assert.ok(cache.read(key));

  const snapshot = cache.snapshot();
  assert.equal(snapshot.misses, 1);
  assert.equal(snapshot.hits, 1);
  assert.equal(snapshot.lastCacheStatus, "HIT");
});

test("上游 URL 会保留 GIBS 所需的关键参数", () => {
  const params = normalizeProxyParams(makeSearchParams({ transparent: "true", format: "image/png" }));
  const url = buildUpstreamGibsUrl(params);

  assert.ok(url.includes("REQUEST=GetMap"));
  assert.ok(url.includes("LAYERS=VIIRS_NOAA21_CorrectedReflectance_TrueColor"));
  assert.ok(url.includes("TIME=2026-03-24"));
  assert.ok(url.includes("TRANSPARENT=TRUE"));
});

test("缺少关键字段时会 fail-fast", () => {
  assert.throws(
    () => normalizeProxyParams(makeSearchParams({ width: "0" })),
    /width 必须是正整数/
  );
});

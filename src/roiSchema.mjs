const EARTH_RADIUS_KM = 6371.0088;

export const roiInputPresets = [
  {
    id: "bbox-hexi",
    label: "示例 1：河西走廊 bbox",
    description: "最小输入示例，直接给一个 bbox，系统会自动补成标准 Polygon。",
    value: {
      id: "roi-hexi-bbox",
      bbox: [86.2, 37.1, 92.8, 40.6],
      properties: {
        mission: "dust-monitoring",
        note: "河西走廊沙尘重点走廊",
      },
    },
  },
  {
    id: "polygon-prd",
    label: "示例 2：珠三角 polygon",
    description: "有效 polygon 示例，适合验证 bbox / polygon 是否能统一输出。",
    value: {
      type: "Feature",
      properties: {
        id: "roi-prd-poly",
        mission: "pollution-monitoring",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [112.1, 23.8],
            [114.6, 24.4],
            [116.2, 23.2],
            [115.2, 21.8],
            [112.9, 21.4],
            [111.9, 22.6],
            [112.1, 23.8],
          ],
        ],
      },
    },
  },
  {
    id: "polygon-self-cross",
    label: "示例 3：自交 polygon",
    description: "故意构造的错误输入，用来验证自交多边形能否被拦截。",
    value: {
      type: "Polygon",
      coordinates: [
        [
          [113.1, 22.3],
          [115.3, 24.5],
          [114.7, 21.8],
          [112.7, 24.1],
          [113.1, 22.3],
        ],
      ],
    },
  },
];

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function fail(message) {
  const error = new Error(message);
  error.name = "RoiValidationError";
  throw error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureCoordinate(pair, contextLabel) {
  if (!Array.isArray(pair) || pair.length < 2) {
    fail(`${contextLabel} 不是合法坐标对。`);
  }

  const [lon, lat] = pair;
  if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) {
    fail(`${contextLabel} 中存在非数值坐标。`);
  }

  if (lon < -180 || lon > 180) {
    fail(`${contextLabel} 的经度超出 EPSG:4326 合法范围。`);
  }

  if (lat < -90 || lat > 90) {
    fail(`${contextLabel} 的纬度超出 EPSG:4326 合法范围。`);
  }

  return [round(lon), round(lat)];
}

function normalizeBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    fail("bbox 必须是 [minLon, minLat, maxLon, maxLat] 四元数组。");
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (![minLon, minLat, maxLon, maxLat].every(isFiniteNumber)) {
    fail("bbox 中存在非数值坐标。");
  }

  ensureCoordinate([minLon, minLat], "bbox 左下角");
  ensureCoordinate([maxLon, maxLat], "bbox 右上角");
  const normalized = [round(minLon), round(minLat), round(maxLon), round(maxLat)];

  if (normalized[0] >= normalized[2] || normalized[1] >= normalized[3]) {
    fail("bbox 的最小值必须严格小于最大值。");
  }

  return normalized;
}

function bboxToRing(bbox) {
  const [minLon, minLat, maxLon, maxLat] = normalizeBbox(bbox);
  return [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ];
}

function canonicalizeRing(inputRing) {
  if (!Array.isArray(inputRing) || inputRing.length < 4) {
    fail("Polygon 外环至少需要 4 个顶点。");
  }

  const ring = inputRing.map((pair, index) => ensureCoordinate(pair, `polygon 顶点 ${index + 1}`));
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }

  if (ring.length < 5) {
    fail("Polygon 外环闭合后至少需要 4 个不同顶点。");
  }

  return ring;
}

function orientation(a, b, c) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-10) {
    return 0;
  }
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return (
    Math.min(a[0], c[0]) <= b[0] + 1e-10 &&
    b[0] <= Math.max(a[0], c[0]) + 1e-10 &&
    Math.min(a[1], c[1]) <= b[1] + 1e-10 &&
    b[1] <= Math.max(a[1], c[1]) + 1e-10
  );
}

function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(p1, p2, q1)) {
    return true;
  }
  if (o2 === 0 && onSegment(p1, q2, q1)) {
    return true;
  }
  if (o3 === 0 && onSegment(p2, p1, q2)) {
    return true;
  }
  if (o4 === 0 && onSegment(p2, q1, q2)) {
    return true;
  }

  return false;
}

export function detectSelfIntersection(ring) {
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a1 = ring[i];
    const a2 = ring[i + 1];

    for (let j = i + 1; j < ring.length - 1; j += 1) {
      const b1 = ring[j];
      const b2 = ring[j + 1];

      if (i === j) {
        continue;
      }

      if (Math.abs(i - j) === 1) {
        continue;
      }

      if (i === 0 && j === ring.length - 2) {
        continue;
      }

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return {
          intersects: true,
          segmentA: [i, i + 1],
          segmentB: [j, j + 1],
        };
      }
    }
  }

  return {
    intersects: false,
    segmentA: null,
    segmentB: null,
  };
}

function ringBbox(ring) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  ring.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  });

  return [round(minLon), round(minLat), round(maxLon), round(maxLat)];
}

function approximateAreaSquareKm(ring) {
  const latMean = (ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length) * (Math.PI / 180);
  const cosLat = Math.max(0.1, Math.cos(latMean));
  const scaleX = ((Math.PI / 180) * EARTH_RADIUS_KM) * cosLat;
  const scaleY = (Math.PI / 180) * EARTH_RADIUS_KM;

  let twiceArea = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    const x1 = lon1 * scaleX;
    const y1 = lat1 * scaleY;
    const x2 = lon2 * scaleX;
    const y2 = lat2 * scaleY;
    twiceArea += x1 * y2 - x2 * y1;
  }

  return round(Math.abs(twiceArea) / 2, 3);
}

function polygonCentroid(ring) {
  let areaFactor = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    areaFactor += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }

  if (Math.abs(areaFactor) < 1e-10) {
    const bbox = ringBbox(ring);
    return [round((bbox[0] + bbox[2]) / 2), round((bbox[1] + bbox[3]) / 2)];
  }

  return [round(centroidX / (3 * areaFactor)), round(centroidY / (3 * areaFactor))];
}

function normalizePolygon(geometry) {
  if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
    fail("当前仅支持 GeoJSON Polygon 输入。");
  }

  if (geometry.coordinates.length === 0) {
    fail("Polygon 缺少坐标。");
  }

  if (geometry.coordinates.length > 1) {
    fail("当前模块暂不处理带洞 Polygon，请先提交单外环 ROI。");
  }

  const ring = canonicalizeRing(geometry.coordinates[0]);
  const intersection = detectSelfIntersection(ring);

  if (intersection.intersects) {
    fail(
      `polygon 存在自交，冲突边为 ${intersection.segmentA[0]}-${intersection.segmentA[1]} 与 ${intersection.segmentB[0]}-${intersection.segmentB[1]}。`
    );
  }

  return ring;
}

function toFeatureGeometry(input) {
  if (Array.isArray(input)) {
    return {
      sourceType: "bbox",
      geometry: {
        type: "Polygon",
        coordinates: [bboxToRing(input)],
      },
      properties: {},
      originalBbox: normalizeBbox(input),
      requestedId: null,
    };
  }

  if (!input || typeof input !== "object") {
    fail("ROI 输入必须是 bbox 数组、GeoJSON Polygon 或 GeoJSON Feature。");
  }

  if (Array.isArray(input.bbox)) {
    return {
      sourceType: "bbox",
      geometry: {
        type: "Polygon",
        coordinates: [bboxToRing(input.bbox)],
      },
      properties: clone(input.properties ?? {}),
      originalBbox: normalizeBbox(input.bbox),
      requestedId: input.id ?? input.properties?.id ?? null,
    };
  }

  if (input.type === "Feature") {
    return {
      sourceType: input.geometry?.type === "Polygon" ? "polygon" : "unknown",
      geometry: clone(input.geometry),
      properties: clone(input.properties ?? {}),
      originalBbox: Array.isArray(input.bbox) ? normalizeBbox(input.bbox) : null,
      requestedId: input.id ?? input.properties?.id ?? null,
    };
  }

  if (input.type === "Polygon") {
    return {
      sourceType: "polygon",
      geometry: clone(input),
      properties: {},
      originalBbox: null,
      requestedId: null,
    };
  }

  fail("无法识别 ROI 输入格式，请提供 bbox、GeoJSON Polygon 或 GeoJSON Feature。");
}

export function normalizeRoiDefinition(input, options = {}) {
  const featureLike = toFeatureGeometry(input);
  const ring = normalizePolygon(featureLike.geometry);
  const bbox = featureLike.originalBbox ?? ringBbox(ring);
  const centroid = polygonCentroid(ring);
  const areaSquareKm = approximateAreaSquareKm(ring);

  return {
    id: options.id ?? featureLike.requestedId ?? "roi-input",
    crs: "EPSG:4326",
    sourceType: featureLike.sourceType,
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
    bbox,
    centroid,
    areaSquareKm,
    vertexCount: ring.length - 1,
    properties: featureLike.properties,
    validation: {
      ringClosed: true,
      selfIntersectionFree: true,
      coordinateRangeValid: true,
    },
  };
}

export function formatRoiJson(value) {
  return JSON.stringify(value, null, 2);
}

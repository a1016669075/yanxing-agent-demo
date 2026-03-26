function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function bboxIntersects(left, right) {
  return !(
    left[2] <= right[0] ||
    left[0] >= right[2] ||
    left[3] <= right[1] ||
    left[1] >= right[3]
  );
}

function mercatorLatToTile(lat, zoom) {
  const latRad = (clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180;
  const n = 2 ** zoom;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
}

function lonToTile(lon, zoom) {
  const n = 2 ** zoom;
  return Math.floor(((lon + 180) / 360) * n);
}

function tileToLon(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileToLat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tileBBox(z, x, y) {
  return [tileToLon(x, z), tileToLat(y + 1, z), tileToLon(x + 1, z), tileToLat(y, z)];
}

function coordinatesBbox(coordinates) {
  const flat = coordinates.flat(Infinity).filter((value) => typeof value === "number");
  const xs = [];
  const ys = [];
  for (let index = 0; index < flat.length; index += 2) {
    xs.push(flat[index]);
    ys.push(flat[index + 1]);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function featureBbox(feature) {
  if (Array.isArray(feature?.bbox) && feature.bbox.length === 4) {
    return feature.bbox.map(Number);
  }
  return coordinatesBbox(feature.geometry.coordinates);
}

function closeRing(ring) {
  if (!ring.length) {
    return ring;
  }
  const [firstX, firstY] = ring[0];
  const [lastX, lastY] = ring[ring.length - 1];
  if (firstX === lastX && firstY === lastY) {
    return ring;
  }
  return [...ring, ring[0]];
}

function clipPolygonAgainstEdge(points, edge, value) {
  const output = [];
  if (!points.length) {
    return output;
  }

  function isInside(point) {
    if (edge === "left") return point[0] >= value;
    if (edge === "right") return point[0] <= value;
    if (edge === "bottom") return point[1] >= value;
    return point[1] <= value;
  }

  function intersection(start, end) {
    const [x1, y1] = start;
    const [x2, y2] = end;
    if (edge === "left" || edge === "right") {
      const x = value;
      const ratio = x2 === x1 ? 0 : (x - x1) / (x2 - x1);
      return [x, y1 + (y2 - y1) * ratio];
    }
    const y = value;
    const ratio = y2 === y1 ? 0 : (y - y1) / (y2 - y1);
    return [x1 + (x2 - x1) * ratio, y];
  }

  let previous = points[points.length - 1];
  for (const current of points) {
    const currentInside = isInside(current);
    const previousInside = isInside(previous);

    if (currentInside) {
      if (!previousInside) {
        output.push(intersection(previous, current));
      }
      output.push(current);
    } else if (previousInside) {
      output.push(intersection(previous, current));
    }
    previous = current;
  }

  return output;
}

function clipRingToBbox(ring, bbox) {
  const [west, south, east, north] = bbox;
  let output = ring.slice(0, -1);
  output = clipPolygonAgainstEdge(output, "left", west);
  output = clipPolygonAgainstEdge(output, "right", east);
  output = clipPolygonAgainstEdge(output, "bottom", south);
  output = clipPolygonAgainstEdge(output, "top", north);
  if (output.length < 3) {
    return [];
  }
  return closeRing(output);
}

function clipFeatureToTile(feature, bbox) {
  if (feature.geometry?.type !== "Polygon") {
    return {
      ...feature,
      bbox,
    };
  }

  const clippedRings = feature.geometry.coordinates
    .map((ring) => clipRingToBbox(ring, bbox))
    .filter((ring) => ring.length >= 4);

  if (!clippedRings.length) {
    return null;
  }

  return {
    ...feature,
    bbox,
    geometry: {
      type: "Polygon",
      coordinates: clippedRings,
    },
  };
}

export function sliceFeatureCollectionToJsonTiles(
  featureCollection,
  { zoom = 6, maxTilesPerFeature = 64 } = {}
) {
  const tileMap = new Map();
  const features = featureCollection?.features || [];

  for (const feature of features) {
    const bbox = featureBbox(feature);
    const n = 2 ** zoom;
    const minX = clamp(lonToTile(bbox[0], zoom), 0, n - 1);
    const maxX = clamp(lonToTile(bbox[2], zoom), 0, n - 1);
    const minY = clamp(mercatorLatToTile(bbox[3], zoom), 0, n - 1);
    const maxY = clamp(mercatorLatToTile(bbox[1], zoom), 0, n - 1);

    let emitted = 0;
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        if (emitted >= maxTilesPerFeature) {
          break;
        }
        const bboxForTile = tileBBox(zoom, x, y);
        if (!bboxIntersects(bbox, bboxForTile)) {
          continue;
        }

        const clippedFeature = clipFeatureToTile(feature, bboxForTile);
        if (!clippedFeature) {
          continue;
        }

        const key = `${zoom}/${x}/${y}`;
        if (!tileMap.has(key)) {
          tileMap.set(key, { z: zoom, x, y, key, bbox: bboxForTile, features: [] });
        }
        tileMap.get(key).features.push(clippedFeature);
        emitted += 1;
      }
    }
  }

  const tiles = [...tileMap.values()].map((tile) => ({
    ...tile,
    featureCount: tile.features.length,
    estimatedBytes: JSON.stringify(tile.features).length,
  }));

  return {
    zoom,
    tileCount: tiles.length,
    tiles,
  };
}

export function lookupJsonTile(bundle, z, x, y) {
  return bundle?.tiles?.find((tile) => tile.z === z && tile.x === x && tile.y === y) || null;
}

export function summarizeJsonTileBundle(bundle) {
  const tiles = bundle?.tiles || [];
  const totalBytes = tiles.reduce((sum, tile) => sum + tile.estimatedBytes, 0);
  const maxBytes = tiles.reduce((max, tile) => Math.max(max, tile.estimatedBytes), 0);
  return {
    zoom: bundle?.zoom ?? null,
    tileCount: tiles.length,
    totalFeatures: tiles.reduce((sum, tile) => sum + tile.featureCount, 0),
    totalKb: round(totalBytes / 1024),
    maxTileKb: round(maxBytes / 1024),
  };
}

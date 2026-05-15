function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function centerTimestamp(detections = []) {
  const values = detections
    .map((item) => new Date(item?.acquisition_start_utc || item?.acqTimeUtc).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!values.length) {
    return null;
  }
  return new Date(values[Math.floor(values.length / 2)]).toISOString();
}

function recencyWeight(item = {}, temporalState = {}) {
  const requestAnchor = temporalState?.canonical_event_time_utc || temporalState?.request_anchor_utc;
  const pointTime = item?.acquisition_start_utc || item?.acqTimeUtc;
  if (!requestAnchor || !pointTime) {
    return 0.3;
  }
  const offsetMin = Math.abs(new Date(requestAnchor).getTime() - new Date(pointTime).getTime()) / (60 * 1000);
  const discoveryWindowMin = Math.max(60, (Number(temporalState.discovery_bin_h) || 6) * 60);
  return round(clamp(1 - offsetMin / discoveryWindowMin, 0.08, 1), 4);
}

function fixedGridStepDegrees(bbox = null) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return 0.25;
  }
  const lonSpan = Math.abs(Number(bbox[2]) - Number(bbox[0])) || 0;
  const latSpan = Math.abs(Number(bbox[3]) - Number(bbox[1])) || 0;
  const dominantSpan = Math.max(lonSpan, latSpan);
  if (dominantSpan <= 2) {
    return 0.08;
  }
  if (dominantSpan <= 6) {
    return 0.16;
  }
  if (dominantSpan <= 12) {
    return 0.24;
  }
  return 0.4;
}

export function buildPerSensorTimeBins(detections = [], temporalState = {}) {
  const binHours = Math.max(1, Math.round(Number(temporalState.discovery_bin_h) || 6));
  const binMs = binHours * 60 * 60 * 1000;
  const bins = new Map();

  (Array.isArray(detections) ? detections : [])
    .filter((item) => item?.can_affect_detection)
    .forEach((item) => {
      const timestamp = new Date(item?.acquisition_start_utc || item?.acqTimeUtc).getTime();
      if (!Number.isFinite(timestamp)) {
        return;
      }
      const sensor = String(item?.sensor || item?.product || "unknown");
      const bucket = Math.floor(timestamp / binMs);
      const key = `${sensor}:${bucket}`;
      if (!bins.has(key)) {
        bins.set(key, {
          id: `bin-${bins.size + 1}`,
          key,
          sensor,
          bucket,
          startUtc: new Date(bucket * binMs).toISOString(),
          endUtc: new Date((bucket + 1) * binMs).toISOString(),
          detections: [],
        });
      }
      bins.get(key).detections.push(item);
    });

  return [...bins.values()].sort((left, right) => String(left.startUtc).localeCompare(String(right.startUtc)));
}

export function scoreCoarseTiles(timeBins = [], { bbox = null, temporalState = {} } = {}) {
  const tileStep = fixedGridStepDegrees(bbox);
  const tiles = new Map();

  (Array.isArray(timeBins) ? timeBins : []).forEach((bin) => {
    bin.detections.forEach((item) => {
      const tileX = Math.floor((Number(item.lon) || 0) / tileStep);
      const tileY = Math.floor((Number(item.lat) || 0) / tileStep);
      const tileKey = `${bin.sensor}:${bin.key}:${tileX}:${tileY}`;
      if (!tiles.has(tileKey)) {
        tiles.set(tileKey, {
          id: `tile-${tiles.size + 1}`,
          tileKey,
          sensor: bin.sensor,
          binId: bin.id,
          binKey: bin.key,
          binStartUtc: bin.startUtc,
          binEndUtc: bin.endUtc,
          detections: [],
        });
      }
      tiles.get(tileKey).detections.push(item);
    });
  });

  return [...tiles.values()]
    .map((tile) => {
      const repeatHitBonus = Math.min(0.2, Math.max(0, tile.detections.length - 1) * 0.06);
      const confidenceWeight = tile.detections.reduce((sum, item) => sum + (Number(item?.confidence?.score) || 0.4), 0);
      const frpContribution = tile.detections.reduce((sum, item) => sum + Math.min(1.6, (Number(item?.frpMw) || 0) / 120), 0);
      const recency = tile.detections.reduce((sum, item) => sum + recencyWeight(item, temporalState), 0) / Math.max(1, tile.detections.length);
      const staticPenalty =
        tile.detections.reduce((sum, item) => sum + (Number(item?.staticSourceSuspicion) || 0), 0) / Math.max(1, tile.detections.length);
      const score = round(
        clamp(confidenceWeight * 0.18 + frpContribution * 0.12 + recency * 0.38 + repeatHitBonus - staticPenalty * 0.2, 0, 1),
        4
      );
      return {
        ...tile,
        score,
        repeatHitBonus: round(repeatHitBonus, 4),
        staticPenalty: round(staticPenalty, 4),
        recency: round(recency, 4),
      };
    })
    .sort((left, right) => right.score - left.score);
}

export function discoverFineHotspots(timeBins = [], { bbox = null, temporalState = {} } = {}) {
  const scoredTiles = scoreCoarseTiles(timeBins, { bbox, temporalState });
  return scoredTiles
    .filter((tile) => tile.score >= 0.16 || tile.detections.length >= 2)
    .map((tile, index) => {
      const detections = tile.detections.slice();
      const lats = detections.map((item) => Number(item.lat) || 0);
      const lons = detections.map((item) => Number(item.lon) || 0);
      const centroidLat = lats.reduce((sum, value) => sum + value, 0) / Math.max(1, lats.length);
      const centroidLon = lons.reduce((sum, value) => sum + value, 0) / Math.max(1, lons.length);
      return {
        id: `hotspot-${index + 1}`,
        sensor: tile.sensor,
        binId: tile.binId,
        coarseTileScore: tile.score,
        repeatHitBonus: tile.repeatHitBonus,
        staticPenalty: tile.staticPenalty,
        centroidLat: round(centroidLat, 6),
        centroidLon: round(centroidLon, 6),
        timeCenterUtc: centerTimestamp(detections),
        detections,
      };
    });
}

export function runWildfireDiscovery(detections = [], { bbox = null, temporalState = {} } = {}) {
  const perSensorTimeBins = buildPerSensorTimeBins(detections, temporalState);
  const coarseTiles = scoreCoarseTiles(perSensorTimeBins, { bbox, temporalState });
  const hotspots = discoverFineHotspots(perSensorTimeBins, { bbox, temporalState });
  return {
    detections: Array.isArray(detections) ? detections : [],
    perSensorTimeBins,
    coarseTiles,
    hotspots,
  };
}

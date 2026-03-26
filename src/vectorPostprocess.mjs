function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roiBoxToPolygon(sceneBbox, box) {
  const [west, south, east, north] = sceneBbox;
  const lonSpan = east - west;
  const latSpan = north - south;

  const minLon = west + (box.left / 100) * lonSpan;
  const maxLon = west + ((box.left + box.width) / 100) * lonSpan;
  const maxLat = north - (box.top / 100) * latSpan;
  const minLat = north - ((box.top + box.height) / 100) * latSpan;

  return [
    [round(minLon), round(minLat)],
    [round(maxLon), round(minLat)],
    [round(maxLon), round(maxLat)],
    [round(minLon), round(maxLat)],
    [round(minLon), round(minLat)],
  ];
}

function approxAreaKm2(sceneBbox, box) {
  const [west, south, east, north] = sceneBbox;
  const lonSpan = east - west;
  const latSpan = north - south;
  const meanLat = ((north + south) / 2) * (Math.PI / 180);
  const widthKm = ((box.width / 100) * lonSpan) * 111.32 * Math.cos(meanLat);
  const heightKm = ((box.height / 100) * latSpan) * 111.32;
  return round(Math.max(0, widthKm * heightKm), 2);
}

export function roisToFeatureCollection({ sceneBbox, rois, sceneId, dateValue, modelId, selectedIds = [] }) {
  const selectedSet = new Set(selectedIds);
  return {
    type: "FeatureCollection",
    features: (rois || []).map((roi) => ({
      type: "Feature",
      id: roi.id,
      geometry: {
        type: "Polygon",
        coordinates: [roiBoxToPolygon(sceneBbox, roi.box)],
      },
      properties: {
        scene_id: sceneId,
        date: dateValue,
        model_id: modelId,
        roi_id: roi.id,
        name: roi.name,
        risk: roi.risk,
        signal: roi.signal,
        area_km2: approxAreaKm2(sceneBbox, roi.box),
        selected: selectedSet.has(roi.id),
      },
    })),
  };
}

export function summarizeFeatureCollection(collection) {
  const features = collection?.features || [];
  const selectedCount = features.filter((feature) => feature.properties?.selected).length;
  const totalAreaKm2 = round(
    features.reduce((sum, feature) => sum + (Number(feature.properties?.area_km2) || 0), 0),
    2
  );

  return {
    featureCount: features.length,
    selectedCount,
    totalAreaKm2,
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildVectorTilePreview(
  bundle,
  { layerId = "anomaly_roi", basePath = "/local-vector", encoding = "mvt-preview" } = {}
) {
  const tiles = (bundle?.tiles || []).map((tile) => ({
    key: tile.key,
    path: `${basePath}/${tile.z}/${tile.x}/${tile.y}.pbf`,
    featureCount: tile.featureCount,
    estimatedBytes: tile.estimatedBytes,
  }));

  const averageBytes =
    tiles.reduce((sum, tile) => sum + tile.estimatedBytes, 0) / Math.max(tiles.length, 1);

  return {
    type: "TileJSON",
    encoding,
    layerId,
    minzoom: bundle?.zoom ?? 0,
    maxzoom: bundle?.zoom ?? 0,
    tileCount: tiles.length,
    averageTileKb: round(averageBytes / 1024),
    tiles: [`${basePath}/{z}/{x}/{y}.pbf`],
    vectorLayers: [
      {
        id: layerId,
        fields: {
          id: "String",
          roi_id: "String",
          selected: "Number",
          score: "Number",
        },
      },
    ],
    entries: tiles,
  };
}

export function summarizeVectorTilePreview(preview) {
  return {
    tileCount: preview?.tileCount || 0,
    layerId: preview?.layerId || null,
    averageTileKb: preview?.averageTileKb || 0,
    maxTileKb: round(
      Math.max(...(preview?.entries?.map((entry) => entry.estimatedBytes) || [0])) / 1024
    ),
  };
}

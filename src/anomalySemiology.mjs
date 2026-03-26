function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sum(values = []) {
  return values.reduce((total, value) => total + value, 0);
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function pointBand(strength = 0) {
  if (strength >= 0.8) {
    return "core";
  }
  if (strength >= 0.6) {
    return "strong";
  }
  return "trace";
}

function pointAlpha(strength = 0, band = "trace") {
  const base = clamp(0.2 + strength * 0.72, 0.24, 0.92);
  if (band === "core") {
    return round(Math.min(0.96, base + 0.08));
  }
  if (band === "strong") {
    return round(Math.min(0.88, base + 0.03));
  }
  return round(base);
}

function pointSize(strength = 0, band = "trace") {
  const base = 0.44 + strength * 1.15;
  if (band === "core") {
    return round(clamp(base + 0.24, 0.78, 1.92));
  }
  if (band === "strong") {
    return round(clamp(base + 0.08, 0.68, 1.7));
  }
  return round(clamp(base, 0.58, 1.46));
}

function isThermalHotspotMode(outputProduct, scenario = {}) {
  return outputProduct === "thermal-hotspot-map" || scenario?.type === "wildfire";
}

function statusForRoi(processedRoi, degraded = false) {
  if (!processedRoi) {
    return "candidate";
  }
  return degraded ? "degraded" : "processed";
}

function statusLabel(status, { thermalHotspot = false } = {}) {
  if (status === "processed") {
    return thermalHotspot ? "已确认热异常热点" : "已进入深度反演";
  }
  if (status === "degraded") {
    return "仅输出降级热区";
  }
  return thermalHotspot ? "待进入局部复核" : "待进入精细处理";
}

function intensityLabel(intensity, { thermalHotspot = false } = {}) {
  if (intensity >= 0.82) {
    return thermalHotspot ? "核心热异常" : "核心异常";
  }
  if (intensity >= 0.66) {
    return thermalHotspot ? "显著热异常" : "显著异常";
  }
  return thermalHotspot ? "边缘热异常" : "边缘异常";
}

function fallbackConfidence(roi = {}, scenario = {}) {
  return round(
    clamp(
      safeNumber(roi.risk, 0.55) * 0.58 +
        safeNumber(scenario.anomalyDensity, 0.58) * 0.2 +
        (1 - safeNumber(roi.cloud, 0.22)) * 0.12,
      0.46,
      0.9
    )
  );
}

function fallbackIntensity(roi = {}) {
  return round(
    clamp(safeNumber(roi.risk, 0.55) * 0.68 + safeNumber(roi.signal, 0.52) * 0.24, 0.34, 0.94)
  );
}

function groupPointsByRoi(points = []) {
  return points.reduce((groups, point) => {
    const roiId = point?.roiId;
    if (!roiId) {
      return groups;
    }
    const bucket = groups.get(roiId) ?? [];
    bucket.push(point);
    groups.set(roiId, bucket);
    return groups;
  }, new Map());
}

function weightedAnchor(points = [], roi = {}) {
  if (!points.length) {
    const box = roi.box || {};
    return {
      x: round(clamp(safeNumber(box.left, 20) + safeNumber(box.width, 12) / 2, 4, 96)),
      y: round(clamp(safeNumber(box.top, 20) + safeNumber(box.height, 12) / 2, 7, 93)),
      spread: 0.18,
      pointCount: 0,
    };
  }

  const weighted = points.map((point) => ({
    ...point,
    weight: 0.42 + clamp(safeNumber(point.strength, 0.5), 0.18, 0.98) * 0.58,
  }));
  const totalWeight = Math.max(0.001, sum(weighted.map((point) => point.weight)));
  const x = sum(weighted.map((point) => point.x * point.weight)) / totalWeight;
  const y = sum(weighted.map((point) => point.y * point.weight)) / totalWeight;
  const spreadX = sum(weighted.map((point) => Math.abs(point.x - x) * point.weight)) / totalWeight;
  const spreadY = sum(weighted.map((point) => Math.abs(point.y - y) * point.weight)) / totalWeight;

  return {
    x: round(clamp(x, 4, 96)),
    y: round(clamp(y, 7, 93)),
    spread: round(clamp((spreadX + spreadY) / 10, 0.16, 0.82)),
    pointCount: points.length,
  };
}

function markerGeometry(anchor, intensity = 0.6, status = "candidate") {
  const anchorSizeRem = round(
    clamp(1 + intensity * 1.1 + Math.min(0.42, Math.log10(anchor.pointCount + 1) * 0.28), 1.05, 2.28)
  );
  const connectorRem = round(clamp(0.68 + anchor.spread * 0.9 + (status === "processed" ? 0.1 : 0), 0.74, 1.42));
  const labelY = round(clamp(anchor.y - Math.min(5.2, anchor.spread * 10 + 1.2), 8, 88));

  return {
    anchorSizeRem,
    connectorRem,
    labelX: anchor.x,
    labelY,
  };
}

function legendItems(markers = [], degraded = false, { thermalHotspot = false } = {}) {
  const hasProcessed = markers.some((marker) => marker.status === "processed");
  const hasCandidate = markers.some((marker) => marker.status === "candidate");
  const hasDegraded = markers.some((marker) => marker.status === "degraded");

  const items = [
    { key: "trace", swatchClass: "pixel-trace", label: thermalHotspot ? "热异常像元分布" : "异常像元分布" },
    { key: "core", swatchClass: "pixel-core", label: thermalHotspot ? "核心热异常像元" : "核心异常像元" },
  ];

  if (hasProcessed) {
    items.push({
      key: "processed",
      swatchClass: "anchor-processed",
      label: thermalHotspot ? "已确认热异常热点" : "已进入深度反演",
    });
  }

  if (hasDegraded || degraded) {
    items.push({ key: "degraded", swatchClass: "anchor-degraded", label: "仅保留降级热区输出" });
  } else if (hasCandidate) {
    items.push({
      key: "candidate",
      swatchClass: "anchor-candidate",
      label: thermalHotspot ? "待进入局部复核" : "待进入精细处理",
    });
  }

  return items;
}

export function buildAnomalyMarkerModel({ scenario, result = null, overlayPoints = [] } = {}) {
  const sourcePoints = Array.isArray(overlayPoints) ? overlayPoints : [];
  const groupedPoints = groupPointsByRoi(sourcePoints);
  const outputProduct = result?.state?.outputProduct;
  const degraded = outputProduct === "anomaly-heatmap";
  const thermalHotspot = isThermalHotspotMode(outputProduct, scenario);
  const processedRois = Array.isArray(result?.state?.processedRois) ? result.state.processedRois : [];
  const processedMap = new Map(processedRois.map((roi) => [roi.id, roi]));

  const points = sourcePoints.map((point) => {
    const band = pointBand(safeNumber(point.strength, 0.5));

    return {
      roiId: point.roiId,
      x: safeNumber(point.x, 0),
      y: safeNumber(point.y, 0),
      strength: round(clamp(safeNumber(point.strength, 0.5), 0.18, 0.98)),
      band,
      alpha: pointAlpha(point.strength, band),
      sizeRem: pointSize(point.strength, band),
    };
  });

  const markers = (scenario?.rois || []).map((roi, index) => {
    const roiId = roi?.id || `R${index + 1}`;
    const roiPoints = groupedPoints.get(roiId) ?? [];
    const processedRoi = processedMap.get(roiId) ?? null;
    const status = statusForRoi(processedRoi, degraded);
    const strengths = roiPoints.map((point) => safeNumber(point.strength, 0.5));
    const peakStrength = strengths.length ? Math.max(...strengths) : fallbackIntensity(roi);
    const meanStrength = strengths.length ? sum(strengths) / strengths.length : fallbackIntensity(roi) * 0.92;
    const intensity = round(clamp(peakStrength * 0.62 + meanStrength * 0.38, 0.24, 0.98));
    const confidence = round(
      clamp(
        processedRoi ? safeNumber(processedRoi.confidence, fallbackConfidence(roi, scenario)) : fallbackConfidence(roi, scenario),
        0.44,
        0.96
      )
    );
    const anchor = weightedAnchor(roiPoints, roi);
    const geometry = markerGeometry(anchor, intensity, status);

    return {
      roiId,
      status,
      statusLabel: statusLabel(status, { thermalHotspot }),
      intensity,
      intensityLabel: intensityLabel(intensity, { thermalHotspot }),
      confidence,
      anchorX: anchor.x,
      anchorY: anchor.y,
      anchorSizeRem: geometry.anchorSizeRem,
      labelX: geometry.labelX,
      labelY: geometry.labelY,
      connectorRem: geometry.connectorRem,
      pointCount: anchor.pointCount || roiPoints.length,
      title: `${roiId} ${intensityLabel(intensity, { thermalHotspot })}`,
      detail: `${statusLabel(status, { thermalHotspot })} · 强度 ${Math.round(intensity * 100)}% · 置信 ${Math.round(confidence * 100)}%`,
    };
  });

  return {
    points,
    markers,
    legend: legendItems(markers, degraded, { thermalHotspot }),
    summary: degraded
      ? {
          title: "像元强度 + 降级状态",
          detail:
            "暖色点簇只表示异常像元强弱，琥珀虚线锚点单独表示当前只输出降级热区，避免把流程降级误解成新的异常类别。",
        }
      : thermalHotspot
        ? {
            title: "热点像元 + 确认状态",
            detail:
              "暖色点簇表示热异常热点像元强弱，青色锚点单独表示已经确认的热点簇，避免把热点确认和后续深度反演混为一谈。",
          }
      : {
          title: "像元强度 + 执行状态",
          detail:
            "暖色点簇只表示异常强弱，青色锚点单独表示已进入深度反演，避免把“已处理”混成异常颜色。",
        },
  };
}

const GIBS_WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dayString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function rapidTimeString(date) {
  const utc = new Date(date);
  utc.setUTCMinutes(0, 0, 0);
  return utc.toISOString().replace(".000Z", "Z");
}

function buildGetMapUrl({ layer, bbox, width, height, time, format, transparent }) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: layer,
    STYLES: "",
    FORMAT: format,
    TRANSPARENT: transparent ? "TRUE" : "FALSE",
    SRS: "EPSG:4326",
    WIDTH: String(width),
    HEIGHT: String(height),
    BBOX: bbox.join(","),
    TIME: time,
  });

  return `${GIBS_WMS_URL}?${params.toString()}`;
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.floor(sorted.length * ratio), 0, sorted.length - 1);
  return sorted[index];
}

function componentScore(component) {
  return component.meanScore * (1 + Math.log(component.pixelCount + 1));
}

function rgbStats(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const warmness = clamp((r - b + 255) / 510, 0, 1);
  const colorfulness =
    Math.sqrt((r - g) ** 2 + (g - b) ** 2 + (b - r) ** 2) / (Math.sqrt(3) * 255);

  return { brightness, saturation, warmness, colorfulness };
}

function scorePixel(r, g, b, type) {
  const { brightness, saturation, warmness, colorfulness } = rgbStats(r, g, b);

  if (type === "dust") {
    return 0.42 * warmness + 0.28 * saturation + 0.18 * colorfulness + 0.12 * brightness;
  }

  if (type === "pollution") {
    return 0.24 * warmness + 0.34 * saturation + 0.28 * colorfulness + 0.14 * brightness;
  }

  return 0.28 * warmness + 0.28 * saturation + 0.28 * colorfulness + 0.16 * brightness;
}

async function loadImageData(url, width, height) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("返回内容不是图像");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("图像解码失败"));
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);

    return {
      imageData: context.getImageData(0, 0, width, height),
      contentType,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function closeMask(mask, width, height) {
  const dilated = new Uint8Array(mask.length);
  const closed = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = 0;
      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (mask[ny * width + nx]) {
            active = 1;
          }
        }
      }
      dilated[y * width + x] = active;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let neighbors = 0;
      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          neighbors += dilated[ny * width + nx];
        }
      }
      closed[y * width + x] = neighbors >= 4 ? 1 : 0;
    }
  }

  return closed;
}

function extractComponents(mask, scores, width, height, minPixels) {
  const visited = new Uint8Array(mask.length);
  const components = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue;
    }

    const queue = [index];
    visited[index] = 1;

    let head = 0;
    let count = 0;
    let scoreSum = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      scoreSum += scores[current];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const next = ny * width + nx;
          if (!mask[next] || visited[next]) {
            continue;
          }

          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    if (count < minPixels) {
      continue;
    }

    components.push({
      pixelCount: count,
      meanScore: scoreSum / count,
      minX,
      minY,
      maxX,
      maxY,
    });
  }

  return components.sort((left, right) => componentScore(right) - componentScore(left));
}

function fallbackWindows(scores, validMask, width, height, maxRois, prefix) {
  const windows = [];
  const stepX = Math.max(24, Math.floor(width / 5));
  const stepY = Math.max(24, Math.floor(height / 5));

  for (let top = 0; top < height - stepY; top += Math.floor(stepY * 0.7)) {
    for (let left = 0; left < width - stepX; left += Math.floor(stepX * 0.7)) {
      let scoreSum = 0;
      let valid = 0;
      for (let y = top; y < top + stepY; y += 1) {
        for (let x = left; x < left + stepX; x += 1) {
          const index = y * width + x;
          if (!validMask[index]) {
            continue;
          }
          scoreSum += scores[index];
          valid += 1;
        }
      }

      if (!valid) {
        continue;
      }

      windows.push({
        pixelCount: valid,
        meanScore: scoreSum / valid,
        minX: left,
        minY: top,
        maxX: left + stepX,
        maxY: top + stepY,
      });
    }
  }

  return windows
    .sort((left, right) => componentScore(right) - componentScore(left))
    .slice(0, maxRois)
    .map((component, index) => toRoi(component, width, height, prefix, index));
}

function toRoi(component, width, height, prefix, index) {
  const left = round((component.minX / width) * 100, 2);
  const top = round((component.minY / height) * 100, 2);
  const boxWidth = round(((component.maxX - component.minX + 1) / width) * 100, 2);
  const boxHeight = round(((component.maxY - component.minY + 1) / height) * 100, 2);
  const risk = clamp(0.48 + component.meanScore * 0.62, 0.42, 0.99);
  const signal = clamp(0.38 + component.meanScore * 0.56, 0.35, 0.96);

  return {
    id: `R${index + 1}`,
    name: `${prefix}${index + 1}`,
    risk: round(risk),
    signal: round(signal),
    cloud: round(clamp(0.12 + (1 - signal) * 0.35, 0.05, 0.62)),
    area: Math.max(60, Math.round(component.pixelCount * 0.8)),
    box: {
      left,
      top,
      width: clamp(boxWidth, 10, 55),
      height: clamp(boxHeight, 10, 55),
    },
  };
}

function buildRois(imageData, scenario) {
  const { width, height, data } = imageData;
  const scores = new Float32Array(width * height);
  const validMask = new Uint8Array(width * height);
  const scoreValues = [];

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const alpha = data[offset + 3];
    if (alpha < 8) {
      continue;
    }

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const score = scorePixel(r, g, b, scenario.type);

    scores[pixelIndex] = score;
    validMask[pixelIndex] = 1;
    scoreValues.push(score);
  }

  if (!scoreValues.length) {
    return {
      rois: scenario.rois,
      anomalyDensity: scenario.anomalyDensity,
      fallbackUsed: true,
      summary: "AOD 产品当前无有效像素，已回退到预置候选区。",
    };
  }

  const threshold = percentile(scoreValues, scenario.analysisProfile.percentile);
  const rawMask = new Uint8Array(width * height);
  let maskCount = 0;

  for (let index = 0; index < scores.length; index += 1) {
    if (!validMask[index]) {
      continue;
    }

    if (scores[index] >= threshold) {
      rawMask[index] = 1;
      maskCount += 1;
    }
  }

  const mask = closeMask(rawMask, width, height);
  const components = extractComponents(
    mask,
    scores,
    width,
    height,
    scenario.analysisProfile.minComponentPixels
  );

  const rois =
    components.length > 0
      ? components
          .slice(0, scenario.analysisProfile.maxRois)
          .map((component, index) =>
            toRoi(component, width, height, scenario.analysisProfile.prefix, index)
          )
      : fallbackWindows(
          scores,
          validMask,
          width,
          height,
          scenario.analysisProfile.maxRois,
          scenario.analysisProfile.prefix
        );

  const detectedCoverage = maskCount / Math.max(1, scoreValues.length);
  const anomalyDensity = clamp(
    scenario.baseAnomalyDensity * 0.55 + detectedCoverage * 2.1,
    0.22,
    0.94
  );

  return {
    rois,
    anomalyDensity: round(anomalyDensity),
    fallbackUsed: components.length === 0,
    summary:
      components.length > 0
        ? `基于 ${scenario.analysisProfile.label} 自动提取到 ${rois.length} 个异常聚类。`
        : `AOD 高值连通域不足，已回退到 ${rois.length} 个高分窗口。`,
  };
}

function blendQuality(baseValue, influence, weight) {
  return clamp(baseValue * (1 - weight) + influence * weight, 0.35, 0.95);
}

function resolveVisualSource(scenario, observation) {
  const profile = scenario.imageryProfile;
  const rapidStart = new Date(profile.rapidStartUtc);
  const localHour = observation.getHours();
  const rapidEligible = observation.getTime() >= rapidStart.getTime();

  if (rapidEligible) {
    const rapidLayer =
      localHour >= 7 && localHour <= 18 ? profile.rapidDayLayer : profile.rapidNightLayer;
    const rapidLabel =
      rapidLayer === profile.rapidDayLayer
        ? "Himawari AHI 红光可见光"
        : "Himawari AHI Air Mass";

    return {
      layer: rapidLayer,
      label: rapidLabel,
      time: rapidTimeString(observation),
      cadenceNote: "10 分钟级时序底图",
      note: `当前底图按北京时间 ${pad2(localHour)}:00 对应时刻加载。`,
    };
  }

  return {
    layer: profile.dailyLayer,
    label: "MODIS Terra 真彩色",
    time: dayString(observation),
    cadenceNote: "日尺度底图",
    note: "当前日期早于 Himawari 快速产品稳定覆盖时段，已回退到日尺度底图。",
  };
}

export async function enrichScenarioWithRemoteData(baseScenario) {
  const scenario = JSON.parse(JSON.stringify(baseScenario));
  const observation = new Date(scenario.observation.iso);
  const profile = scenario.imageryProfile;
  const visualSource = resolveVisualSource(scenario, observation);
  const displayUrl = buildGetMapUrl({
    layer: visualSource.layer,
    bbox: profile.bbox,
    width: profile.displayWidth,
    height: profile.displayHeight,
    time: visualSource.time,
    format: "image/jpeg",
    transparent: false,
  });

  const analysisWidth = 360;
  const analysisHeight = Math.round((analysisWidth * profile.displayHeight) / profile.displayWidth);
  const analysisUrl = buildGetMapUrl({
    layer: scenario.analysisProfile.layer,
    bbox: profile.bbox,
    width: analysisWidth,
    height: analysisHeight,
    time: dayString(observation),
    format: "image/png",
    transparent: true,
  });

  scenario.imagery = {
    src: displayUrl,
    aspectRatio: profile.aspectRatio,
    credit: "底图来源：NASA GIBS",
    sourceLabel: `${visualSource.label} · ${visualSource.cadenceNote}`,
    note: visualSource.note,
  };

  scenario.analysis = {
    sourceLabel: `${scenario.analysisProfile.label} + 连通域聚类`,
    summary: "正在基于官方气溶胶产品提取异常区域。",
    method: "高值阈值 + 连通域聚类",
    fallbackUsed: false,
    legendUrl: scenario.analysisProfile.legendUrl,
  };

  try {
    const analysisImage = await loadImageData(analysisUrl, analysisWidth, analysisHeight);
    const detected = buildRois(analysisImage.imageData, scenario);

    scenario.rois = detected.rois;
    scenario.anomalyDensity = detected.anomalyDensity;
    scenario.cloudCover = blendQuality(
      scenario.baseCloudCover,
      0.12 + Math.min(0.35, detected.rois.length * 0.06),
      0.28
    );
    scenario.radiometricQuality = blendQuality(
      scenario.baseRadiometricQuality,
      0.78 - scenario.cloudCover * 0.45,
      0.32
    );
    scenario.lowContrast =
      scenario.lowContrast || scenario.radiometricQuality < Math.max(0.56, scenario.baseRadiometricQuality - 0.06);
    scenario.analysis.summary = detected.summary;
    scenario.analysis.fallbackUsed = detected.fallbackUsed;
    scenario.observation.summary = `${visualSource.note} ${detected.summary}`;

    return scenario;
  } catch (error) {
    scenario.imagery = {
      ...scenario.imagery,
      sourceLabel: `${scenario.imagery.sourceLabel}（底图仍为官方图层）`,
    };
    scenario.analysis = {
      ...scenario.analysis,
      fallbackUsed: true,
      summary: `官方 AOD 图层加载失败，已回退到预置候选区。${error.message}`,
    };
    scenario.observation.summary = `${visualSource.note} 由于分析图层未正常返回，本次使用预置候选区继续演示。`;
    return scenario;
  }
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePoint(point) {
  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
  };
}

function makeRoiId(index) {
  return `ROI-${String(index).padStart(3, "0")}`;
}

function bboxBounds(pointA, pointB) {
  const a = normalizePoint(pointA);
  const b = normalizePoint(pointB);

  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

function boundsToBboxPoints(bounds) {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
}

function isLargeEnough(bounds) {
  return bounds.maxX - bounds.minX >= 0.02 && bounds.maxY - bounds.minY >= 0.02;
}

function buildBboxRoi(id, anchor, point) {
  const bounds = bboxBounds(anchor, point);
  return {
    id,
    type: "bbox",
    points: boundsToBboxPoints(bounds),
    bounds,
  };
}

function buildPolygonRoi(id, points) {
  return {
    id,
    type: "polygon",
    points: points.map(normalizePoint),
  };
}

function updateRoiById(rois, roiId, updater) {
  return rois.map((roi) => (roi.id === roiId ? updater(roi) : roi));
}

export function createDrawingState(mode = "bbox") {
  return {
    mode,
    rois: [],
    draft: null,
    selectedRoiId: null,
    nextId: 1,
  };
}

export function setDrawingMode(state, mode) {
  return {
    ...state,
    mode,
    draft: null,
  };
}

export function clearAllRois(state) {
  return {
    ...state,
    rois: [],
    draft: null,
    selectedRoiId: null,
    nextId: 1,
  };
}

export function beginBboxDraft(state, point) {
  if (state.mode !== "bbox") {
    return state;
  }

  const normalizedPoint = normalizePoint(point);
  return {
    ...state,
    draft: {
      type: "bbox",
      anchor: normalizedPoint,
      current: normalizedPoint,
    },
    selectedRoiId: null,
  };
}

export function updateBboxDraft(state, point) {
  if (state.draft?.type !== "bbox") {
    return state;
  }

  return {
    ...state,
    draft: {
      ...state.draft,
      current: normalizePoint(point),
    },
  };
}

export function commitBboxDraft(state, point) {
  if (state.draft?.type !== "bbox") {
    return {
      state,
      createdRoi: null,
    };
  }

  const roi = buildBboxRoi(makeRoiId(state.nextId), state.draft.anchor, point ?? state.draft.current);
  if (!isLargeEnough(roi.bounds)) {
    return {
      state: {
        ...state,
        draft: null,
      },
      createdRoi: null,
    };
  }

  return {
    state: {
      ...state,
      rois: [...state.rois, roi],
      draft: null,
      selectedRoiId: roi.id,
      nextId: state.nextId + 1,
    },
    createdRoi: roi,
  };
}

export function addPolygonVertex(state, point) {
  if (state.mode !== "polygon") {
    return state;
  }

  const normalizedPoint = normalizePoint(point);
  if (state.draft?.type === "polygon") {
    return {
      ...state,
      draft: {
        ...state.draft,
        points: [...state.draft.points, normalizedPoint],
      },
    };
  }

  return {
    ...state,
    draft: {
      type: "polygon",
      points: [normalizedPoint],
    },
    selectedRoiId: null,
  };
}

export function commitPolygonDraft(state) {
  if (state.draft?.type !== "polygon" || state.draft.points.length < 3) {
    return {
      state,
      createdRoi: null,
    };
  }

  const roi = buildPolygonRoi(makeRoiId(state.nextId), state.draft.points);
  return {
    state: {
      ...state,
      rois: [...state.rois, roi],
      draft: null,
      selectedRoiId: roi.id,
      nextId: state.nextId + 1,
    },
    createdRoi: roi,
  };
}

export function cancelDraft(state) {
  return {
    ...state,
    draft: null,
  };
}

export function selectRoi(state, roiId) {
  return {
    ...state,
    selectedRoiId: state.rois.some((roi) => roi.id === roiId) ? roiId : null,
  };
}

export function selectedRoi(state) {
  return state.rois.find((roi) => roi.id === state.selectedRoiId) ?? null;
}

export function moveVertex(state, roiId, vertexIndex, point) {
  const normalizedPoint = normalizePoint(point);
  const target = state.rois.find((roi) => roi.id === roiId);

  if (!target) {
    return state;
  }

  if (target.type === "bbox") {
    const oppositeByHandle = [2, 3, 0, 1];
    const oppositePoint = target.points[oppositeByHandle[vertexIndex]];
    const nextRoi = buildBboxRoi(target.id, oppositePoint, normalizedPoint);
    if (!isLargeEnough(nextRoi.bounds)) {
      return state;
    }

    return {
      ...state,
      rois: updateRoiById(state.rois, roiId, () => nextRoi),
    };
  }

  if (target.type === "polygon" && vertexIndex >= 0 && vertexIndex < target.points.length) {
    return {
      ...state,
      rois: updateRoiById(state.rois, roiId, (roi) => ({
        ...roi,
        points: roi.points.map((existingPoint, index) =>
          index === vertexIndex ? normalizedPoint : existingPoint
        ),
      })),
    };
  }

  return state;
}

export function deleteSelectedRoi(state) {
  if (!state.selectedRoiId) {
    return state;
  }

  return {
    ...state,
    rois: state.rois.filter((roi) => roi.id !== state.selectedRoiId),
    selectedRoiId: null,
  };
}

function viewportPointToLonLat(point, bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return [
    Number((minLon + (maxLon - minLon) * point.x).toFixed(6)),
    Number((maxLat - (maxLat - minLat) * point.y).toFixed(6)),
  ];
}

export function roiToFeature(roi, bbox, properties = {}) {
  const ring = [...roi.points, roi.points[0]].map((point) => viewportPointToLonLat(point, bbox));

  return {
    type: "Feature",
    properties: {
      id: roi.id,
      draw_type: roi.type,
      ...clone(properties),
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}

export function roiSummary(roi) {
  if (!roi) {
    return "当前没有选中 ROI。";
  }

  return roi.type === "bbox"
    ? `${roi.id} · 框选 ROI · ${roi.points.length} 个控制点`
    : `${roi.id} · 多边形 ROI · ${roi.points.length} 个顶点`;
}

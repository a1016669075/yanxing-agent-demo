export const benchmarkCatalogVersion = "2026.03.26-local";

export const benchmarkCatalog = [
  {
    id: "dust-reviewed-cases",
    taskId: "dust",
    label: "Dust reviewed cases",
    source: "Internal reviewed cases",
    sourceUrl: "",
    annotationType: "polygon-reviewed",
    sensors: ["NASA GIBS", "MODIS Terra AOD", "AERONET support"],
    coverage: "global",
    status: "seed-required",
    role: "atmospheric-anomaly-benchmark",
    note: "Seed an internal reviewed case library for dust plumes so end-to-end anomaly detection can be measured on consistent scenes.",
  },
  {
    id: "pollution-reviewed-cases",
    taskId: "pollution",
    label: "Pollution reviewed cases",
    source: "Internal reviewed cases",
    sourceUrl: "",
    annotationType: "polygon-reviewed",
    sensors: ["NASA GIBS", "MODIS Terra AOD", "AERONET and city stations"],
    coverage: "regional",
    status: "seed-required",
    role: "atmospheric-anomaly-benchmark",
    note: "Seed a reviewed case library for haze, pollution plumes, and mixed atmospheric anomalies to reduce false positives.",
  },
  {
    id: "wildfire-firms-viirs",
    taskId: "wildfire",
    label: "NASA FIRMS VIIRS hotspots",
    source: "NASA FIRMS",
    sourceUrl: "https://www.earthdata.nasa.gov/data/tools/firms",
    annotationType: "point-hotspot",
    sensors: ["VIIRS SNPP", "VIIRS NOAA-20/21"],
    coverage: "global",
    status: "ready",
    role: "operational-benchmark",
    note: "Ready-to-use hotspot benchmark for wildfire confirmation, cloud-over-fire false positives, and hotspot confidence checks.",
  },
  {
    id: "flood-sen1floods11",
    taskId: "flood",
    label: "Sen1Floods11 flood benchmark",
    source: "Cloud to Street",
    sourceUrl: "https://github.com/cloudtostreet/Sen1Floods11",
    annotationType: "water-mask",
    sensors: ["Sentinel-1", "Sentinel-2"],
    coverage: "global",
    status: "candidate",
    role: "segmentation-benchmark",
    note: "Candidate benchmark for flood segmentation and water-related anomaly validation once the flood workflow is connected end to end.",
  },
  {
    id: "building-damage-xbd",
    taskId: "building-damage",
    label: "xBD building damage benchmark",
    source: "xView2 / xBD",
    sourceUrl: "https://xview2.org/dataset",
    annotationType: "damage-level",
    sensors: ["VHR Optical"],
    coverage: "global",
    status: "candidate",
    role: "change-detection-benchmark",
    note: "Candidate benchmark for building-damage recognition, grading, and change-detection evaluation.",
  },
  {
    id: "landslide4sense",
    taskId: "landslide",
    label: "Landslide4Sense benchmark",
    source: "IARAI Landslide4Sense",
    sourceUrl: "https://github.com/iarai/Landslide4Sense-2022",
    annotationType: "landslide-mask",
    sensors: ["Sentinel-2", "DEM"],
    coverage: "global",
    status: "candidate",
    role: "segmentation-benchmark",
    note: "Candidate benchmark for landslide candidate detection and segmentation evaluation.",
  },
];

export function benchmarksForTask(taskId, catalog = benchmarkCatalog) {
  return catalog.filter((entry) => entry.taskId === taskId);
}

export function summarizeBenchmarkCatalog(catalog = benchmarkCatalog) {
  const tasks = new Set(catalog.map((entry) => entry.taskId));
  const sources = new Set(catalog.map((entry) => entry.source));

  return {
    version: benchmarkCatalogVersion,
    total: catalog.length,
    taskCount: tasks.size,
    sourceCount: sources.size,
    ready: catalog.filter((entry) => entry.status === "ready").length,
    candidate: catalog.filter((entry) => entry.status === "candidate").length,
    seedRequired: catalog.filter((entry) => entry.status === "seed-required").length,
  };
}

export function benchmarkCoverageForTask(taskId, catalog = benchmarkCatalog) {
  const relevant = benchmarksForTask(taskId, catalog);
  return {
    taskId,
    total: relevant.length,
    ready: relevant.filter((entry) => entry.status === "ready").length,
    candidate: relevant.filter((entry) => entry.status === "candidate").length,
    seedRequired: relevant.filter((entry) => entry.status === "seed-required").length,
    labels: relevant.map((entry) => entry.label),
  };
}

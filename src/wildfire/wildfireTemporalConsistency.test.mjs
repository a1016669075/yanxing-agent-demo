import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWildfireRequest } from "./request/normalizeRequest.mjs";
import { buildEvidenceFromFirmsPayload } from "./providers/firmsAreaIngestion.mjs";
import { runWildfireDiscovery } from "./discovery/hotspotDiscovery.mjs";
import { clusterHotspotsTimeAware } from "./clustering/timeAwareClustering.mjs";
import {
  buildProviderParityReport,
  buildWildfireMetrics,
  passesWildfireRegressionGate,
} from "./eval/temporalMetrics.mjs";

function buildRequest(config = {}) {
  return normalizeWildfireRequest(
    {
      imageryProfile: {
        bbox: [100, 19, 103, 22],
      },
    },
    new Date(config.anchorUtc || "2026-04-11T06:10:00.000Z"),
    {
      dayRange: config.dayRange || 1,
      products: config.products || ["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT"],
      includeLowConfidence: Boolean(config.includeLowConfidence),
    }
  );
}

function runPipeline(payload, config = {}) {
  const request = buildRequest(config);
  const ingestion = buildEvidenceFromFirmsPayload(payload, request);
  const discovery = runWildfireDiscovery(ingestion.detectionArchive, {
    bbox: request.bbox,
    temporalState: ingestion.temporalState,
  });
  const clusters = clusterHotspotsTimeAware(discovery, {
    bbox: request.bbox,
    temporalState: ingestion.temporalState,
  });
  return {
    request,
    ingestion,
    discovery,
    clusters,
  };
}

test("provider_parity_by_sensor_time", () => {
  const payload = {
    mode: "nrt",
    products: ["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT"],
    segments: [
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA21_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: [
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.1",
            longitude: "101.1",
            acq_date: "2026-04-11",
            acq_time: "0530",
            confidence: "h",
            frp: "18.4",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.11",
            longitude: "101.11",
            acq_date: "2026-04-11",
            acq_time: "0545",
            confidence: "n",
            frp: "12.0",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
        ],
      },
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA20_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: [
          {
            product: "VIIRS_NOAA20_NRT",
            latitude: "20.12",
            longitude: "101.09",
            acq_date: "2026-04-11",
            acq_time: "0550",
            confidence: "h",
            frp: "10.1",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J1",
          },
        ],
      },
    ],
  };

  const { ingestion } = runPipeline(payload);
  const report = buildProviderParityReport({
    segments: payload.segments,
    sensorStreams: ingestion.sensorStreams,
    rawArchive: ingestion.rawArchive,
  });

  assert.equal(report.provider_count_parity, 1);
  assert.equal(report.time_histogram_parity, 1);
  assert.equal(report.bySensor.length, 2);
});

test("temporal_scramble_test", () => {
  const baseRows = [
    {
      product: "VIIRS_NOAA21_NRT",
      latitude: "20.1",
      longitude: "101.1",
      acq_date: "2026-04-11",
      acq_time: "0530",
      confidence: "h",
      frp: "18.4",
      daynight: "D",
      scan: "0.4",
      track: "0.5",
      satellite: "J2",
    },
    {
      product: "VIIRS_NOAA21_NRT",
      latitude: "20.105",
      longitude: "101.105",
      acq_date: "2026-04-11",
      acq_time: "0542",
      confidence: "n",
      frp: "10.1",
      daynight: "D",
      scan: "0.4",
      track: "0.5",
      satellite: "J2",
    },
  ];

  const forward = runPipeline({
    mode: "nrt",
    products: ["VIIRS_NOAA21_NRT"],
    segments: [
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA21_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: baseRows,
      },
    ],
  });
  const reversed = runPipeline({
    mode: "nrt",
    products: ["VIIRS_NOAA21_NRT"],
    segments: [
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA21_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: baseRows.slice().reverse(),
      },
    ],
  });

  assert.equal(forward.clusters.length, 1);
  assert.equal(reversed.clusters.length, 1);
  assert.equal(forward.clusters[0].pointCount, reversed.clusters[0].pointCount);
  assert.equal(forward.clusters[0].eventScore, reversed.clusters[0].eventScore);
});

test("cross_sensor_leakage_test", () => {
  const { clusters } = runPipeline({
    mode: "nrt",
    products: ["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT"],
    segments: [
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA21_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: [
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.1",
            longitude: "101.1",
            acq_date: "2026-04-11",
            acq_time: "0500",
            confidence: "h",
            frp: "18.4",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
        ],
      },
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA20_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: [
          {
            product: "VIIRS_NOAA20_NRT",
            latitude: "20.101",
            longitude: "101.101",
            acq_date: "2026-04-11",
            acq_time: "0830",
            confidence: "h",
            frp: "16.2",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J1",
          },
        ],
      },
    ],
  }, { anchorUtc: "2026-04-11T08:30:00.000Z" });

  assert.equal(clusters.length, 2);
});

test("stale_context_non_interference_test", () => {
  const { ingestion, clusters } = runPipeline({
    mode: "nrt",
    products: ["VIIRS_NOAA21_NRT"],
    segments: [
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA21_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: [
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.1",
            longitude: "101.1",
            acq_date: "2026-04-11",
            acq_time: "1000",
            confidence: "h",
            frp: "18.4",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.101",
            longitude: "101.101",
            acq_date: "2026-04-11",
            acq_time: "0030",
            confidence: "h",
            frp: "12.0",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
        ],
      },
    ],
  }, { anchorUtc: "2026-04-11T10:00:00.000Z" });

  assert.equal(ingestion.rawArchive.length, 2);
  assert.equal(ingestion.detectionArchive.length, 1);
  assert.equal(ingestion.rawArchive.filter((item) => item.temporal_class === "T2").length, 1);
  assert.equal(clusters.length, 1);
});

test("cluster_temporal_span_audit", () => {
  const { clusters } = runPipeline({
    mode: "nrt",
    products: ["VIIRS_NOAA21_NRT"],
    segments: [
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA21_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: [
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.1",
            longitude: "101.1",
            acq_date: "2026-04-11",
            acq_time: "0000",
            confidence: "h",
            frp: "18.4",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.101",
            longitude: "101.101",
            acq_date: "2026-04-11",
            acq_time: "0300",
            confidence: "n",
            frp: "12.0",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.102",
            longitude: "101.102",
            acq_date: "2026-04-11",
            acq_time: "0600",
            confidence: "h",
            frp: "16.5",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
        ],
      },
    ],
  }, { anchorUtc: "2026-04-11T06:00:00.000Z" });

  assert.ok(clusters.every((cluster) => cluster.temporalSpanMin <= 360));
});

test("wildfire_regression_gate", () => {
  const payload = {
    mode: "nrt",
    products: ["VIIRS_NOAA21_NRT"],
    segments: [
      {
        sliceId: "window-1d",
        product: "VIIRS_NOAA21_NRT",
        apiDayRange: 1,
        date: "2026-04-11",
        requestedWindowDays: 1,
        rows: [
          {
            product: "VIIRS_NOAA21_NRT",
            latitude: "20.1",
            longitude: "101.1",
            acq_date: "2026-04-11",
            acq_time: "0530",
            confidence: "h",
            frp: "18.4",
            daynight: "D",
            scan: "0.4",
            track: "0.5",
            satellite: "J2",
          },
        ],
      },
    ],
  };
  const { request, ingestion, clusters } = runPipeline(payload);
  const providerParityReport = buildProviderParityReport({
    segments: payload.segments,
    sensorStreams: ingestion.sensorStreams,
    rawArchive: ingestion.rawArchive,
  });
  const metrics = buildWildfireMetrics({
    request: {
      ...request,
      temporalState: ingestion.temporalState,
    },
    rawArchive: ingestion.rawArchive,
    detectionArchive: ingestion.detectionArchive,
    clusters,
    providerParityReport,
  });

  assert.equal(passesWildfireRegressionGate(metrics), true);
  assert.equal(
    passesWildfireRegressionGate({
      ...metrics,
      provider_count_parity: 0.7,
    }),
    false
  );
});

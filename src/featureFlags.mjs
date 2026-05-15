export const FEATURE_FLAGS_KEY = "sat-atmo-agent-feature-flags";

export const defaultFeatureFlags = {
  agenticEvidencePlanner: false,
};

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeFeatureFlags(flags = {}) {
  const source = flags && typeof flags === "object" ? flags : {};
  return {
    agenticEvidencePlanner: normalizeBoolean(
      source.agenticEvidencePlanner,
      defaultFeatureFlags.agenticEvidencePlanner
    ),
  };
}

export function setFeatureFlag(flags = {}, key, value) {
  return {
    ...normalizeFeatureFlags(flags),
    [key]: Boolean(value),
  };
}

export function isFeatureEnabled(flags = {}, key) {
  return Boolean(normalizeFeatureFlags(flags)[key]);
}

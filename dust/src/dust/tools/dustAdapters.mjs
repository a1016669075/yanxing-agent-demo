export const dustAdapterStatus = {
  DustMambaAdapter: {
    toolId: "dust_mamba_adapter",
    status: "blocked",
    reason: "Dust-Mamba and LSDSSIMR were shallow-cloned for audit, but checkpoint files and LSDSSIMR HDF5 inputs are not local",
  },
  VIIRSSandstormSegmentationAdapter: {
    toolId: "viirs_sandstorm_segmentation_adapter",
    status: "research_reference",
    reason: "Element84 article provides semantic-segmentation UI pattern; no public code or weights were found",
  },
  MODISEnsembleDustAdapter: {
    toolId: "modis_ensemble_dust_adapter",
    status: "research_reference",
    reason: "repository documents MODIS RGB segmentation and Kaggle data; no local inference assets are present",
  },
  MODIS3DCNNDustAdapter: {
    toolId: "modis_3dcnn_dust_adapter",
    status: "checkpoint_available_but_data_missing",
    reason: "local checkpoint is present, but the processed .npy MODIS case folder required by the repository scripts is missing",
  },
  SmokePlumeConfounderAdapter: {
    toolId: "smoke_plume_confounder_adapter",
    status: "research_reference",
    reason: "smoke plume segmentation is a confounder check, not dust inference",
  },
  SmokeVizEvidenceAdapter: {
    toolId: "smokeviz_evidence_adapter",
    status: "research_reference",
    reason: "use only for temporal alignment and smoke-like plume evidence practice",
  },
  BurnedAreaTemporalAdapter: {
    toolId: "burned_area_temporal_adapter",
    status: "research_reference",
    reason: "burned-area evidence can reject fire/burn-scar confusion but is not dust detection",
  },
  ActiveFireConfounderAdapter: {
    toolId: "active_fire_confounder_adapter",
    status: "research_reference",
    reason: "active-fire segmentation can weaken dust interpretation when fire source is present",
  },
  FLOGAAlignmentConfounderAdapter: {
    toolId: "floga_alignment_confounder_adapter",
    status: "research_reference",
    reason: "use only for multi-source alignment and burned-scar conflict evidence, not dust inference",
  },
  Sentinel2UNetBurnedAreaVisualReference: {
    toolId: "sentinel2_unet_burned_area_visual_reference",
    status: "research_reference",
    reason: "use only for mask rendering and postprocess reference",
  },
  Sentinel2PSPNetBurnedAreaVisualReference: {
    toolId: "sentinel2_pspnet_burned_area_visual_reference",
    status: "research_reference",
    reason: "use only for segmentation workflow reference",
  },
};

export function buildDemoDustMaskOutput(example) {
  return {
    ...example,
    provenance: {
      ...example.provenance,
      run_time: "not run",
      limitations: [...new Set([...(example.provenance?.limitations || []), "demo visualization", "not model inference"])],
    },
  };
}

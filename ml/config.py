from pathlib import Path

GIBS_WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "ml" / "data"
RAW_ROOT = DATA_ROOT / "raw"
CHECKPOINT_ROOT = PROJECT_ROOT / "ml" / "checkpoints"
DEFAULT_CHECKPOINT = CHECKPOINT_ROOT / "aod_inversion_unet.pt"

TRUE_COLOR_LAYERS = [
    "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
    "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    "MODIS_Terra_CorrectedReflectance_TrueColor",
]

AOD_LAYER = "MODIS_Terra_Aerosol_Optical_Depth_3km"

SCENE_CONFIGS = {
    "dust-frontier": {
        "bbox": [86.0, 35.5, 104.0, 45.5],
        "prefix": "沙尘异常簇",
        "percentile": 0.86,
        "max_rois": 4,
        "min_component_pixels": 72,
    },
    "urban-plume": {
        "bbox": [110.2, 20.4, 117.6, 25.6],
        "prefix": "污染异常簇",
        "percentile": 0.83,
        "max_rois": 4,
        "min_component_pixels": 60,
    },
    "twilight-edge": {
        "bbox": [112.2, 34.4, 121.2, 41.2],
        "prefix": "复合异常簇",
        "percentile": 0.81,
        "max_rois": 3,
        "min_component_pixels": 52,
    },
}

IMAGE_SIZE = 256

from __future__ import annotations

from functools import lru_cache
from io import BytesIO

import numpy as np
import requests
from PIL import Image

from ml.config import SCENE_CONFIGS

LEGEND_URL = "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.png"


@lru_cache(maxsize=1)
def load_palette() -> np.ndarray:
    response = requests.get(LEGEND_URL, timeout=30)
    response.raise_for_status()
    image = Image.open(BytesIO(response.content)).convert("RGBA")
    rgba = np.asarray(image, dtype=np.uint8)

    # The color ramp occupies the longest colorful opaque run in the legend.
    row_index = 34
    start = 32
    end = 389
    palette = rgba[row_index, start : end + 1, :3].astype(np.float32) / 255.0
    return palette


def aod_rgba_to_intensity(aod_image: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    rgba = np.asarray(aod_image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[..., 3]
    valid_mask = (alpha > 8).astype(np.float32)

    if not np.any(valid_mask):
        shape = alpha.shape
        return np.zeros(shape, dtype=np.float32), np.zeros(shape, dtype=np.float32)

    palette = load_palette()
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    flat_rgb = rgb.reshape(-1, 3)
    distances = np.sum((flat_rgb[:, None, :] - palette[None, :, :]) ** 2, axis=2)
    nearest = np.argmin(distances, axis=1).astype(np.float32)
    intensity = (nearest / max(1, len(palette) - 1)).reshape(alpha.shape)
    intensity *= valid_mask
    return intensity.astype(np.float32), valid_mask.astype(np.float32)


def intensity_to_mask(intensity: np.ndarray, valid_mask: np.ndarray, scene_id: str) -> np.ndarray:
    valid = valid_mask > 0.5
    if not np.any(valid):
        return np.zeros_like(intensity, dtype=np.float32)

    percentile = SCENE_CONFIGS[scene_id]["percentile"]
    threshold = np.quantile(intensity[valid], percentile)
    mask = np.zeros_like(intensity, dtype=np.float32)
    mask[np.logical_and(valid, intensity >= threshold)] = 1.0
    return mask

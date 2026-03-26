from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from pathlib import Path
import time
from typing import Iterable
from urllib.parse import urlencode

import requests
from PIL import Image

from ml.config import AOD_LAYER, GIBS_WMS_URL, RAW_ROOT, SCENE_CONFIGS, TRUE_COLOR_LAYERS


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def day_string(value: date | datetime | str) -> str:
    if isinstance(value, str):
        return value
    return value.strftime("%Y-%m-%d")


def build_getmap_url(
    *,
    layer: str,
    bbox: Iterable[float],
    width: int,
    height: int,
    time_value: str,
    fmt: str,
    transparent: bool,
) -> str:
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": layer,
        "STYLES": "",
        "FORMAT": fmt,
        "TRANSPARENT": "TRUE" if transparent else "FALSE",
        "SRS": "EPSG:4326",
        "WIDTH": str(width),
        "HEIGHT": str(height),
        "BBOX": ",".join(str(item) for item in bbox),
        "TIME": time_value,
    }
    return f"{GIBS_WMS_URL}?{urlencode(params)}"


def cache_path(scene_id: str, day: str, kind: str, ext: str) -> Path:
    root = RAW_ROOT / scene_id / day
    ensure_dir(root)
    return root / f"{kind}.{ext}"


def fetch_image(url: str, *, timeout: int = 90, retries: int = 4) -> Image.Image:
    last_error: Exception | None = None

    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content))
            image.load()
            return image
        except Exception as error:  # noqa: BLE001
            last_error = error
            if attempt < retries - 1:
                time.sleep(1.2 * (attempt + 1))

    raise RuntimeError(f"download failed after {retries} attempts: {last_error}") from last_error


def fetch_true_color(scene_id: str, day: str, width: int = 256, height: int = 256) -> tuple[Image.Image, str]:
    scene = SCENE_CONFIGS[scene_id]
    last_error: Exception | None = None
    for layer in TRUE_COLOR_LAYERS:
        url = build_getmap_url(
            layer=layer,
            bbox=scene["bbox"],
            width=width,
            height=height,
            time_value=day,
            fmt="image/jpeg",
            transparent=False,
        )
        try:
            return fetch_image(url).convert("RGB"), layer
        except Exception as error:  # noqa: BLE001
            last_error = error

    raise RuntimeError(f"无法获取 {scene_id} 的真彩色底图: {last_error}") from last_error


def fetch_aod(scene_id: str, day: str, width: int = 256, height: int = 256) -> Image.Image:
    scene = SCENE_CONFIGS[scene_id]
    url = build_getmap_url(
        layer=AOD_LAYER,
        bbox=scene["bbox"],
        width=width,
        height=height,
        time_value=day,
        fmt="image/png",
        transparent=True,
    )
    return fetch_image(url).convert("RGBA")


def ensure_scene_pair(scene_id: str, day: str, width: int = 256, height: int = 256) -> dict[str, str]:
    rgb_path = cache_path(scene_id, day, "rgb", "jpg")
    aod_path = cache_path(scene_id, day, "aod", "png")
    meta_path = cache_path(scene_id, day, "meta", "txt")

    if not rgb_path.exists():
        rgb_image, layer = fetch_true_color(scene_id, day, width=width, height=height)
        rgb_image.save(rgb_path, quality=92)
        meta_path.write_text(f"true_color_layer={layer}\n", encoding="utf-8")

    if not aod_path.exists():
        fetch_aod(scene_id, day, width=width, height=height).save(aod_path)

    return {
        "scene_id": scene_id,
        "day": day,
        "rgb_path": str(rgb_path),
        "aod_path": str(aod_path),
        "meta_path": str(meta_path),
    }

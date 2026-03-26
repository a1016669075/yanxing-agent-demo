from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset

from ml.config import IMAGE_SIZE
from ml.gibs import ensure_scene_pair
from ml.targets import aod_rgba_to_intensity, intensity_to_mask


def daterange(start_day: str, end_day: str) -> Iterable[str]:
    current = datetime.strptime(start_day, "%Y-%m-%d").date()
    end = datetime.strptime(end_day, "%Y-%m-%d").date()
    while current <= end:
        yield current.strftime("%Y-%m-%d")
        current += timedelta(days=1)


@dataclass
class SampleItem:
    scene_id: str
    day: str
    rgb_path: Path
    aod_path: Path


def apply_spatial_augments(
    rgb: np.ndarray,
    intensity: np.ndarray,
    mask: np.ndarray,
    valid_mask: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    if np.random.rand() < 0.5:
        rgb = np.flip(rgb, axis=1).copy()
        intensity = np.flip(intensity, axis=1).copy()
        mask = np.flip(mask, axis=1).copy()
        valid_mask = np.flip(valid_mask, axis=1).copy()

    if np.random.rand() < 0.35:
        rgb = np.flip(rgb, axis=0).copy()
        intensity = np.flip(intensity, axis=0).copy()
        mask = np.flip(mask, axis=0).copy()
        valid_mask = np.flip(valid_mask, axis=0).copy()

    if np.random.rand() < 0.6:
        turns = int(np.random.randint(0, 4))
        rgb = np.rot90(rgb, turns).copy()
        intensity = np.rot90(intensity, turns).copy()
        mask = np.rot90(mask, turns).copy()
        valid_mask = np.rot90(valid_mask, turns).copy()

    return rgb, intensity, mask, valid_mask


class SceneAODDataset(Dataset):
    def __init__(
        self,
        samples: list[SampleItem],
        *,
        image_size: int = IMAGE_SIZE,
        augment: bool = False,
    ) -> None:
        self.samples = samples
        self.image_size = image_size
        self.augment = augment

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor | str]:
        sample = self.samples[index]
        rgb = (
            Image.open(sample.rgb_path)
            .convert("RGB")
            .resize((self.image_size, self.image_size), Image.Resampling.BILINEAR)
        )
        aod = (
            Image.open(sample.aod_path)
            .convert("RGBA")
            .resize((self.image_size, self.image_size), Image.Resampling.NEAREST)
        )

        rgb_np = np.asarray(rgb, dtype=np.float32) / 255.0
        intensity_np, valid_mask_np = aod_rgba_to_intensity(aod)
        mask_np = intensity_to_mask(intensity_np, valid_mask_np, sample.scene_id)

        if self.augment:
            rgb_np, intensity_np, mask_np, valid_mask_np = apply_spatial_augments(
                rgb_np, intensity_np, mask_np, valid_mask_np
            )

        image = torch.from_numpy(np.transpose(rgb_np, (2, 0, 1))).float()
        target_intensity = torch.from_numpy(intensity_np[None, ...]).float()
        target_mask = torch.from_numpy(mask_np[None, ...]).float()
        valid_mask = torch.from_numpy(valid_mask_np[None, ...]).float()

        return {
            "image": image,
            "target_intensity": target_intensity,
            "target_mask": target_mask,
            "valid_mask": valid_mask,
            "scene_id": sample.scene_id,
            "day": sample.day,
        }


def build_samples(
    *,
    start_day: str,
    end_day: str,
    scenes: Iterable[str],
    width: int = IMAGE_SIZE,
    height: int = IMAGE_SIZE,
) -> list[SampleItem]:
    items: list[SampleItem] = []

    for day in daterange(start_day, end_day):
        for scene_id in scenes:
            try:
                pair = ensure_scene_pair(scene_id, day, width=width, height=height)
            except Exception as error:  # noqa: BLE001
                print(f"[skip] {scene_id} {day}: {error}")
                continue

            items.append(
                SampleItem(
                    scene_id=scene_id,
                    day=day,
                    rgb_path=Path(pair["rgb_path"]),
                    aod_path=Path(pair["aod_path"]),
                )
            )

    return items

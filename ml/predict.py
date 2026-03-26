from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image

from ml.config import DEFAULT_CHECKPOINT, IMAGE_SIZE, SCENE_CONFIGS
from ml.gibs import ensure_scene_pair
from ml.model import AODInversionNet


def load_model(checkpoint_path: Path, device: torch.device) -> tuple[AODInversionNet, dict[str, Any]]:
    payload = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model = AODInversionNet(pretrained=False).to(device)
    model.load_state_dict(payload["model_state"])
    model.eval()
    return model, payload.get("meta", {})


def close_mask(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    dilated = np.zeros_like(mask, dtype=np.uint8)
    closed = np.zeros_like(mask, dtype=np.uint8)

    for y in range(height):
        for x in range(width):
            active = 0
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    if mask[ny, nx]:
                        active = 1
            dilated[y, x] = active

    for y in range(height):
        for x in range(width):
            neighbors = 0
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbors += int(dilated[ny, nx])
            closed[y, x] = 1 if neighbors >= 4 else 0

    return closed


def extract_components(mask: np.ndarray, score_map: np.ndarray, scene_id: str) -> list[dict[str, Any]]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=np.uint8)
    components: list[dict[str, Any]] = []
    scene_cfg = SCENE_CONFIGS[scene_id]

    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue

            queue = [(x, y)]
            visited[y, x] = 1
            head = 0
            pixels = 0
            score_sum = 0.0
            min_x = width
            min_y = height
            max_x = 0
            max_y = 0

            while head < len(queue):
                cx, cy = queue[head]
                head += 1
                pixels += 1
                score_sum += float(score_map[cy, cx])
                min_x = min(min_x, cx)
                min_y = min(min_y, cy)
                max_x = max(max_x, cx)
                max_y = max(max_y, cy)

                for ny in range(max(0, cy - 1), min(height, cy + 2)):
                    for nx in range(max(0, cx - 1), min(width, cx + 2)):
                        if mask[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = 1
                            queue.append((nx, ny))

            if pixels < scene_cfg["min_component_pixels"]:
                continue

            mean_score = score_sum / max(1, pixels)
            components.append(
                {
                    "pixels": pixels,
                    "mean_score": mean_score,
                    "min_x": min_x,
                    "min_y": min_y,
                    "max_x": max_x,
                    "max_y": max_y,
                    "score": mean_score * (1.0 + np.log(pixels + 1.0)),
                }
            )

    components.sort(key=lambda item: item["score"], reverse=True)
    return components[: scene_cfg["max_rois"]]


def component_to_roi(component: dict[str, Any], scene_id: str, index: int) -> dict[str, Any]:
    scene_cfg = SCENE_CONFIGS[scene_id]
    width = IMAGE_SIZE
    height = IMAGE_SIZE
    mean_score = float(component["mean_score"])
    left = round(component["min_x"] / width * 100.0, 2)
    top = round(component["min_y"] / height * 100.0, 2)
    box_width = round((component["max_x"] - component["min_x"] + 1) / width * 100.0, 2)
    box_height = round((component["max_y"] - component["min_y"] + 1) / height * 100.0, 2)
    risk = min(0.99, 0.46 + mean_score * 0.46)
    signal = min(0.98, 0.34 + mean_score * 0.58)

    return {
        "id": f"R{index + 1}",
        "name": f"{scene_cfg['prefix']}{index + 1}",
        "risk": round(risk, 3),
        "signal": round(signal, 3),
        "cloud": round(max(0.05, 0.26 - mean_score * 0.16), 3),
        "area": int(component["pixels"]),
        "box": {
            "left": left,
            "top": top,
            "width": max(10.0, min(55.0, box_width)),
            "height": max(10.0, min(55.0, box_height)),
        },
    }


def hotspot_components(score_map: np.ndarray, scene_id: str) -> list[dict[str, Any]]:
    height, width = score_map.shape
    scene_cfg = SCENE_CONFIGS[scene_id]
    window_w = max(28, width // 5)
    window_h = max(28, height // 5)
    step_x = max(12, window_w // 2)
    step_y = max(12, window_h // 2)
    candidates: list[dict[str, Any]] = []

    for top in range(0, max(1, height - window_h + 1), step_y):
        for left in range(0, max(1, width - window_w + 1), step_x):
            window = score_map[top : top + window_h, left : left + window_w]
            mean_score = float(window.mean())
            peak_score = float(window.max())
            score = mean_score * 0.65 + peak_score * 0.35
            candidates.append(
                {
                    "pixels": int(window_w * window_h),
                    "mean_score": score,
                    "min_x": left,
                    "min_y": top,
                    "max_x": min(width - 1, left + window_w - 1),
                    "max_y": min(height - 1, top + window_h - 1),
                    "score": score,
                }
            )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected: list[dict[str, Any]] = []
    for candidate in candidates:
        overlaps = False
        for existing in selected:
            x_overlap = max(
                0,
                min(candidate["max_x"], existing["max_x"]) - max(candidate["min_x"], existing["min_x"]),
            )
            y_overlap = max(
                0,
                min(candidate["max_y"], existing["max_y"]) - max(candidate["min_y"], existing["min_y"]),
            )
            overlap_area = x_overlap * y_overlap
            if overlap_area > 0.35 * min(candidate["pixels"], existing["pixels"]):
                overlaps = True
                break
        if overlaps:
            continue
        selected.append(candidate)
        if len(selected) >= scene_cfg["max_rois"]:
            break
    return selected


def select_mask(score_map: np.ndarray, scene_id: str, base_threshold: float) -> tuple[np.ndarray, float]:
    scene_percentile = max(0.78, SCENE_CONFIGS[scene_id]["percentile"] - 0.02)
    adaptive_threshold = float(np.quantile(score_map, scene_percentile))
    threshold = max(base_threshold, adaptive_threshold)

    for _ in range(6):
        candidate = close_mask((score_map >= threshold).astype(np.uint8))
        components = extract_components(candidate, score_map, scene_id)
        if not components:
            threshold = max(base_threshold, threshold - 0.02)
            continue

        largest_ratio = components[0]["pixels"] / float(score_map.shape[0] * score_map.shape[1])
        if largest_ratio <= 0.28:
            return candidate, threshold
        threshold += 0.035

    final_mask = close_mask((score_map >= threshold).astype(np.uint8))
    return final_mask, threshold


def predict_scene(
    scene_id: str,
    day: str,
    *,
    checkpoint: Path = DEFAULT_CHECKPOINT,
    device: torch.device | None = None,
    threshold: float = 0.44,
) -> dict[str, Any]:
    resolved_device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, meta = load_model(checkpoint, resolved_device)
    return predict_scene_with_loaded_model(
        scene_id,
        day,
        model=model,
        meta=meta,
        device=resolved_device,
        checkpoint=checkpoint,
        threshold=threshold,
    )


def predict_scene_with_loaded_model(
    scene_id: str,
    day: str,
    *,
    model: AODInversionNet,
    meta: dict[str, Any],
    device: torch.device,
    checkpoint: Path = DEFAULT_CHECKPOINT,
    threshold: float = 0.44,
) -> dict[str, Any]:
    pair = ensure_scene_pair(scene_id, day, width=IMAGE_SIZE, height=IMAGE_SIZE)

    rgb = (
        Image.open(pair["rgb_path"])
        .convert("RGB")
        .resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.BILINEAR)
    )
    rgb_np = np.asarray(rgb, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(np.transpose(rgb_np, (2, 0, 1))).unsqueeze(0).to(device)

    with torch.inference_mode():
        outputs = model(tensor)
        intensity = outputs["intensity"].squeeze().cpu().numpy()
        mask_probs = torch.sigmoid(outputs["mask_logits"]).squeeze().cpu().numpy()

    score_map = 0.68 * intensity + 0.32 * mask_probs
    mask, final_threshold = select_mask(score_map, scene_id, threshold)
    components = extract_components(mask, score_map, scene_id)
    if components:
        largest_ratio = components[0]["pixels"] / float(score_map.shape[0] * score_map.shape[1])
        box_width = components[0]["max_x"] - components[0]["min_x"] + 1
        box_height = components[0]["max_y"] - components[0]["min_y"] + 1
        if largest_ratio > 0.15 or box_width > score_map.shape[1] * 0.4 or box_height > score_map.shape[0] * 0.4:
            components = hotspot_components(score_map, scene_id)
    elif float(score_map.max()) > final_threshold:
        components = hotspot_components(score_map, scene_id)
    rois = [component_to_roi(component, scene_id, index) for index, component in enumerate(components)]
    anomaly_density = float(np.mean(score_map))

    payload = {
        "scene": scene_id,
        "date": day,
        "device": str(device),
        "model": {
            "checkpoint": str(checkpoint),
            "architecture": meta.get("architecture"),
            "best_score": meta.get("best_score"),
            "best_val_iou": meta.get("best_val_iou"),
            "best_val_mae": meta.get("best_val_mae"),
            "train_start": meta.get("start_date"),
            "train_end": meta.get("end_date"),
        },
        "rois": rois,
        "anomaly_density": round(min(0.95, max(0.18, anomaly_density * 1.45)), 3),
        "summary": f"本地连续反演模型在 {day} 识别到 {len(rois)} 个高值异常候选区。",
        "fallback_used": len(rois) == 0,
        "threshold": round(final_threshold, 3),
    }
    return payload

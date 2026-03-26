from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
import sys

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

import torch
from torch import nn
from torch.utils.data import DataLoader

from ml.config import CHECKPOINT_ROOT, DEFAULT_CHECKPOINT, IMAGE_SIZE, SCENE_CONFIGS
from ml.data import SceneAODDataset, build_samples
from ml.model import AODInversionNet


def masked_mean(values: torch.Tensor, valid_mask: torch.Tensor) -> torch.Tensor:
    valid = valid_mask.sum().clamp_min(1.0)
    return (values * valid_mask).sum() / valid


def masked_dice_loss(
    logits: torch.Tensor,
    targets: torch.Tensor,
    valid_mask: torch.Tensor,
    smooth: float = 1.0,
) -> torch.Tensor:
    probs = torch.sigmoid(logits) * valid_mask
    targets = targets * valid_mask
    intersection = torch.sum(probs * targets, dim=(1, 2, 3))
    total = torch.sum(probs, dim=(1, 2, 3)) + torch.sum(targets, dim=(1, 2, 3))
    dice = (2.0 * intersection + smooth) / (total + smooth)
    return 1.0 - dice.mean()


def masked_bce_loss(
    logits: torch.Tensor,
    targets: torch.Tensor,
    valid_mask: torch.Tensor,
) -> torch.Tensor:
    positive = (targets * valid_mask).sum()
    total = valid_mask.sum().clamp_min(1.0)
    positive_ratio = torch.clamp(positive / total, min=1e-4, max=1 - 1e-4)
    pos_weight = ((1 - positive_ratio) / positive_ratio).detach()
    loss = torch.nn.functional.binary_cross_entropy_with_logits(
        logits,
        targets,
        reduction="none",
        pos_weight=pos_weight,
    )
    return masked_mean(loss, valid_mask)


def masked_regression_loss(
    preds: torch.Tensor,
    targets: torch.Tensor,
    valid_mask: torch.Tensor,
) -> torch.Tensor:
    loss = torch.nn.functional.smooth_l1_loss(preds, targets, reduction="none")
    return masked_mean(loss, valid_mask)


def batch_iou(
    logits: torch.Tensor,
    targets: torch.Tensor,
    valid_mask: torch.Tensor,
    threshold: float = 0.5,
) -> float:
    probs = torch.sigmoid(logits)
    preds = (probs >= threshold).float() * valid_mask
    targets = targets * valid_mask
    intersection = torch.sum(preds * targets, dim=(1, 2, 3))
    union = torch.sum(((preds + targets) > 0).float() * valid_mask, dim=(1, 2, 3))
    valid = union > 0
    if not torch.any(valid):
        return 0.0
    return float((intersection[valid] / union[valid]).mean().item())


def batch_mae(preds: torch.Tensor, targets: torch.Tensor, valid_mask: torch.Tensor) -> float:
    diff = torch.abs(preds - targets)
    score = masked_mean(diff, valid_mask)
    return float(score.item())


def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> dict[str, float]:
    model.train()
    total_loss = 0.0
    total_iou = 0.0
    total_mae = 0.0
    batches = 0

    for batch in loader:
        images = batch["image"].to(device)
        target_intensity = batch["target_intensity"].to(device)
        target_mask = batch["target_mask"].to(device)
        valid_mask = batch["valid_mask"].to(device)

        outputs = model(images)
        intensity_loss = masked_regression_loss(outputs["intensity"], target_intensity, valid_mask)
        mask_bce = masked_bce_loss(outputs["mask_logits"], target_mask, valid_mask)
        mask_dice = masked_dice_loss(outputs["mask_logits"], target_mask, valid_mask)
        loss = 0.45 * intensity_loss + 0.35 * mask_bce + 0.20 * mask_dice

        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()

        total_loss += float(loss.item())
        total_iou += batch_iou(outputs["mask_logits"].detach(), target_mask, valid_mask)
        total_mae += batch_mae(outputs["intensity"].detach(), target_intensity, valid_mask)
        batches += 1

    return {
        "loss": total_loss / max(1, batches),
        "iou": total_iou / max(1, batches),
        "mae": total_mae / max(1, batches),
    }


@torch.inference_mode()
def eval_epoch(model: nn.Module, loader: DataLoader, device: torch.device) -> dict[str, float]:
    model.eval()
    total_loss = 0.0
    total_iou = 0.0
    total_mae = 0.0
    batches = 0

    for batch in loader:
        images = batch["image"].to(device)
        target_intensity = batch["target_intensity"].to(device)
        target_mask = batch["target_mask"].to(device)
        valid_mask = batch["valid_mask"].to(device)

        outputs = model(images)
        intensity_loss = masked_regression_loss(outputs["intensity"], target_intensity, valid_mask)
        mask_bce = masked_bce_loss(outputs["mask_logits"], target_mask, valid_mask)
        mask_dice = masked_dice_loss(outputs["mask_logits"], target_mask, valid_mask)
        loss = 0.45 * intensity_loss + 0.35 * mask_bce + 0.20 * mask_dice

        total_loss += float(loss.item())
        total_iou += batch_iou(outputs["mask_logits"], target_mask, valid_mask)
        total_mae += batch_mae(outputs["intensity"], target_intensity, valid_mask)
        batches += 1

    return {
        "loss": total_loss / max(1, batches),
        "iou": total_iou / max(1, batches),
        "mae": total_mae / max(1, batches),
    }


def split_samples(samples: list, val_ratio: float, seed: int) -> tuple[list, list]:
    shuffled = list(samples)
    rng = random.Random(seed)
    rng.shuffle(shuffled)

    val_size = max(1, int(len(shuffled) * val_ratio))
    train_size = max(1, len(shuffled) - val_size)
    train_samples = shuffled[:train_size]
    val_samples = shuffled[train_size:]

    if not val_samples:
        val_samples = train_samples[-1:]
        train_samples = train_samples[:-1]

    return train_samples, val_samples


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the continuous aerosol inversion network.")
    parser.add_argument("--start-date", default="2026-01-01")
    parser.add_argument("--end-date", default="2026-03-22")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=6)
    parser.add_argument("--image-size", type=int, default=IMAGE_SIZE)
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument(
        "--scenes",
        nargs="*",
        default=list(SCENE_CONFIGS.keys()),
        choices=list(SCENE_CONFIGS.keys()),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    CHECKPOINT_ROOT.mkdir(parents=True, exist_ok=True)

    print("Building training samples...")
    samples = build_samples(
        start_day=args.start_date,
        end_day=args.end_date,
        scenes=args.scenes,
        width=args.image_size,
        height=args.image_size,
    )
    train_samples, val_samples = split_samples(samples, args.val_ratio, args.seed)
    train_set = SceneAODDataset(train_samples, image_size=args.image_size, augment=True)
    val_set = SceneAODDataset(val_samples, image_size=args.image_size, augment=False)

    train_loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_set, batch_size=args.batch_size, shuffle=False, num_workers=0)

    model = AODInversionNet(pretrained=True).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)

    best_score = float("-inf")
    history: list[dict[str, float]] = []

    for epoch in range(1, args.epochs + 1):
        train_metrics = train_epoch(model, train_loader, optimizer, device)
        val_metrics = eval_epoch(model, val_loader, device)
        record = {
            "epoch": epoch,
            "train_loss": train_metrics["loss"],
            "train_iou": train_metrics["iou"],
            "train_mae": train_metrics["mae"],
            "val_loss": val_metrics["loss"],
            "val_iou": val_metrics["iou"],
            "val_mae": val_metrics["mae"],
        }
        history.append(record)
        print(
            f"epoch={epoch} "
            f"train_loss={record['train_loss']:.4f} train_iou={record['train_iou']:.4f} train_mae={record['train_mae']:.4f} "
            f"val_loss={record['val_loss']:.4f} val_iou={record['val_iou']:.4f} val_mae={record['val_mae']:.4f}"
        )

        score = record["val_iou"] - 0.35 * record["val_mae"]
        if score > best_score:
            best_score = score
            payload = {
                "model_state": model.state_dict(),
                "meta": {
                    "architecture": "resnet18_fpn_multitask",
                    "start_date": args.start_date,
                    "end_date": args.end_date,
                    "scenes": args.scenes,
                    "image_size": args.image_size,
                    "best_score": best_score,
                    "best_val_iou": record["val_iou"],
                    "best_val_mae": record["val_mae"],
                    "history": history,
                },
            }
            torch.save(payload, args.checkpoint)

    metrics_path = args.checkpoint.with_suffix(".json")
    metrics_path.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Best checkpoint saved to {args.checkpoint}")


if __name__ == "__main__":
    main()

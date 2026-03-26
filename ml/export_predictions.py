from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
import sys

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

import torch

from ml.config import DEFAULT_CHECKPOINT, SCENE_CONFIGS
from ml.predict import load_model, predict_scene_with_loaded_model


def daterange(start_day: str, end_day: str):
    current = datetime.strptime(start_day, "%Y-%m-%d").date()
    end = datetime.strptime(end_day, "%Y-%m-%d").date()
    while current <= end:
        yield current.strftime("%Y-%m-%d")
        current += timedelta(days=1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export static model predictions for the web demo.")
    parser.add_argument("--start-date", default="2026-01-01")
    parser.add_argument("--end-date", default=datetime.now().strftime("%Y-%m-%d"))
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("assets") / "model-predictions" / "predictions.json",
    )
    parser.add_argument(
        "--scenes",
        nargs="*",
        default=list(SCENE_CONFIGS.keys()),
        choices=list(SCENE_CONFIGS.keys()),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, meta = load_model(args.checkpoint, device)

    predictions: dict[str, dict[str, dict]] = {}
    for scene_id in args.scenes:
        scene_predictions: dict[str, dict] = {}
        for day in daterange(args.start_date, args.end_date):
            payload = predict_scene_with_loaded_model(
                scene_id,
                day,
                model=model,
                meta=meta,
                device=device,
                checkpoint=args.checkpoint,
            )
            scene_predictions[day] = {
                "rois": payload["rois"],
                "anomaly_density": payload["anomaly_density"],
                "summary": payload["summary"],
                "fallback_used": payload["fallback_used"],
                "threshold": payload["threshold"],
                "model": payload["model"],
            }
            print(f"[ok] {scene_id} {day}")
        predictions[scene_id] = scene_predictions

    bundle = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "start_date": args.start_date,
        "end_date": args.end_date,
        "checkpoint": str(args.checkpoint),
        "predictions": predictions,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved predictions to {args.out}")


if __name__ == "__main__":
    main()

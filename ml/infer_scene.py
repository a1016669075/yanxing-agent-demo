from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

import torch

from ml.config import DEFAULT_CHECKPOINT, SCENE_CONFIGS
from ml.predict import predict_scene


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local continuous aerosol inversion model.")
    parser.add_argument("--scene", choices=list(SCENE_CONFIGS.keys()))
    parser.add_argument("--date")
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--threshold", type=float, default=0.44)
    parser.add_argument("--status", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.status:
        print(
            json.dumps(
                {
                    "available": args.checkpoint.exists(),
                    "checkpoint": str(args.checkpoint),
                    "cuda": torch.cuda.is_available(),
                },
                ensure_ascii=False,
            )
        )
        return

    if not args.scene or not args.date:
        raise SystemExit("scene and date are required")
    if not args.checkpoint.exists():
        raise SystemExit(f"checkpoint not found: {args.checkpoint}")

    payload = predict_scene(
        args.scene,
        args.date,
        checkpoint=args.checkpoint,
        threshold=args.threshold,
    )
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()

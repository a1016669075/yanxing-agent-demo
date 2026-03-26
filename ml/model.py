from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn
from torchvision.models import ResNet18_Weights, resnet18


class ConvBlock(nn.Module):
    def __init__(self, in_channels: int, out_channels: int) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class UpBlock(nn.Module):
    def __init__(self, in_channels: int, skip_channels: int, out_channels: int) -> None:
        super().__init__()
        self.block = ConvBlock(in_channels + skip_channels, out_channels)

    def forward(self, x: torch.Tensor, skip: torch.Tensor) -> torch.Tensor:
        x = F.interpolate(x, size=skip.shape[-2:], mode="bilinear", align_corners=False)
        x = torch.cat([x, skip], dim=1)
        return self.block(x)


class AODInversionNet(nn.Module):
    def __init__(self, pretrained: bool = True) -> None:
        super().__init__()
        weights = ResNet18_Weights.DEFAULT if pretrained else None
        backbone = resnet18(weights=weights)

        self.stem = nn.Sequential(backbone.conv1, backbone.bn1, backbone.relu)
        self.pool = backbone.maxpool
        self.layer1 = backbone.layer1
        self.layer2 = backbone.layer2
        self.layer3 = backbone.layer3
        self.layer4 = backbone.layer4

        self.up4 = UpBlock(512, 256, 256)
        self.up3 = UpBlock(256, 128, 160)
        self.up2 = UpBlock(160, 64, 96)
        self.up1 = UpBlock(96, 64, 64)
        self.refine = ConvBlock(64, 48)
        self.intensity_head = nn.Conv2d(48, 1, kernel_size=1)
        self.mask_head = nn.Conv2d(48, 1, kernel_size=1)

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        c0 = self.stem(x)
        c1 = self.layer1(self.pool(c0))
        c2 = self.layer2(c1)
        c3 = self.layer3(c2)
        c4 = self.layer4(c3)

        d4 = self.up4(c4, c3)
        d3 = self.up3(d4, c2)
        d2 = self.up2(d3, c1)
        d1 = self.up1(d2, c0)
        full = F.interpolate(d1, size=x.shape[-2:], mode="bilinear", align_corners=False)
        features = self.refine(full)

        intensity = torch.sigmoid(self.intensity_head(features))
        mask_logits = self.mask_head(features)
        return {
            "intensity": intensity,
            "mask_logits": mask_logits,
        }

# 本地深度学习反演链路

这套链路用于把当前 demo 从“官方产品聚类”强化成“真实遥感底图 + 本地连续反演模型 + ROI 异常提取”。

当前实现：
- 输入：`VIIRS NOAA-21 / NOAA-20 / SNPP / MODIS Terra` 官方日尺度真彩色底图
- 监督目标：`MODIS Terra AOD 3km`
- 模型：`ResNet18-FPN` 多任务连续反演网络
- 输出：连续反演强度场、异常 ROI 候选区、静态网页可复用的预测结果

## 训练

在本机 `torch-gpu` 环境中运行：

```powershell
conda run -n torch-gpu python ml\train.py --start-date 2026-01-01 --end-date 2026-03-22 --epochs 8 --batch-size 6
```

训练完成后会生成：
- `ml/checkpoints/aod_inversion_unet.pt`
- `ml/checkpoints/aod_inversion_unet.json`

## 单景推理

```powershell
C:\Users\max\.conda\envs\torch-gpu\python.exe ml\infer_scene.py --scene urban-plume --date 2026-03-20
```

## 导出网页静态预测

这一步会把 `2026-01-01` 到指定日期的场景预测批量导出到静态网页资源，GitHub Pages 也能直接读取：

```powershell
conda run -n torch-gpu python ml\export_predictions.py --start-date 2026-01-01 --end-date 2026-03-22
```

导出文件：
- `assets/model-predictions/predictions.json`

## 接入 demo

本地运行：

```powershell
node server.js
```

本地网页会自动按这个优先级取结果：
1. 静态导出的连续反演结果
2. 本地 Python 实时推理接口
3. 前端官方 AOD 聚类回退方案

本地 API：
- `/api/model-status`
- `/api/model-infer`

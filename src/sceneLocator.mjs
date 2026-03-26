import { bboxToPercentRect, describeFocusBbox } from "./globalFocus.mjs";

function formatSpan(info) {
  return `${info.lonSpan}° × ${info.latSpan}°`;
}

export function buildSceneLocatorSnapshot(scenario, globalOverview = null) {
  const bbox =
    scenario?.focusSelection?.bbox ??
    scenario?.imageryProfile?.bbox ??
    scenario?.imagery?.bbox ??
    null;

  if (!bbox) {
    return null;
  }

  const info = describeFocusBbox(bbox);
  const rect = bboxToPercentRect(info.bbox);

  return {
    label:
      scenario?.focusSelection?.label ??
      scenario?.imageryProfile?.label ??
      scenario?.title ??
      "当前区域",
    scaleLabel: scenario?.focusSelection?.scaleLabel ?? info.scaleLabel,
    centerLabel: scenario?.focusSelection?.centerLabel ?? info.label,
    spanLabel: formatSpan(info),
    rect,
    overviewSrc: globalOverview?.src ?? "",
    overviewSourceLabel: globalOverview?.sourceLabel ?? "全球位置索引",
    overviewNote:
      globalOverview?.note ?? "这里显示的是低分辨率全球总览，用于说明当前场景在世界范围中的位置。",
  };
}

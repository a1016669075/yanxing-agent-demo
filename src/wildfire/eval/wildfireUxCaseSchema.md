# Wildfire UX Validation Case Schema

This schema is for wildfire front-end validation only. It does not replace live replay, provider parity, or archive benchmark contracts.

## Scope

- The UX case manifest exists to answer a user-facing question:
  can a reviewer quickly see what the wildfire module found, what it did not find, and how trustworthy each layer is?
- These cases are intentionally separated from detection metrics.
- `fixture_demo` cases are allowed for semantic teaching and screenshot generation, but they must never be mixed into live performance claims.

## Required Fields

- `id`
  Stable case identifier used in per-case artifact directories and report links.
- `bundle`
  One of:
  `showcase_gold`, `honesty_gallery`, `temporal_semantics_gallery`, `user_tasks`.
- `source_type`
  One of:
  `live_official`, `archive_official`, `fixture_demo`.
- `case_type`
  One of:
  `AF_gold`, `AF_canary`, `BA_canary`, `empty`, `trap`, `fallback`, `temporal_semantics`.
- `ux_goal`
  What this case is supposed to prove from a front-end perception standpoint.
- `user_story`
  Plain-language statement of what a user should be able to understand or do.
- `user_actions`
  Short list of the interactions or observations expected from the viewer.
- `expected_frontend`
  Structured expectations such as the primary status, must-show elements, and must-not-imply rules.
- `pass_rules`
  Human-readable acceptance rules for the case.
- `failure_bucket`
  Conservative failure classification labels if the case misleads the viewer.
- `screenshot_targets`
  Expected screenshot files. Default set:
  `full_page.png`, `map_view.png`, `popup_or_detail_panel.png`, `legend_or_layer_state.png`.
- `metrics_to_check`
  UX metrics or task proxies associated with this case.
- `whether_counts_for_live_metrics`
  Boolean gate. `true` means the case is backed by a real live replay case and may contribute to UX reporting that is restricted to live cases.
  `false` must be used for every `fixture_demo` case.

## Panel Model

Each UX case may render one or more panels. A panel can be:

- `kind: "live_case"`
  Pull directly from a frozen live replay artifact such as run6.
- `kind: "fixture"`
  Demo-only visualization derived from an existing live case or a synthetic semantics template.

Recommended panel fields:

- `id`
- `label`
- `note`
- `live_case_id`
- `base_case_id`
- `fixture_kind`

## User Task Extensions

User-task cases should also include:

- `task_prompt`
- `expected_answer`

Their per-case artifacts must additionally include:

- `task_prompt.txt`
- `expected_answer.json`
- `machine_checkable_proxy.json`

## Hard Rules

- `fixture_demo` must be visibly labeled in generated HTML, screenshots, and summary JSON.
- `fixture_demo` must not contribute to live performance summaries.
- `fallback`, `suspicious`, and `preview` must never be styled or worded like confirmed wildfire.
- `active fire` must not be conflated with `burned area`.
- `same day` must not be presented as `same time`.
- `basemap/context time` and `evidence acquisition time` must be displayed separately for temporal-semantics cases.
- No token, MAP key, or upstream credential may appear in HTML, screenshots, JSON, or logs.

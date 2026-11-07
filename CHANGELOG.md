# Changelog

## Unreleased

- 星图默认改为 3D 群星视图：透视相机、拖动旋转、Shift+滚轮缩放。
- 设置 → 外观新增「视图」：3D 群星 / 平面星图。

## v0.0.1 — 2026-11-08

首个公开版本。

### 功能

- 公共星图 + 项目星图；公共图始终参与召回。
- `memory_search` / `memory_save` / `memory_link` / `memory_forget`。
- 星尘历史：字段级变更、最多 50 版、按版本恢复。
- JSON / zip 导出；导入预览、新建副本、合并到现有。
- 启动自动备份，保留最近 5 份。
- 全局搜索；标签聚类星座；冲突裁决；归档恢复。
- 敏感过滤、自定义敏感词、全局隐身、工作区暂停、会话暂停、导出提醒。
- WebGL2 + Worker 画布、Canvas 2D 降级、深/浅主题。
- 首次引导、完整设置、健康指标、恢复默认。
- 回合尾部召回 trace 展开。

### 验证

- `tests/regression.mjs`：回归通过。
- `tests/theme-contrast.mjs`：深/浅主题文字与强调色对比度全部 ≥ 4.5。
- 10k 单图热检索：p50 6.7ms，p95 9.8ms（本机 desktop profile）。
- 10k 布局 Worker：约 1.76s。
- 自动备份、导入合并来源、归档恢复、会话/工作区暂停均已实测。

### 已知限制

- 星座命名是标签聚类，未接 LLM 命名。
- 10k 真实浏览器视觉验收需按 `docs/release-checklist.md` 人工完成。
- 星尘历史内嵌在星对象，没有独立 `history/<starId>.jsonl`。
- 自动备份只在启动时生成。
- 界面文案以中文为主。

# Changelog

## Unreleased

- 移除 3D 与缩放，固定为 2D 平面。
- 星图渲染从 Canvas/WebGL 改为原生 DOM 星点 + SVG 边；平移仍只做 CSS transform。
- 中心密、外圈疏的中心向外布局；Host 生成布局，客户端只取视口内星。
- React 只渲染当前视口 +180px 预取边距的星，缓存其余已加载星，避免越拖 DOM 越大。
- 视口请求每 80ms 预取，但界面合并为约 180ms 更新一次，避免拖动中每请求都全量重渲染。
- 新增 journal 定期 checkpoint：每 15 分钟检查，单图 journal 超过 2MB 时压缩为紧凑快照；`/health.storage` 增加 `snapshotBytes`。
- 索引/布局/分页缓存加 LRU 上限（4/4/8 张地图），多地图场景不再无界占用内存。
- 地图快照与备份改为紧凑 JSON；实测 18,580 星地图 29.3MB → 19.7MB（-32.7%），索引/设置仍保留缩进。
- 视口读取引入地图 revision：同一 revision 下不再每次扫描全部星；增删/状态变化时增量补位并清理旧网格。
- `/health` 增加 `storage`（journal 字节、索引/布局/分页缓存、RSS、锁）和生效设置；删除地图时同步清理 journal 字节、索引、布局、分页、统计缓存，修复长期测试后的缓存泄漏。
- 启动索引预热默认只做公共图 + 已绑定项目图（`prewarmScope: "bound"`），其余地图首次检索时冷建；`"all"` 可恢复全量预热。
- 客户端视口缓存上限 7000 星 / 24000 边，超出按距当前中心最远淘汰，长时间探索不再无限涨内存。
- 冲突检测加入数字/版本/否定/迁移语义：高相似但内容冲突时不再合并，新建星并标记旧星 disputed + contradicts 边。
- 新增 `memory_feedback`：used / ignored / wrong 反馈进入权重与 history，不删除记忆；API `/stars/:id/feedback` 同步开放。
- 模型出口统一脱敏：`memory_search`、自动召回、brief、UI 搜索结果中的凭据/手机号/邮箱/自定义敏感词替换为 `[redacted]`；可用 `privacyOutputRedaction:false` 关闭。
- 召回统一走 `retrieveHits`：先用原始候选扩图，再做重复抑制；pinned 保留最低召回位，brief 不再压掉 pinned。
- 图扩展改为邻接表，支持 5000 条以上关系边的大图。
- 增加 profile 级 `plugin.lock`：同一数据目录只允许一个 DSH 进程写入；关闭时释放。
- 新增 `journalFsync` 设置，开启后 journal 追加会 fsync 后再返回。
- 手动新建与模型保存统一到 `upsertStarToMap`：同样的相似合并、related/contradicts 边、history 和 journal。
- 导入默认重新执行敏感内容与指令注入过滤，`privacy=allow` 才允许可信恢复。
- 星座建议改为 `constellation.upsert/delete` journal，不再整图重写。
- 边写入改为 journal 增量（`edge.upsert` / `edge.delete`），不再为一条关系重写整图。
- 保存去重改为走倒排候选；全局 starId 定位缓存；卸载时等待写队列 drain。
- 拆分全屏交互层与被 transform 的星图层，外围空白区域也能开始拖动。
- 拖拽时给 body 加 `ms-dragging`，强制全界面 grabbing 光标，星点按钮不再覆盖拖动光标。
- 关闭星云背景的 drift/spin 位移动画，并将星图区域标记为 Electron `no-drag`，避免拖拽时背景或面板被移动。
- 拖拽改为 window 级 pointer 监听兜底，指针落在星点或图层外也不会丢失拖动。
- 星图最小间距从 40px 提高到 72px，中心视口星星更疏朗。
- 新增真实场景测试星图生成器：18,580 星、27,835 条关系、33 星座，覆盖历史、待确认、归档、争议、取代、重复与合并。
- 视口请求改为空间网格查询 + 精简星记录；拖动中每 160ms 节流预取，松手只补最后区域。
- 随机吸附散布：每颗星有可见最小间距，位置无网格规律，间距不固定。
- 所有星使用固定 32px 点径，不再随星数增加而缩小。
- 星点改为四芒星 + 辉光；背景改为宇宙星云、银河带与多层星场。
- 2D 支持无边界拖拽平移、重置视图；拖动只位移星图层，不重绘。
- 大图自动跳过标签覆盖层，避免 10 万星拖动时重复绘制标签。
- 新增地图分页 API：客户端自动取完所有页后一次性布局。
- 检索改为倒排索引 + 文档增量同步；单次写入后不再重建整张 10 万星索引。
- dirty-star 精确索引：按变更星更新 docs / postings / df，100k 单次同步约 8–20ms。
- 单星增删改改为 append-only journal，避免每次重写 10 万星整图；启动回放，8MB 自动压缩。
- 召回统计改为 stats journal 追加，30 秒批量落盘，不再触发整图重写。
- 启动时先分片预热倒排索引再开放记忆 API；`prewarmOnBoot=false` 可关闭，打开大图仍会触发预热点。
- 图关系召回：直接命中不足时，沿 related / supports / derived / part-of 扩展邻居。
- 全局搜索支持 `graph=1` 图扩展：直接命中不足时补入相关邻居。
- 新增 journal 与图关系召回专项测试脚本。
- 增加查询词覆盖率门槛与 MMR 结果去重；精确重复记忆直接合并，关联边去重。
- 模型与手动写入统一敏感内容 / 指令注入过滤；首次简报也受 token 预算限制。
- 星云渐变背景、暗角、玻璃面板、主题化按钮与微交互。

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

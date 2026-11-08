# 雨咯记忆星 · Rian Memory Star Path

把跨会话的项目长期记忆组织成一张可浏览、可整理、可删除的星图。

这是一个 **DSH Cordis 插件 bundle**，不是独立应用。它通过 `memory_*` 工具让模型读写记忆，并在 DSH 侧边栏与设置页提供星图界面。

- 版本：`0.0.2`
- 仓库：<https://github.com/fongwuyan/Rian-Memory-Star-Path>
- 设计文档：[docs/rian-memory-star-path.design.md](docs/rian-memory-star-path.design.md)
- 发布检查清单：[docs/release-checklist.md](docs/release-checklist.md)
- 更新记录：[CHANGELOG.md](CHANGELOG.md)

## 特性

- **公共图 + 项目图**：公共星图始终参与召回；每个会话可额外绑定一张项目图，或只用公共图。
- **记忆工具**：`memory_search` / `memory_save` / `memory_link` / `memory_forget`。
- **重复抑制**：同一颗星默认 3 回合内不重复注入，可在设置关闭。
- **召回 trace**：回合尾部点「召回 N」查看本轮实际注入的标题与文本。
- **星尘历史**：字段级变更、最多 50 版、按版本恢复，恢复本身也可回退。
- **备份与导入**：JSON / zip 导出（含历史）；导入预览同名星图，支持新建副本、合并到现有或取消。
- **自动备份**：启动时生成 zip，保留最近 5 份。
- **整理能力**：星云批量点亮 / 丢弃、冲突裁决、标签聚类星座、跨图全局搜索、归档恢复入口。
- **合并来源**：工具合并 / 导入合并 / 冲突合并会记录来源标题与事实，星详情可查。
- **隐私**：敏感过滤、自定义敏感词、全局隐身、工作区暂停、会话暂停、导出提醒。
- **检索优化**：倒排索引、dirty-star 精确增量同步、启动/打开大图后的分片预热点、查询词覆盖率门槛、MMR 去重、图关系召回；100k 热检索约 2–3ms，单次写入后的索引同步约 8–20ms。
- **写入优化**：单星增删改与召回统计都走 append-only journal，不再每次重写整张 10 万星地图；启动时回放，超过 8MB 自动压缩回全量快照。
- **界面**：2D 平面、中心密外圈疏；从中心向四周无规律扩散，视口按需取星，不再一次性加载全图；Host 侧随机吸附布局保证可见星最小间距约 72px；星点固定 32px，四芒星辉光；宇宙星云、银河带、星场背景；高权重偏外围；支持无边界拖拽平移、重置视图；玻璃面板、微交互；星点用原生 DOM、边用 SVG，不再使用 Canvas / WebGL；深/浅两套主题。
- **首次引导与设置**：一次性欢迎层；界面 / 记忆 / 隐私 / 数据 / 健康度 / 关于；恢复默认。
- **健康度**：星图与星数、待确认/冲突、检索次数与最近延迟、写入次数、备份份数。

## 安装

要求：支持 Cordis 插件的 DSH desktop profile。

1. 获取本仓库源码。
2. 在 DSH 插件管理器中从本地目录安装并启用 bundle：

   ```text
   rian-memory-star-path
   ```

   当前开发 profile 中的入口是：

   ```text
   include:rian-memory-star-path
   ```

3. 启用后侧边栏出现「雨咯记忆星」。

插件没有 npm 运行时依赖，`zip.js` 基于 Node 内置 `zlib` 实现。

> 修改 `client.js` 后需要刷新页面；修改 `index.js` 后需要禁用/重新启用插件。

## 使用

### 让模型记住

在对话中明确说：

```text
记住：生产数据库使用 PostgreSQL。
```

模型会调用 `memory_save` 写入当前绑定图。项目图默认按置信度决定直接生效或进入星云待确认；公共图写入默认进入待确认。

### 星图界面

- 侧边栏「雨咯记忆星」打开主面板；
- 顶部切换星图、新建图、整理星座、暂停工作区、导出当前图；
- 编辑模式下可建星、改星、删除星/图；
- 底部「星云」查看待确认星，支持多选点亮/丢弃；
- 星详情包含事实、理由、条件、标签、星尘历史与冲突裁决；
- 搜索框输入至少 2 字会跨全部星图检索，结果按图分组；
- 输入框绑定 chip 显示 `公共 + 项目名` 或 `仅公共`，旁边的 `⏸` 可暂停当前会话记忆。

### 全沉浸 / 编辑模式

设置页可切换：

- **全沉浸**：隐藏顶部栏与底部状态栏，滚轮切换星图；
- **编辑模式**：显示操作栏，可建星、整理、导出。

## 数据目录

默认位于当前 DSH profile：

```text
<DSH_PROFILE_DIR>/plugin-data/rian-memory-star-path/
```

例如 Windows desktop profile：

```text
C:\Users\<user>\.dsh\profiles\desktop\plugin-data\rian-memory-star-path\
```

结构：

```text
index.json                星图索引
bindings.json             会话 -> 项目图绑定
settings.json             插件设置（含 journalFsync）
plugin.lock               profile 独占锁，关闭时释放
maps/<mapId>.json         单图数据（星、边、星座、星尘）
backups/backup-*.zip      启动自动备份，最近 5 份
```

写入使用每图独立队列、唯一临时文件和原子 rename。

## 备份与导入

- 设置 → 数据：导出全部 JSON / zip；
- 项目图顶部「导出」：只导出当前图；
- 导入会自动预览同名图：
  - 新建副本：生成 `（导入）` 后缀的新图；
  - 合并到现有：按标题 + 事实去重，新星补入，边与星座重映射；
  - 取消：不写入。
- 自动备份默认开启，可在设置关闭。

zip 结构：

```text
manifest.json
settings.json
maps/<mapId>.json
```

星尘历史内嵌在 `maps/*.json` 的星对象中。

## 隐私

设置 → 隐私：

- 敏感过滤：标准 / 严格 / 只拦凭据；
- 自定义敏感词：逗号分隔，所有模式生效；
- 凭据类内容始终拒绝保存；
- 隐身模式：暂停写入、开场简报、每轮召回与检索工具；
- 工作区暂停：项目图顶部「暂停」；
- 会话暂停：输入框 chip 旁的 `⏸`；
- 导出前提醒：默认开启。

## 开发

### 目录

```text
rian-memory-star-path/
  index.js              Host：工具、检索、存储、HTTP API、备份
  client.js             Client：侧边栏面板、原生 DOM 星点、SVG 边、星云、设置、引导
  zip.js                零依赖 ZIP 读写
  cordis.patch.yml      bundle patch
  locale/               中英文标题/描述
  tests/regression.mjs  回归脚本
  tests/journal.mjs     journal 写入专项
  tests/graph.mjs       图关系召回专项
  tests/import-privacy.mjs  导入隐私过滤专项
  tests/ingress.mjs     手动/模型统一写入专项
  tests/generate-realistic-map.mjs  生成真实场景测试星图
```

### 回归测试

先启动 DSH Web GUI，并确保插件启用，然后：

```powershell
node tests/regression.mjs
node tests/graph.mjs
$env:DSH_MEMORY_DATA_DIR="$env:USERPROFILE\.dsh\profiles\desktop\plugin-data\rian-memory-star-path"
node tests/journal.mjs
node tests/import-privacy.mjs
node tests/ingress.mjs
```

重建真实场景测试图（会删除旧的 `测试星图 10w`）：

```powershell
node tests/generate-realistic-map.mjs
```

默认生成 18,580 颗星；可用 `DSH_TEST_MAP_SIZE` 调整基础星数。

默认 API：

```text
http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2
```

地图分页 API（保留给导入/兼容）：

```text
GET /maps/:id/page?offset=0&limit=5000
```

按权重降序返回活跃星，响应包含 `total`、`offset`、`limit`、`nextOffset`、`hasMore`、`inactive`；只返回本页星点之间的边。

星图渲染改用视口 API：

```text
GET /maps/:id/meta
GET /maps/:id/viewport?cx=0&cy=0&w=1600&h=900&pad=320
```

`meta` 返回总数与非活跃星；`viewport` 只返回当前视口（含预取边距）内的星与坐标，客户端拖拽结束后按新视口补载。

可通过环境变量覆盖：

```powershell
$env:DSH_MEMORY_API = "http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2"
```

脚本会创建临时星图、验证冲突裁决 / 星尘恢复 / 星座 / 搜索 / zip 导入导出 / 设置往返，并在结束时清理。

主题文字对比度（WCAG，阈值 4.5）：

```powershell
node tests/theme-contrast.mjs
```

### 性能基线

在本机 desktop profile 实测（仅供量级参考）：

| 规模 | 导入 | 冷检索 | 热检索 | 地图读取 | zip 导出 |
|---|---|---|---|---|---|
| 2000 星 | 90ms | 37ms | 8ms | 942KB / 22ms | 38KB / 30ms |
| 10000 星 | 229ms | 216ms | 6.7ms（p95 9.8ms） | 4.74MB / 89ms | 188KB / 128ms |

布局按权重分层做无规律散布，不再跑力导向；标签只在 ≤120 星时绘制。10k 热检索 p50 6.7ms、p95 9.8ms（本机 desktop profile）。

真实场景测试图（`真实场景测试星图`）：18,580 颗星、27,835 条关系、33 个星座；含 1,051 待确认、961 归档、530 争议、4,947 条带历史、683 条带合并记录；地图快照约 29MB；首次打开布局约 0.3s，之后视口请求约 30–70ms，中心返回约 1100 颗精简记录；单星写入走 journal，不再整图重写；索引同步约 8–20ms。

### 版本

当前 `0.0.2`。版本号同时出现在：

- `package.json`
- `index.js` 的 `PLUGIN_VERSION`
- `client.js` 的版本回退值

## 已知限制

- 星座命名目前是标签聚类，未接入 LLM 命名；
- 超大图首次打开需要 Host 生成中心向外布局；真实场景测试图约 0.3s；已加载区域会累积在内存，长时间向四周探索后仍会逐步变大；
- 星尘历史内嵌在星对象，没有独立的 `history/<starId>.jsonl`；
- 自动备份只在启动时生成，不是定时任务；
- 没有云同步、多端合并或团队协作；
- 界面文案以中文为主。

更完整的差异记录见设计文档第 15 节。

## 许可证

本项目使用 [MIT License](LICENSE)。

Copyright (c) 2026 fongwuyan

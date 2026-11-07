# 雨咯记忆星 · Rian Memory Star Path

把跨会话的项目长期记忆组织成一张可浏览、可整理、可删除的星图。

这是一个 **DSH Cordis 插件 bundle**，不是独立应用。它通过 `memory_*` 工具让模型读写记忆，并在 DSH 侧边栏与设置页提供星图界面。

- 版本：`0.2.0`
- 仓库：<https://github.com/fongwuyan/Rian-Memory-Star-Path>
- 设计文档：[docs/rian-memory-star-path.design.md](docs/rian-memory-star-path.design.md)

## 特性

- **公共图 + 项目图**：公共星图始终参与召回；每个会话可额外绑定一张项目图，或只用公共图。
- **记忆工具**：`memory_search` / `memory_save` / `memory_link` / `memory_forget`。
- **星尘历史**：字段级变更、最多 50 版、按版本恢复，恢复本身也可回退。
- **备份与导入**：JSON / zip 导出（含历史）；导入预览同名星图，支持新建副本、合并到现有或取消。
- **自动备份**：启动时生成 zip，保留最近 5 份。
- **整理能力**：星云批量点亮 / 丢弃、冲突裁决、标签聚类星座、跨图全局搜索。
- **隐私**：敏感过滤、自定义敏感词、全局隐身、工作区暂停、会话暂停、导出提醒。
- **界面**：WebGL2 星点/连线 + Worker 力导向 + 2D 标签覆盖；WebGL 不可用时降级 Canvas 2D。
- **首次引导与设置**：一次性欢迎层；界面 / 记忆 / 隐私 / 数据 / 健康度 / 关于；恢复默认。

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
settings.json             插件设置
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
  client.js             Client：侧边栏面板、画布、星云、设置、引导
  zip.js                零依赖 ZIP 读写
  cordis.patch.yml      bundle patch
  locale/               中英文标题/描述
  tests/regression.mjs  回归脚本
```

### 回归测试

先启动 DSH Web GUI，并确保插件启用，然后：

```powershell
node tests/regression.mjs
```

默认 API：

```text
http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2
```

可通过环境变量覆盖：

```powershell
$env:DSH_MEMORY_API = "http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2"
```

脚本会创建临时星图、验证冲突裁决 / 星尘恢复 / 星座 / 搜索 / zip 导入导出 / 设置往返，并在结束时清理。

### 性能基线

在本机 desktop profile 实测（仅供量级参考）：

| 规模 | 导入 | 冷检索 | 热检索 | 地图读取 | zip 导出 |
|---|---|---|---|---|---|
| 2000 星 | 90ms | 37ms | 8ms | 942KB / 22ms | 38KB / 30ms |
| 10000 星 | 229ms | 216ms | 14ms | 4.74MB / 89ms | 188KB / 128ms |

10k 布局 Worker 约 1.76s；超过 600 星使用采样排斥，标签只在 ≤120 星时绘制。

### 版本

当前 `0.2.0`。版本号同时出现在：

- `package.json`
- `index.js` 的 `PLUGIN_VERSION`
- `client.js` 的版本回退值

## 已知限制

- 星座命名目前是标签聚类，未接入 LLM 命名；
- 10k 规模已验证 API 与布局 Worker，尚未做完整浏览器视觉验收；
- 星尘历史内嵌在星对象，没有独立的 `history/<starId>.jsonl`；
- 自动备份只在启动时生成，不是定时任务；
- 没有云同步、多端合并或团队协作；
- 界面文案以中文为主。

更完整的差异记录见设计文档第 15 节。

## 许可证

本项目使用 [MIT License](LICENSE)。

Copyright (c) 2026 fongwuyan

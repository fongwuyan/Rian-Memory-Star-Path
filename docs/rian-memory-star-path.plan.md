# 雨咯记忆星 · 开发计划

| 项 | 内容 |
|---|---|
| 对应设计 | [rian-memory-star-path.design.md](rian-memory-star-path.design.md) v1.4（定稿） |
| 插件名 | `rian-memory-star-path` |
| 目标 | 一个可安装的 DSH 插件，打通「AI 写入 → 星图可见 → 召回注入」 |
| 范围 | 高频项目开发；单机、本地存储；不做 Bot / 云同步 |
| 估算 | 单人全职约 23~25 个开发日（含缓冲） |

---

## 0. 交付目标

1. 可安装的 bundle：`plugin_manager` 安装后重启即可用；
2. 端到端闭环：在对话里让 AI 记住一件事 → 星卡出现 → 画布出现星 → 下一轮能被召回；
3. 公共星图 + 项目星图、星云确认、冲突裁决、导入导出、健康度面板可用；
4. 深色「雨夜」与亮色「晨雾」两套视觉都能正常渲染；
5. 不新增会话事件类型，不阻塞对话。

---

## 1. 架构总览

```text
┌──────────────────────── Client (Web) ────────────────────────┐
│  Main Panel (WebGL2 + 2D labels)   Settings   Chat Star Card  │
│  Map tabs / Canvas / Detail / Nebula / List                   │
│                     fetch JSON API                            │
└──────────────────────────────┬────────────────────────────────┘
                               │ /plugins/rian-memory-star-path/api
┌──────────────────────────────▼────────────────────────────────┐
│ Host plugin                                                   │
│  tools(4) │ prompt section │ agent/pre-step │ prompt context   │
│  workspace binding │ subagent guard │ HTTP routes              │
│  store: JSON snapshot + journal + history │ BM25 index          │
│  export/import: .memstar.zip                                  │
└───────────────────────────────────────────────────────────────┘
```

关键约束：

- 记忆是插件自有数据，不进会话日志；
- 检索是纯本地 BM25，不调 LLM；
- 客户端不 `require` 宿主 Client 包，只用主题 token 与自带控件；
- 所有数据留在 `<DSH_PROFILE_DIR>/plugin-data/rian-memory-star-path/`。

---

## 2. 代码结构

```text
rian-memory-star-path/
  package.json
  cordis.patch.yml
  icon.svg
  locale/
    zh-CN.json
    en.json
  src/
    host/
      index.ts                 # 插件入口、Config、inject、apply
      config.ts
      store/
        paths.ts               # 数据目录、原子写
        map-store.ts           # 星图 CRUD、快照
        star-store.ts          # 星 CRUD、状态机
        history.ts             # 字段级 diff、baseline
        index-store.ts         # BM25 索引持久化
        migrate.ts             # schema 迁移、备份
      memory/
        model.ts               # 类型与 zod schema
        tokenize.ts            # CJK 二元组 + 拉丁词
        bm25.ts
        retrieve.ts            # 候选、打分、MMR、预算
        inject.ts              # 简报、注入模板
        dedup.ts               # 合并 / 冲突
        guards.ts              # 敏感 / 指令式过滤
      bridge/
        tools.ts               # memory_search/save/link/forget
        prompt.ts              # 系统段 + 动态 context
        agent.ts               # agent/created、pre-step、子代理
        workspace.ts           # 工作区映射、自动建图
        api.ts                 # HTTP JSON 路由
      export/
        zip.ts                 # fflate 打包 / 解包
        manifest.ts
      metrics.ts
    client/
      index.ts                 # Client 入口、槽位注册
      api.ts                   # fetch 封装
      store.ts                 # 客户端状态
      panel/
        Panel.tsx
        Canvas.tsx             # WebGL2 + 2D 标签层
        gl/                    # shader、buffer、picking
        layout.worker.ts       # Barnes-Hut
        StarDetail.tsx
        Nebula.tsx
        ListView.tsx
        MapTabs.tsx
        AllMaps.tsx
      chat/
        SaveCard.tsx           # memory_save 工具视图
        BindingChip.tsx
        TurnTail.tsx
      settings/
        SettingsPage.tsx
        sections/...
      theme.ts
      locale.ts
  test/
    unit/
    fixtures/
```

---

## 3. 里程碑

| 阶段 | 主题 | 估算 | 退出标准 |
|---|---|---|---|
| M0 | 骨架与关键验证 | 2 天 | 插件可安装，面板可打开，三个技术点验证通过 |
| M1 | 数据层 | 4 天 | 崩溃可恢复，10k 星可加载，单测通过 |
| M2 | 写入闭环 | 3 天 | 对话保存 → 星卡 → 画布可见 |
| M3 | 召回 | 3 天 | 回归集基线跑通，子代理只读 |
| M4 | 星图 UI | 5 天 | 10k 星 60fps，双主题正常 |
| M5 | 设置与数据 | 3 天 | 设置页完整，导入导出往返一致 |
| M6 | 收尾与验收 | 3 天 | 验收清单全过 |

### M0 · 骨架与关键验证

**要做：**

1. 创建 bundle：`package.json`、`cordis.patch.yml`、Host 入口、Client 入口、locale、icon；
2. 安装到当前 profile，确认侧栏出现「记忆星」、`main` 面板可打开、设置页出现；
3. 技术验证（三件事，任一失败就调整设计）：
   - 原生 WebGL2 实例化画 10k 点 + 2D 标签层；
   - 内联 Blob Worker 能启动并回传 `Float32Array`；
   - `agent/pre-step` 先于 `systemPrompt.context` 装配，缓存能被读到；
4. 验证 `webServer.register` 的 JSON 路由与同源校验；
5. 验证 `workspaceRegistry.resolveByPath(session.header.cwd)` 能拿到工作区。

**退出：** 插件安装成功，空面板能打开，三个验证有结论并记录。

### M1 · 数据层

**要做：**

- Star / Map / Edge / Constellation / Trace / Settings 的 zod schema；
- 数据目录、原子写、journal、快照、压缩；
- 状态机、星尘历史（字段级 diff、每 50 版 baseline）；
- BM25 索引：分词、df/avgdl、持久化、增量更新；
- 迁移与备份（最近 5 份）；
- 单元测试：分词、BM25、去重、状态机、历史重建、崩溃恢复。

**退出：** 通过测试夹具完成 CRUD；kill 进程后重启能恢复；10k 合成星加载 < 500ms。

### M2 · 写入闭环

**要做：**

- 4 个工具 + 校验 + 限流 + 幂等；
- 系统提示段（双语）+ 每轮自检；
- 工作区绑定、自动建图；
- 去重 / 合并 / 冲突；
- 内联星卡（`tool.call.toolview` key `memory_save`）；
- 回合尾部「摘星 N · 召回 M」；
- 客户端刷新与画布新增星。

**退出：** 在对话里说“记住，这个项目用 pnpm”，星卡出现、画布出现星、下一轮能被召回。

### M3 · 召回

**要做：**

- 开场简报（2 公共 + 3 项目，≤400 token）；
- pre-step 检索 + 缓存 + prompt context；
- 打分、MMR、预算、重复抑制；
- trace 存储与浮层；
- 子代理只读 guard、隐身会话。

**退出：** 20 题回归集基线跑通，记录 recall@6 / precision / 空召回。

### M4 · 星图 UI

**要做：**

- WebGL2 画布：星点、连线、星座光晕、雨丝/雾带；
- 2D 标签覆盖层；
- Worker 力导向 + 冻结 + 局部重算；
- 星详情、星云、列表、星图页签、全部星图浮层；
- 编辑模式 / 全沉浸模式；
- 深色雨夜 / 亮色晨雾；
- 空状态、首次引导、错误横幅。

**退出：** 10k 星 60fps（或稳定 45fps+）；两种主题、两种模式、缩放/切图/聚焦都正常。

### M5 · 设置与数据

**要做：**

- 设置页七个竖向子页；
- 健康度面板（延迟、召回、写入、命中率、token 趋势、分布、建议）；
- 导出 / 导入 `.memstar.zip`（manifest、校验、逐图询问、id 重映射）；
- 自动备份列表与恢复；
- 隐私设置、黑名单、隐身默认。

**退出：** 导出再导入往返一致；同名冲突逐图询问；备份可恢复。

### M6 · 收尾与验收

**要做：**

- 性能调优：索引、渲染、布局、保存；
- 回归集复跑与参数冻结；
- 失败模式演练：快照损坏、索引损坏、WebGL 不可用、Worker 失败；
- 会话日志检查：不出现新事件类型；
- 安装、卸载、重装验证；
- 文档补齐（README、截图、已知限制）。

**退出：** 设计文档 14.4 验收清单全过。

---

## 4. 依赖与风险

| 风险 | 影响 | 应对 | 阶段 |
|---|---|---|---|
| DSH API 与设计不符 | 高 | M0 用 `cordis_inspect` 逐项验证；以实测为准回写文档 | M0 |
| `systemPrompt.context` 装配早于 pre-step | 高 | 缓存未命中时回退到最近一条已提交用户消息；仍不行则改为 pre-step 注入 | M0 |
| Blob Worker 被 CSP 拦截 | 中 | 降级主线程分片布局；或改独立 worker 文件 | M0 |
| WebGL 上下文丢失 | 中 | 监听 `webglcontextlost`，重建资源；不可用降级 Canvas 2D | M4 |
| 10k 星布局太慢 | 中 | Barnes-Hut + alpha 衰减 + 冻结；超大图降级预置布局 | M4 |
| BM25 召回不达标 | 高 | 回归集调参；必要时加字段权重 / 同义词扩展 | M3 |
| zip 库体积 / 许可 | 低 | 用 `fflate`（MIT、纯 JS、体积小） | M5 |
| 数据目录不可写 | 中 | 启动时探测；失败则提示并进入只读模式 | M1 |
| prompt token 成本高 | 中 | 双语段实测；必要时压缩中文段或按语言切换 | M2 |
| 导入大包内存峰值 | 低 | 流式解压 + 单包 1GB 上限 | M5 |

---

## 5. 测试策略

- **单元**：分词、BM25、去重、冲突、状态机、历史重建、敏感过滤；
- **集成**：工具 → 存储 → 检索 → 注入；
- **端到端**：安装、对话保存、画布、召回、导入导出；
- **性能**：10k 星加载、检索 p95、保存 p95、渲染帧率、布局收敛；
- **回归**：20 题（10 真实匿名化 + 10 合成），每次改打分重跑；
- **手动**：双主题、双模式、空状态、失败降级、子代理、隐身。

---

## 6. 验收

最终验收 = 设计文档 14.4 清单 + 以下指标：

| 指标 | 目标 |
|---|---|
| 检索 p95 | < 10ms（单图 10k） |
| 保存 p95 | < 5ms |
| 启动加载 | < 500ms |
| 画布帧率 | 10k 星 ≥ 45fps |
| 回归 recall@6 | ≥ 0.8 |
| 空召回准确率 | 100% |
| 导入导出 | 往返一致 |
| 会话日志 | 无新事件类型 |

---

## 7. 开发约定

- 不新增会话事件类型，不写 `document.body`，不 `require` 宿主 Client 包；
- 所有用户可见文案走 `locale`，所有 UI 颜色走主题 token；
- 所有可调参数进 `Config` 或设置页，不散落常量；
- 数据写入必须原子，先 journal 后快照；
- 任何检索 / 存储失败都降级为空上下文，不阻塞对话；
- 每次改打分逻辑都跑回归集。

---

## 8. 首批待办

1. 用 `cordis_inspect` 验证 M0 的五个技术点；
2. 搭 bundle 骨架并安装，确认侧栏 / 主面板 / 设置页三个槽位；
3. 落数据 schema 与存储层；
4. 接 4 个工具与提示词，打通写入闭环；
5. 再做画布。

---

## 9. 开放决策（开发中定）

- `fflate` vs `jszip`（倾向 `fflate`）；
- Blob Worker 的 CSP 兼容性；
- 10k 星布局的收敛阈值与降级策略；
- 双语提示段的实际 token 成本；
- 数据目录在 Desktop / CLI 下的环境变量差异。

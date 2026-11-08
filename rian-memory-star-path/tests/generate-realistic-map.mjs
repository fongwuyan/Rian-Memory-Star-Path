import assert from 'node:assert/strict';

const API = (process.env.DSH_MEMORY_API || 'http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2').replace(/\/$/, '');
const MAP_NAME = '真实场景测试星图';
const SIZE = Number(process.env.DSH_TEST_MAP_SIZE) || 18000;
const NOW = Date.parse('2026-11-08T06:00:00Z');
const DAY = 86400000;

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(0x9e3779b9);
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (probability) => random() < probability;
const iso = (time) => new Date(time).toISOString();
const clip = (text, max) => String(text).replace(/\s+/g, ' ').trim().slice(0, max);

const DOMAINS = [
  {
    key: 'dsh',
    name: 'DSH 插件',
    tags: ['插件', 'Cordis', 'DSH', '面板', '设置'],
    files: ['rian-memory-star-path/index.js', 'rian-memory-star-path/client.js', 'package.json', 'cordis.patch.yml'],
    modules: ['host apply', 'client factory', 'bundle patch', '设置面板', '侧边栏注册'],
    titles: ['插件注册顺序', '侧边栏入口', '设置项默认值', '客户端 HMR', 'Host 启动失败', '插件禁用清理', '权限声明', '版本兼容检查', '面板生命周期', '错误边界'],
    actions: [
      '插件在 apply 阶段注册工具与 Web 路由',
      '客户端 bundle 通过 __ModuleLoader__ 挂载',
      '设置面板复用宿主主题 token',
      '禁用插件时需要清理定时器与写队列',
      'Host 启动失败时保留 bootError 供 API 健康检查',
      '面板卸载后需要终止 Worker 与拖拽监听',
    ],
    details: [
      '顺序错误会导致 tools 尚未注册',
      '刷新页面比重新启用插件更可靠',
      '默认值必须与 normalizeSettings 保持一致',
      '异常会直接影响侧边栏入口',
      '版本不匹配时应给出明确提示',
    ],
  },
  {
    key: 'memory',
    name: '记忆检索',
    tags: ['检索', '索引', 'BM25', '召回', '记忆'],
    files: ['rian-memory-star-path/index.js', 'docs/rian-memory-star-path.design.md', 'tests/regression.mjs'],
    modules: ['postings', 'dirty-star sync', 'BM25F', 'MMR', '覆盖率门槛', '图召回'],
    titles: ['索引增量同步', '召回覆盖率门槛', 'MMR 结果去重', '图关系扩展', '精确重复合并', '敏感写入过滤', '首次简报预算', '召回抑制窗口', '权重衰减', '精确匹配加分'],
    actions: [
      '倒排索引只评分包含查询词的候选',
      'dirty-star 同步只增删变更星的 postings',
      'MMR 在分数与结果多样性之间做权衡',
      '覆盖率不足的长查询会被过滤',
      '关系扩展只沿 supports / related / derived / part-of',
      '简报受 tokenBudget 限制并累计召回统计',
    ],
    details: [
      '10 万星下冷索引约 1.9 秒',
      '单星同步约 8–20ms',
      '常见双字词容易造成误召回',
      '图扩展分数按主命中的 0.42 倍衰减',
      '召回抑制默认持续 3 个 turn',
    ],
  },
  {
    key: 'map',
    name: '星图前端',
    tags: ['星图', '视口', '布局', 'DOM', 'SVG'],
    files: ['rian-memory-star-path/client.js', 'README.md', 'docs/rian-memory-star-path.design.md'],
    modules: ['viewport', 'radial layout', 'DOM stars', 'SVG edges', 'CSS transform', 'constellations'],
    titles: ['视口预取阈值', '中心向外布局', '星点固定尺寸', '拖动节流', '标签遮挡', '边线样式', '星座虚线', '空视口提示', '高权重外圈', '加载状态'],
    actions: [
      '拖动过程中每 160ms 节流请求新视口',
      '视口请求只返回覆盖区域与 450px 预取边距',
      '星点使用原生 DOM，边与星座使用 SVG',
      '平移只对星图层做 translate3d',
      '中心区域候选更密，外圈逐渐稀疏',
      '标签超过 120 颗时自动隐藏',
    ],
    details: [
      '宿主布局生成约 1.6 秒',
      '后续视口请求约 30–70ms',
      '单次响应约 440–490KB',
      '星详情按需请求完整记录',
      '不加载视口外的星',
    ],
  },
  {
    key: 'web',
    name: 'A_site',
    tags: ['A_site', '前端', 'SEO', '部署', '性能'],
    files: ['A_site/src/app/page.tsx', 'A_site/src/components', 'A_site/next.config.js', 'A_site/public'],
    modules: ['App Router', 'metadata', 'sitemap', '图片优化', '构建缓存'],
    titles: ['A_site 构建缓存', '首屏字体加载', 'SEO 元数据', '图片懒加载', '路由预取', '部署回滚', '环境变量注入', 'CDN 缓存', '移动端布局', '错误页处理'],
    actions: [
      '构建缓存命中时首屏构建时间明显下降',
      '字体使用 display: swap 避免阻塞文本',
      'metadata 需要为每个动态路由生成',
      '图片组件默认开启懒加载与尺寸占位',
      '部署失败时回滚到上一个静态产物',
    ],
    details: [
      'Next.js 构建日志里会出现大量静态路由',
      'CDN 缓存策略按 hash 资源与 HTML 分开',
      '环境变量必须在构建时注入',
      '移动端断点以 768px 为主',
    ],
  },
  {
    key: 'rainai',
    name: 'RainAI',
    tags: ['RainAI', '推理', '模型', 'GPU', 'API'],
    files: ['RainAI/server/inference.py', 'RainAI/configs/model.yaml', 'RainAI/api/routes.py', 'RainAI/deploy'],
    modules: ['推理队列', '模型加载', 'GPU 显存', '超时重试', '流式响应'],
    titles: ['RainAI 超时重试', '模型显存峰值', '流式响应中断', '推理队列积压', 'GPU 温度告警', '批处理大小', '模型热加载', 'API 限流', '错误码映射', '日志脱敏'],
    actions: [
      '推理请求超过 30 秒会触发一次重试',
      '批处理大小提高后显存峰值明显上升',
      '流式响应在客户端断连时需要主动取消',
      '队列积压超过阈值会拒绝低优先级请求',
      '模型热加载期间旧版本继续服务',
    ],
    details: [
      '重试必须带幂等键，避免重复计费',
      '显存不足时优先降低 batch size',
      'GPU 温度超过 80 度开始降频',
      '错误码 429 与 503 需要区分',
    ],
  },
  {
    key: 'yuanxin',
    name: '缘芯',
    tags: ['缘芯', '产品', '需求', '交互', '体验'],
    files: ['缘芯/需求池.md', '缘芯/交互稿.fig', '缘芯/发布计划.md', '缘芯/用户访谈'],
    modules: ['需求评审', '交互流程', '用户访谈', '发布节奏', '空状态'],
    titles: ['缘芯空状态文案', '首次使用引导', '需求优先级', '用户访谈样本', '发布节奏', '交互反馈延迟', '错误提示语气', '设置项分组', '新手路径', '数据可删除性'],
    actions: [
      '首次引导只出现一次，允许跳过',
      '空状态需要说明下一步能做什么',
      '需求优先级按影响面与实现成本排序',
      '错误提示避免使用责备性语气',
      '所有用户数据都提供明确删除入口',
    ],
    details: [
      '用户访谈里高频提到“不知道下一步”',
      '删除确认需要说明影响范围',
      '发布节奏保持两周一个小版本',
      '新手路径不超过三步',
    ],
  },
  {
    key: 'jiaob',
    name: 'jiaob',
    tags: ['jiaob', '脚本', '自动化', '构建', '任务'],
    files: ['jiaob/scripts/build.mjs', 'jiaob/scripts/release.mjs', 'jiaob/config.json', 'jiaob/.github/workflows'],
    modules: ['构建脚本', '发布脚本', '任务编排', '缓存', '日志'],
    titles: ['jiaob 发布脚本', '构建缓存失效', '任务并行度', '日志截断', '失败重试', '版本号同步', '产物校验', '环境隔离', '定时任务', '清理策略'],
    actions: [
      '发布脚本先跑完整回归再打 tag',
      '任务并行度超过 4 后收益下降',
      '日志超过 2MB 只保留尾部',
      '失败任务最多重试两次并保留现场',
      '版本号需要同时更新 package 与 manifest',
    ],
    details: [
      '清理策略默认保留最近 5 份备份',
      '环境隔离依赖独立的数据目录',
      '产物校验使用 sha256',
      '定时任务避免与手动发布并发',
    ],
  },
  {
    key: 'ops',
    name: '运维与环境',
    tags: ['Windows', 'SSH', 'Docker', '网络', '备份'],
    files: ['C:/Users/fongwuyan/.ssh/config', 'docker-compose.yml', 'scripts/backup.ps1', 'C:/Users/fongwuyan/.dsh'],
    modules: ['SSH', '端口转发', 'Docker', '备份', '日志'],
    titles: ['SSH 端口转发', 'Windows 路径转义', 'Docker 卷挂载', '备份保留策略', '端口占用排查', '代理绕过', '日志轮转', '目录权限', '进程残留', '网络超时'],
    actions: [
      'SSH 隧道需要同时指定本地与远端端口',
      'Windows 路径在 PowerShell 中要使用反斜杠',
      'Docker 卷挂载后宿主机权限会影响写入',
      '端口占用时先用 netstat 定位进程',
      '备份保留最近 5 份并按时间排序',
    ],
    details: [
      '代理绕过通常通过 NO_PROXY 配置',
      '日志轮转按大小与天数双重触发',
      '进程残留会持有数据目录锁',
      '网络超时优先检查 DNS 与防火墙',
    ],
  },
  {
    key: 'workflow',
    name: '协作与偏好',
    tags: ['偏好', '工作流', '沟通', '验证', '规范'],
    files: ['会话记录', '项目约定.md', 'AGENTS.md', '团队规范.md'],
    modules: ['沟通习惯', '验证流程', '代码评审', '命名约定', '交付标准'],
    titles: ['偏好先验证再继续', '短指令执行', '中文界面优先', '改动后看截图', '低打扰提醒', '先读代码再改', '失败要复现', '提交信息格式', '避免缓存解释', '交付附结果'],
    actions: [
      '用户偏好先给出可验证结果，再补充解释',
      '短指令通常意味着直接执行，不需要反复确认',
      '界面修改后应实际截图验证',
      '失败命令要先复现再判断原因',
      '提交信息使用 type: summary 格式',
    ],
    details: [
      '不要用“缓存问题”解释未生效',
      '重要改动附上回归结果',
      '中文界面优先，代码注释可以英文',
      '低打扰提醒优于连续弹窗',
    ],
  },
  {
    key: 'research',
    name: '研究与评测',
    tags: ['RAG', '向量', '评测', '论文', '数据'],
    files: ['research/rag-notes.md', 'research/eval-set.jsonl', 'research/papers', 'research/benchmarks'],
    modules: ['RAG', '向量召回', '评测集', '重排', '标注'],
    titles: ['RAG 评测集构建', '向量召回基线', '重排收益评估', '标注一致性', '负样本采样', '长文档切分', '混合检索', '评测泄漏', '指标口径', '人工复核'],
    actions: [
      'RAG 评测集需要覆盖事实、偏好与时间敏感问题',
      '向量召回基线在中文短查询上召回率波动较大',
      '重排对 top5 的收益高于 top20',
      '长文档切分要保留标题与上下文',
      '混合检索需要分别评估词法与向量贡献',
    ],
    details: [
      '标注一致性用 Cohen kappa 衡量',
      '负样本避免只采样随机文档',
      '评测泄漏会显著高估效果',
      '指标口径固定为 recall@5 与 MRR',
    ],
  },
  {
    key: 'data',
    name: '数据与存储',
    tags: ['JSON', 'SQLite', '迁移', '导出', '备份'],
    files: ['data/maps', 'data/backups', 'scripts/migrate.mjs', 'schemas/map.schema.json'],
    modules: ['快照', 'journal', '迁移', '导出', '压缩'],
    titles: ['地图快照格式', 'journal 回放', '导出重复检测', '迁移前备份', '压缩阈值', '临时文件原子写', '地图删除清理', '索引缓存失效', '备份校验', '数据目录迁移'],
    actions: [
      '地图快照使用临时文件加原子替换',
      '单星写入追加 journal，启动时回放',
      'journal 超过 8MB 自动压缩回快照',
      '地图删除时同时清理 journal 与布局缓存',
      '迁移前自动生成 zip 备份',
    ],
    details: [
      '临时文件名包含进程与随机数',
      '回放时忽略损坏的尾部记录',
      '导出前要合并 journal 状态',
      '备份保留最近 5 份',
    ],
  },
];

const TYPES = [
  ['fact', 34],
  ['preference', 18],
  ['decision', 14],
  ['event', 11],
  ['entity', 9],
  ['procedure', 14],
];
const TITLE_VARIANTS = [
  '阈值',
  '边界',
  '回放',
  '缓存',
  '并发',
  '回归',
  '排查',
  '复盘',
  '发布后',
  '移动端',
  '极端量',
  '旧版',
  '误报',
  '降级',
  '异常',
  '迁移',
  '验收',
  '监控',
  '超时',
  '重试',
  '分层',
  '灰度',
  '性能',
  '兼容',
  '恢复',
  '重入',
  '空状态',
  '首次',
  '长尾',
  '高频',
];
const TYPE_LABEL = { fact: '事实', preference: '偏好', decision: '决策', event: '事件', entity: '实体', procedure: '经验' };
const RELATIONS = [
  ['related', 52],
  ['supports', 20],
  ['derived', 11],
  ['part-of', 10],
  ['contradicts', 4],
  ['supersedes', 3],
];
const METRICS = ['P95 1.8s', 'P50 24ms', '平均 86ms', '最坏 2.4s', '峰值 1.2GB', '缓存命中 92%', '内存增长 18%'];
const CONTEXTS = ['10 万星图', '低内存机器', 'Windows 11', '高频召回', '移动端网络', '首次启动', '冷缓存', '并发写入'];
const OUTCOMES = ['出现明显抖动', '保持稳定', '需要降级', '产生 3 次重试', '触发一次重建', '回退到旧路径', '没有复现'];
const ERRORS = [
  'ECONNRESET',
  'ENOENT: temp file missing',
  'TypeError: undefined is not iterable',
  '429 Too Many Requests',
  'SQLITE_BUSY',
  'out of memory',
];

function weighted(list) {
  const total = list.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = random() * total;
  for (const [value, weight] of list) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return list[0][0];
}

function domainFor(index) {
  if (chance(0.12)) return pick(DOMAINS);
  return DOMAINS[index % DOMAINS.length];
}

function makeFact(domain, index, type) {
  const file = pick(domain.files);
  const module = pick(domain.modules);
  const action = pick(domain.actions);
  const detail = pick(domain.details);
  const ticket = `MEM-${1000 + index}`;
  const variants = [
    `在 ${file} 的 ${module} 中，${action}；${detail}。`,
    `${action}。${detail}，相关记录见 ${ticket}。`,
    `经验（${domain.name}）：${action}。${detail}。`,
    `${ticket}：${action}；${detail}。`,
    `评审结论：${action}，原因是${detail}。`,
    `The ${module} path: ${action}. ${detail}.`,
    `排查记录：${action}，同时确认${detail}。`,
    `已确认：${action}。如果条件变化，需要重新验证${detail}。`,
    `实测 ${pick(METRICS)}，在${pick(CONTEXTS)}下${pick(OUTCOMES)}；${ticket}。`,
    `现场日志出现 ${pick(ERRORS)}；${action}。${detail}。`,
    `在${pick(CONTEXTS)}环境下，${action}；${detail}。`,
  ];
  return clip(pick(variants), 118);
}

function makeHistory(star, created, updated, version) {
  const history = [];
  for (let v = 2; v <= version; v += 1) {
    const at = created + Math.floor(((updated - created) * (v - 1)) / Math.max(1, version - 1));
    const field = pick(['fact', 'tags', 'confidence', 'status', 'importance']);
    const changes = [
      {
        field,
        from:
          field === 'tags'
            ? [pick(star.tags)]
            : field === 'status'
              ? 'pending'
              : field === 'fact'
                ? clip(`${star.fact}（旧版）`, 80)
                : 0.5,
        to:
          field === 'tags'
            ? star.tags
            : field === 'status'
              ? star.status
              : field === 'fact'
                ? star.fact
                : star.confidence,
      },
    ];
    history.push({
      version: v,
      at: iso(at),
      by: chance(0.65) ? 'model' : 'user',
      changes,
      ...(chance(0.3) ? { reason: pick(['补充细节', '纠正误记', '用户确认', '复盘更新']) } : {}),
    });
  }
  return history;
}

function createStar(index) {
  const domain = domainFor(index);
  const type = weighted(TYPES);
  const created = NOW - int(30, 980) * DAY;
  const updated = Math.min(NOW - 60000, created + int(0, 120) * DAY);
  const statusRoll = random();
  const status =
    statusRoll < 0.86 ? 'active' : statusRoll < 0.92 ? 'pending' : statusRoll < 0.97 ? 'archived' : 'active';
  const disputed = status === 'active' && chance(0.035);
  const confidence =
    status === 'pending'
      ? 0.3 + random() * 0.4
      : status === 'archived'
        ? 0.55 + random() * 0.4
        : 0.62 + random() * 0.37;
  const importance = 0.15 + random() * 0.83;
  const recallCount = chance(0.28) ? Math.floor(Math.pow(random(), 2.6) * 90) : 0;
  const version = 1 + (chance(0.28) ? int(1, 6) : 0);
  const title = clip(`${pick(domain.titles)}·${pick(TITLE_VARIANTS)}`, 20);
  const fact = makeFact(domain, index, type);
  const tags = [...new Set([pick(domain.tags), pick(domain.tags), TYPE_LABEL[type]])].slice(0, 4);
  const refs = [
    pick(domain.files),
    `MEM-${1000 + index}`,
    ...(chance(0.25) ? [`https://github.com/fongwuyan/${pick(['Rian-Memory-Star-Path', 'RainAI', 'A_site'])}`] : []),
  ].slice(0, 4);
  const star = {
    id: `st_real_${index}`,
    mapId: null,
    title,
    fact,
    reason: chance(0.32) ? clip(pick(domain.details), 118) : '',
    condition: chance(0.24) ? clip(`当${pick(['项目升级', '数据量超过 1 万', '用户切换主题', '服务重启', '部署回滚'])}时`, 90) : '',
    type,
    tags,
    refs,
    importance,
    confidence,
    status,
    disputed,
    source: { kind: chance(0.72) ? 'model' : 'user' },
    anchor: undefined,
    createdAt: iso(created),
    updatedAt: iso(updated),
    lastRecalledAt: recallCount ? iso(NOW - int(0, 75) * DAY) : null,
    recallCount,
    validUntil: type === 'decision' && chance(0.18) ? iso(NOW + int(30, 540) * DAY) : null,
    pinned: chance(0.012),
    version,
    history: [],
    mergedFrom: chance(0.035)
      ? [
          {
            title: clip(`${pick(domain.titles)}旧`, 20),
            fact: clip(`${fact}（早期版本）`, 100),
            at: iso(created + int(10, 200) * DAY),
            source: pick(['model', 'import', 'conflict']),
          },
        ]
      : [],
    ...(status === 'archived' ? { archivedAt: iso(updated) } : {}),
  };
  star.history = makeHistory(star, created, updated, version);
  return star;
}

const stars = [];
for (let index = 0; index < SIZE; index += 1) stars.push(createStar(index));

// Crafted contradiction, superseded and near-duplicate pairs.
let specialIndex = 0;
function addSpecial(star) {
  specialIndex += 1;
  stars.push({ ...star, id: `st_special_${specialIndex}` });
  return stars[stars.length - 1];
}
const conflictPairs = [];
for (let index = 0; index < 90; index += 1) {
  const topic = pick(['包管理器选择', 'Node 版本', '数据库选型', '部署方式', '主题默认值', '索引策略']);
  const variant = index % 2 === 0 ? 'npm' : 'pnpm';
  const created = NOW - int(120, 700) * DAY;
  const left = addSpecial({
    mapId: null,
    title: clip(`${topic}方案`, 20),
    fact: clip(`项目使用 ${variant}，因为与现有锁文件兼容；#${index}A。`, 118),
    reason: '历史项目约束', condition: '', type: 'decision', tags: ['工具链', '冲突', '决策'],
    refs: [`MEM-${3000 + index}`], importance: 0.55 + random() * 0.3,
    confidence: 0.9, status: 'active', disputed: false,
    source: { kind: 'model' }, createdAt: iso(created), updatedAt: iso(created + DAY),
    lastRecalledAt: null, recallCount: int(2, 20), validUntil: null, pinned: false,
    version: 1, history: [], mergedFrom: [],
  });
  const right = addSpecial({
    mapId: null,
    title: clip(`${topic}方案`, 20),
    fact: clip(`项目改用 ${variant === 'npm' ? 'pnpm' : 'npm'}，旧方案已不再适用；#${index}B。`, 118),
    reason: '新环境验证结果', condition: '', type: 'decision', tags: ['工具链', '冲突', '决策'],
    refs: [`MEM-${3000 + index}`], importance: 0.55 + random() * 0.3,
    confidence: 0.86, status: 'active', disputed: false,
    source: { kind: 'user' }, createdAt: iso(created + 7 * DAY), updatedAt: iso(created + 30 * DAY),
    lastRecalledAt: null, recallCount: int(1, 15), validUntil: null, pinned: false,
    version: 2, history: [], mergedFrom: [],
  });
  conflictPairs.push([left.id, right.id]);
}
const supersededPairs = [];
for (let index = 0; index < 70; index += 1) {
  const topic = pick(['接口返回格式', '缓存策略', '日志字段', '错误码', '权限模型']);
  const created = NOW - int(300, 900) * DAY;
  const oldStar = addSpecial({
    mapId: null, title: clip(`${topic}旧版`, 20),
    fact: clip(`旧实现采用 v1 格式；记录 #${index}old。`, 118),
    reason: '', condition: '', type: 'fact', tags: ['历史', '已取代'],
    refs: [`MEM-${4000 + index}`], importance: 0.4, confidence: 0.8,
    status: 'archived', disputed: false, source: { kind: 'model' },
    createdAt: iso(created), updatedAt: iso(created + 20 * DAY),
    archivedAt: iso(created + 60 * DAY), lastRecalledAt: null, recallCount: 0,
    validUntil: null, pinned: false, version: 2, history: [], mergedFrom: [],
  });
  const newStar = addSpecial({
    mapId: null, title: clip(`${topic}新版`, 20),
    fact: clip(`新实现采用 v2 格式，并兼容旧客户端；记录 #${index}new。`, 118),
    reason: '', condition: '', type: 'fact', tags: ['当前', '版本'],
    refs: [`MEM-${4000 + index}`], importance: 0.7, confidence: 0.95,
    status: 'active', disputed: false, source: { kind: 'user' },
    createdAt: iso(created + 70 * DAY), updatedAt: iso(created + 90 * DAY),
    lastRecalledAt: iso(NOW - 10 * DAY), recallCount: 5,
    validUntil: null, pinned: false, version: 1, history: [], mergedFrom: [],
  });
  supersededPairs.push([oldStar.id, newStar.id]);
}
const duplicatePairs = [];
for (let index = 0; index < 130; index += 1) {
  const domain = pick(DOMAINS);
  const created = NOW - int(100, 600) * DAY;
  const baseFact = `关于${pick(domain.tags)}的重复记录：${pick(domain.actions)}；#${index}。`;
  const left = addSpecial({
    mapId: null, title: clip(pick(domain.titles), 20), fact: clip(baseFact, 118),
    reason: '', condition: '', type: 'fact', tags: [...domain.tags.slice(0, 2), '重复'],
    refs: [`MEM-${5000 + index}`], importance: 0.45, confidence: 0.85,
    status: 'active', disputed: false, source: { kind: 'model' },
    createdAt: iso(created), updatedAt: iso(created + DAY),
    lastRecalledAt: null, recallCount: 1, validUntil: null, pinned: false,
    version: 1, history: [], mergedFrom: [],
  });
  const right = addSpecial({
    mapId: null, title: clip(pick(domain.titles), 20), fact: clip(`${baseFact}（更新）`, 118),
    reason: '', condition: '', type: 'fact', tags: [...domain.tags.slice(0, 2), '重复'],
    refs: [`MEM-${5000 + index}`], importance: 0.45, confidence: 0.88,
    status: 'active', disputed: false, source: { kind: 'model' },
    createdAt: iso(created + 8 * DAY), updatedAt: iso(created + 10 * DAY),
    lastRecalledAt: null, recallCount: 0, validUntil: null, pinned: false,
    version: 1, history: [], mergedFrom: [],
  });
  duplicatePairs.push([left.id, right.id]);
}

const edges = [];
const edgeKeys = new Set();
function addEdge(from, to, relation, extra = {}) {
  if (!from || !to || from === to) return;
  const key = `${from}|${to}|${relation}`;
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push({
    id: `ed_real_${edges.length}`,
    from,
    to,
    relation,
    ...extra,
  });
}

const byDomain = new Map();
for (const star of stars) {
  if (!star.id.startsWith('st_real_')) continue;
  const domain = DOMAINS.find((item) => item.tags.some((tag) => star.tags.includes(tag))) || DOMAINS[0];
  if (!byDomain.has(domain.key)) byDomain.set(domain.key, []);
  byDomain.get(domain.key).push(star.id);
}
for (const ids of byDomain.values()) {
  for (const id of ids) {
    const count = int(0, 3);
    for (let n = 0; n < count; n += 1) {
      const target = pick(ids);
      addEdge(id, target, weighted(RELATIONS), { createdAt: iso(NOW - int(0, 500) * DAY) });
    }
  }
}
for (let n = 0; n < 600; n += 1) {
  addEdge(pick(stars).id, pick(stars).id, 'related', { createdAt: iso(NOW - int(0, 700) * DAY) });
}
for (const [left, right] of conflictPairs) {
  addEdge(left, right, 'contradicts', { createdAt: iso(NOW - int(10, 300) * DAY) });
}
for (const [oldId, newId] of supersededPairs) {
  addEdge(oldId, newId, 'supersedes', {
    createdAt: iso(NOW - int(10, 300) * DAY),
    resolvedAt: iso(NOW - 5 * DAY),
  });
}
for (const [left, right] of duplicatePairs) {
  addEdge(left, right, 'related', { createdAt: iso(NOW - int(5, 200) * DAY) });
}

const constellations = [];
for (const domain of DOMAINS) {
  for (const tag of domain.tags.slice(0, 3)) {
    const starIds = stars
      .filter((star) => star.tags.includes(tag))
      .slice(0, 120)
      .map((star) => star.id);
    if (starIds.length < 3) continue;
    constellations.push({
      id: `co_real_${constellations.length}`,
      name: `${domain.name} · ${tag}`,
      starIds,
      createdAt: iso(NOW - int(30, 400) * DAY),
    });
  }
}

const sourceMap = {
  id: 'map_realistic_test',
  name: MAP_NAME,
  kind: 'project',
  workspaceId: null,
  createdAt: iso(NOW - 1000 * DAY),
};
const payload = {
  format: 'rian-memory-star',
  version: 1,
  exportedAt: iso(NOW),
  maps: [{ map: sourceMap, stars, edges, constellations }],
};

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const maps = await request('/maps');
if (maps.maps?.some((map) => map.name === MAP_NAME)) {
  const existing = maps.maps.find((map) => map.name === MAP_NAME);
  await request(`/maps/${encodeURIComponent(existing.id)}`, { method: 'DELETE' });
}
const created = await request('/maps', {
  method: 'POST',
  body: JSON.stringify({ name: MAP_NAME }),
});
const mapId = created.map.id;

const body = JSON.stringify(payload);
const importStarted = Date.now();
const imported = await request('/import?strategy=merge', {
  method: 'POST',
  body,
});
const importMs = Date.now() - importStarted;
const meta = await request(`/maps/${encodeURIComponent(mapId)}/meta`);

const oldMaps = await request('/maps');
const old = oldMaps.maps?.find(
  (map) => map.name === '测试星图 10w' || /10w/i.test(map.name) || /100k/i.test(map.name),
);
if (old && old.id !== mapId) {
  await request(`/maps/${encodeURIComponent(old.id)}`, { method: 'DELETE' });
}

console.log(
  JSON.stringify(
    {
      mapId,
      name: MAP_NAME,
      stars: meta.total,
      inactive: meta.inactive?.length || 0,
      edges: edges.length,
      constellations: constellations.length,
      conflicts: conflictPairs.length,
      superseded: supersededPairs.length,
      duplicates: duplicatePairs.length,
      payloadMB: (Buffer.byteLength(body) / 1024 / 1024).toFixed(1),
      importMs,
      imported,
      deletedOldMap: old ? old.name : null,
    },
    null,
    2,
  ),
);
assert.equal(meta.total + (meta.inactive?.length || 0), stars.length);

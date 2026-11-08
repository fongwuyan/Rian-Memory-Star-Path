import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { zipSync, unzipSync } from './zip.js';

const PLUGIN_ID = 'rian-memory-star-path';
const API_PREFIX = `/plugins/${PLUGIN_ID}/api-v2`;

const TYPES = ['fact', 'preference', 'decision', 'event', 'entity', 'procedure'];
const TYPE_LABEL = {
  fact: '事实',
  preference: '偏好',
  decision: '决策',
  event: '事件',
  entity: '实体',
  procedure: '经验',
};
const TYPE_IMPORTANCE = {
  fact: 0.5,
  preference: 0.7,
  decision: 0.7,
  event: 0.3,
  entity: 0.6,
  procedure: 0.6,
};
const COLORS = ['#7FD8FF', '#FFD479', '#B98CFF', '#8FE3B0', '#FF9EC4', '#9BB8FF'];

const RULES = `You have a long-term memory system called Memory Stars.

Search memories before answering when prior context may matter, and
before editing a file or running a command. Save only stable, reusable
information: explicit preferences, identity, decisions, conventions,
lessons, and important entities. Never save transient state, tool
output, code or logs, credentials, one-off instructions, or guesses.
At most 3 saves per turn; search first to avoid duplicates. When the
user says "remember this", save it with confidence 0.95. Inferred
memories go to the nebula for confirmation. Write memory content in
the user's language. If a memory conflicts with the conversation,
follow the conversation and mention the conflict.

需要背景、改文件、跑命令前，先查记忆。只存稳定可复用的信息：明确
偏好、身份、决策、约定、经验、重要实体。不存临时状态、工具输出、
代码日志、凭据、一次性指令、猜测。每轮最多 3 条，先查重。用户说
「记住」时按 0.95 存。推断的记忆进星云待确认。记忆内容用用户的
语言。记忆与当前对话冲突时，以对话为准并说明。`;

const DEFAULT_SETTINGS = {
  uiMode: 'immersive',
  theme: 'dark',
  viewMode: '2d',
  topK: 6,
  tokenBudget: 600,
  threshold: 0.15,
  rain: 'light',
  halfLifeDays: 45,
  directActiveConfidence: 0.85,
  repeatSuppressionTurns: 3,
  privacyMode: 'standard',
  customSensitiveWords: [],
  privacyIncognito: false,
  privacyOutputRedaction: true,
  noMemoryWorkspaces: [],
  noMemorySessions: [],
  exportReminder: true,
  autoBackup: true,
  journalFsync: false,
  prewarmOnBoot: true,
  prewarmScope: 'bound',
};

const CREDENTIAL_RE =
  /(?:\b(?:password|passwd|secret|api[\s_-]?key|access[\s_-]?key|private[\s_-]?key)\b\s*[:=]\s*\S+|(?:密码|口令|密钥|私钥|令牌|凭据)\s*[:=：是]\s*\S+|\bBearer\s+[A-Za-z0-9._-]{16,})/i;
const PERSONAL_RE =
  /\b1[3-9]\d{9}\b|\b[\w.+-]+@[\w-]+\.[A-Za-z]{2,}\b|\b\d{17}[\dXx]\b/;
const CREDENTIAL_REDACT_RE = new RegExp(CREDENTIAL_RE.source, 'gi');
const PERSONAL_REDACT_RE = new RegExp(PERSONAL_RE.source, 'g');

function detectSensitive(text, mode = 'standard', customWords = []) {
  const value = String(text || '');
  if (CREDENTIAL_RE.test(value)) return 'credentials';
  const words = (Array.isArray(customWords) ? customWords : [])
    .map((word) => String(word).trim())
    .filter(Boolean);
  if (words.some((word) => value.toLowerCase().includes(word.toLowerCase()))) {
    return 'custom';
  }
  if (mode !== 'credentials' && PERSONAL_RE.test(value)) return 'personal';
  if (mode === 'strict' && /https?:\/\/[^:\s]+:[^@\s]+@/i.test(value)) {
    return 'credentials';
  }
  return null;
}

const PLUGIN_VERSION = '0.0.2';
let HALF_LIFE_DAYS = 45;

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function charCount(value) {
  return Array.from(String(value ?? '')).length;
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function tokensOf(text) {
  const normalized = String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const out = new Set();
  const chunks = normalized.match(/[\u3400-\u9fff]+|[a-z0-9_]+/g) ?? [];
  for (const chunk of chunks) {
    if (/[\u3400-\u9fff]/.test(chunk)) {
      if (chunk.length === 1) out.add(chunk);
      for (let i = 0; i + 1 < chunk.length; i += 1) out.add(chunk.slice(i, i + 2));
    } else {
      out.add(chunk);
      for (const part of chunk.split(/[_-]+/)) {
        if (part) out.add(part);
      }
    }
  }
  return out;
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  const small = a.size <= b.size ? a : b;
  const large = a.size <= b.size ? b : a;
  for (const term of small) if (large.has(term)) common += 1;
  return (2 * common) / (a.size + b.size);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function diffFields(before, after, fields) {
  const changes = [];
  for (const field of fields) {
    const from = before[field];
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}

function normalizeMergeKey(title, fact) {
  return `${String(title || '').trim().toLowerCase()}\u0000${String(fact || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')}`;
}

function recordStarHistory(star, by, changes) {
  const meaningful = (changes || []).filter(
    (change) => JSON.stringify(change.from) !== JSON.stringify(change.to),
  );
  if (!meaningful.length) return;
  if (!Array.isArray(star.history)) star.history = [];
  star.history.push({
    version: Number(star.version || 1),
    at: nowIso(),
    by,
    changes: meaningful,
  });
  if (star.history.length > 50) star.history = star.history.slice(-50);
}

function isSensitive(text) {
  const patterns = [
    /\bsk-[A-Za-z0-9]{16,}\b/,
    /\bghp_[A-Za-z0-9]{20,}\b/,
    /\bAKIA[A-Z0-9]{16}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bpassword\s*[:=]/i,
    /\b\d{17}[\dXx]\b/,
    /\b\d{16,19}\b/,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function isInstructionLike(text) {
  const patterns = [
    /ignore\s+(all\s+)?previous/i,
    /^system\s*:/im,
    /you\s+are\s+now/i,
    /请忽略/,
    /从现在开始/,
    /忽略(以上|之前|前面)/,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

export const name = PLUGIN_ID;
export const inject = ['tools', 'systemPrompt', 'agents', 'sessions', 'workspaceRegistry', 'webServer'];

export function apply(ctx) {
  let dataDir = '';
  let mapsDir = '';
  let backupsDir = '';
  let indexPath = '';
  let bindingsPath = '';
  let settingsPath = '';
  let lockPath = '';
  let lockToken = '';
  let lockOwned = false;
  const legacyDataDir = path.join(os.homedir(), '.dsh', 'plugin-data', PLUGIN_ID);

  const index = { version: 1, publicMapId: '', maps: [] };
  const maps = new Map();
  const pageCache = new Map();
  const bindings = new Map();
  const recallCache = new Map();
  const turnTrace = new Map();
  const recentRecalls = new Map();
  const recallLog = new Map();
  const metrics = {
    searches: 0,
    saves: 0,
    recalls: 0,
    briefs: 0,
    indexRebuilds: 0,
    indexSyncs: 0,
    indexPrewarms: 0,
    journalAppends: 0,
    statsJournalAppends: 0,
    journalCompactions: 0,
    layoutBuilds: 0,
    lastLayoutMs: 0,
    viewportRequests: 0,
    searchCandidates: 0,
    graphExpansions: 0,
    usedFeedback: 0,
    ignoredFeedback: 0,
    wrongFeedback: 0,
    lastSearchMs: 0,
    lastIndexMs: 0,
    lastSearchAt: null,
    lastSaveAt: null,
    lastRecallAt: null,
  };
  const saveTimers = new Map();
  const statsTimers = new Map();
  const journalBytes = new Map();
  const pendingStarSaves = new Map();
  const pendingFullSaves = new Set();
  const pendingStats = new Map();
  const indexCache = new Map();
  const layoutCache = new Map();
  const prewarming = new Set();
  let starLocator = null;
  const dirtyIndex = new Set();
  const dirtyStars = new Map();
  const writeQueues = new Map();
  let settings = { ...DEFAULT_SETTINGS };
  let bootError = null;

  const ready = boot()
    .then(() => createAutoBackup())
    .then(async () => {
      if (settings.prewarmOnBoot === false) return;
      const warmIds = new Set([index.publicMapId, ...bindings.values()]);
      for (const map of index.maps) {
        const data = maps.get(map.id);
        if (!data || data.stars.length < 2000) continue;
        if (settings.prewarmScope !== 'all' && !warmIds.has(map.id)) continue;
        try {
          await prewarmIndex(map.id);
        } catch (error) {
          console.error('[memory-star] index prewarm failed', error);
        }
      }
    })
    .catch(async (error) => {
      bootError = error;
      await releaseProfileLock();
      console.error('[memory-star] boot failed', error);
    });

  function mapPath(mapId) {
    return path.join(mapsDir, `${mapId}.json`);
  }

  function journalPath(mapId) {
    return `${mapPath(mapId)}.journal.ndjson`;
  }

  async function replayMapJournal(mapId, data) {
    let raw = '';
    try {
      raw = await fs.readFile(journalPath(mapId), 'utf8');
    } catch {
      return;
    }
    journalBytes.set(mapId, Buffer.byteLength(raw));
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record?.op === 'upsert' && record.star?.id) {
        const star = { ...record.star, mapId };
        const position = data.stars.findIndex((item) => item.id === star.id);
        if (position >= 0) data.stars[position] = star;
        else data.stars.push(star);
      } else if (record?.op === 'stats' && record.id) {
        const star = data.stars.find((item) => item.id === record.id);
        if (star) {
          if (Number.isFinite(record.recallCount)) star.recallCount = record.recallCount;
          if (record.lastRecalledAt) star.lastRecalledAt = record.lastRecalledAt;
        }
      } else if (record?.op === 'edge.upsert' && record.edge?.id) {
        data.edges = data.edges || [];
        const edge = record.edge;
        const position = data.edges.findIndex((item) => item.id === edge.id);
        if (position >= 0) data.edges[position] = edge;
        else data.edges.push(edge);
      } else if (record?.op === 'edge.delete' && record.id) {
        data.edges = (data.edges || []).filter((edge) => edge.id !== record.id);
      } else if (record?.op === 'constellation.upsert' && record.constellation?.id) {
        data.constellations = data.constellations || [];
        const constellation = record.constellation;
        const position = data.constellations.findIndex(
          (item) => item.id === constellation.id,
        );
        if (position >= 0) data.constellations[position] = constellation;
        else data.constellations.push(constellation);
      } else if (record?.op === 'constellation.delete' && record.id) {
        data.constellations = (data.constellations || []).filter(
          (constellation) => constellation.id !== record.id,
        );
      } else if (record?.op === 'delete' && record.id) {
        data.stars = data.stars.filter((star) => star.id !== record.id);
        data.edges = (data.edges || []).filter(
          (edge) => edge.from !== record.id && edge.to !== record.id,
        );
        for (const constellation of data.constellations || []) {
          constellation.starIds = (constellation.starIds || []).filter(
            (starId) => starId !== record.id,
          );
        }
      }
    }
  }

  async function createAutoBackup() {
    if (settings.autoBackup === false) return;
    try {
      await fs.mkdir(backupsDir, { recursive: true });
      const stars = [...maps.values()].reduce((sum, data) => sum + data.stars.length, 0);
      const edges = [...maps.values()].reduce((sum, data) => sum + data.edges.length, 0);
      const history = [...maps.values()].reduce(
        (sum, data) =>
          sum + data.stars.reduce((inner, star) => inner + (star.history?.length || 0), 0),
        0,
      );
      const files = {
        'manifest.json': JSON.stringify(
          {
            format: 'rian-memory-star',
            version: 1,
            schemaVersion: 1,
            kind: 'auto-backup',
            exportedAt: nowIso(),
            maps: index.maps.map((map) => ({
              id: map.id,
              name: map.name,
              kind: map.kind,
              starCount: maps.get(map.id)?.stars.length || 0,
            })),
            counts: {
              maps: index.maps.length,
              stars,
              edges,
              history,
            },
          },
          null,
          2,
        ),
        'settings.json': JSON.stringify(settings, null, 2),
        'bindings.json': JSON.stringify(Object.fromEntries(bindings), null, 2),
      };
      for (const data of maps.values()) {
        files[`maps/${data.map.id}.json`] = JSON.stringify(data, null, 2);
      }
      const archive = zipSync(files);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(path.join(backupsDir, `backup-${stamp}.zip`), archive);
      const existing = (await fs.readdir(backupsDir))
        .filter((name) => name.endsWith('.zip'))
        .sort();
      while (existing.length > 5) {
        const oldest = existing.shift();
        await fs.unlink(path.join(backupsDir, oldest));
      }
    } catch (error) {
      console.error('[memory-star] auto backup failed', error);
    }
  }

  function makeMap(name, kind, workspaceId) {
    return {
      id: uid('map'),
      name,
      kind,
      color: COLORS[index.maps.length % COLORS.length],
      workspaceId: workspaceId || undefined,
      createdAt: nowIso(),
      schemaVersion: 1,
    };
  }

  function enqueueWrite(key, operation) {
    const previous = writeQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    writeQueues.set(key, next);
    next
      .finally(() => {
        if (writeQueues.get(key) === next) writeQueues.delete(key);
      })
      .catch(() => {});
    return next;
  }

  async function writeJsonAtomic(target, value) {
    const tmp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
      await fs.rename(tmp, target);
    } catch (error) {
      await fs.unlink(tmp).catch(() => {});
      throw error;
    }
  }

  function persistIndex() {
    return enqueueWrite('index', () => writeJsonAtomic(indexPath, index));
  }

  function persistMap(mapId) {
    pageCache.delete(mapId);
    const statsTimer = statsTimers.get(mapId);
    if (statsTimer) {
      clearTimeout(statsTimer);
      statsTimers.delete(mapId);
    }
    pendingStats.delete(mapId);
    return enqueueWrite(`map:${mapId}`, async () => {
      const data = maps.get(mapId);
      if (!data) return undefined;
      await writeJsonAtomic(mapPath(mapId), data);
      await fs.unlink(journalPath(mapId)).catch(() => {});
      journalBytes.delete(mapId);
      return undefined;
    });
  }

  function persistBindings() {
    return enqueueWrite('bindings', () =>
      writeJsonAtomic(bindingsPath, Object.fromEntries(bindings)),
    );
  }

  function persistSettings() {
    return enqueueWrite('settings', () => writeJsonAtomic(settingsPath, settings));
  }

  function previewEntries(entries) {
    const mapsPreview = entries.map((entry) => {
      const name = String(entry?.map?.name || '');
      const existing = index.maps.find((map) => map.name === name);
      return {
        name,
        starCount: (entry.stars || []).length,
        existingId: existing?.id || null,
      };
    });
    return {
      maps: mapsPreview,
      hasConflict: mapsPreview.some((item) => item.existingId),
    };
  }

  function importedStarBlockReason(star) {
    const probe = [
      star?.title ?? '',
      star?.fact ?? '',
      star?.reason ?? '',
      star?.condition ?? '',
      Array.isArray(star?.tags) ? star.tags.join(' ') : '',
      Array.isArray(star?.refs) ? star.refs.join(' ') : '',
    ].join('\n');
    if (
      detectSensitive(probe, settings.privacyMode, settings.customSensitiveWords) ||
      isSensitive(probe)
    ) {
      return 'sensitive';
    }
    if (isInstructionLike(probe)) return 'instruction';
    return null;
  }

  async function importMapEntries(entries, strategy = 'copy', options = {}) {
    let importedMaps = 0;
    let importedStars = 0;
    let importedEdges = 0;
    let mergedMaps = 0;
    let mergedStars = 0;
    let blockedSensitive = 0;
    let blockedInstruction = 0;
    const sanitize = options.sanitize !== false;
    const filterStars = (stars) =>
      (stars || []).filter((star) => {
        if (!sanitize) return true;
        const reason = importedStarBlockReason(star);
        if (reason === 'sensitive') blockedSensitive += 1;
        if (reason === 'instruction') blockedInstruction += 1;
        return !reason;
      });
    for (const entry of entries) {
      const sourceMap = entry?.map || {};
      const sourceName = String(sourceMap.name || '导入星图');
      if (strategy === 'merge') {
        const existing = index.maps.find((map) => map.name === sourceName);
        const target = existing ? maps.get(existing.id) : null;
        if (target) {
          target.stars = target.stars || [];
          target.edges = target.edges || [];
          target.constellations = target.constellations || [];
          const byKey = new Map();
          for (const star of target.stars) {
            byKey.set(normalizeMergeKey(star.title, star.fact), star);
          }
          const starIdMap = new Map();
          for (const star of filterStars(entry.stars)) {
            const key = normalizeMergeKey(star.title, star.fact);
            const found = byKey.get(key);
            if (found) {
              starIdMap.set(star.id, found.id);
              const before = {
                tags: found.tags,
                refs: found.refs,
                confidence: found.confidence,
              };
              found.tags = [
                ...new Set([...(found.tags || []), ...(star.tags || [])]),
              ].slice(0, 5);
              found.refs = [
                ...new Set([...(found.refs || []), ...(star.refs || [])]),
              ].slice(0, 5);
              found.confidence = Math.max(
                Number(found.confidence || 0),
                Number(star.confidence || 0),
              );
              found.recallCount = Math.max(
                Number(found.recallCount || 0),
                Number(star.recallCount || 0),
              );
              found.mergedFrom = Array.isArray(found.mergedFrom) ? found.mergedFrom : [];
              found.mergedFrom.push({
                title: star.title || found.title,
                fact: star.fact || found.fact,
                at: nowIso(),
                source: 'import',
              });
              if (found.mergedFrom.length > 10) {
                found.mergedFrom = found.mergedFrom.slice(-10);
              }
              const changes = diffFields(before, found, ['tags', 'refs', 'confidence']);
              if (changes.length) {
                found.updatedAt = nowIso();
                found.version = Number(found.version || 1) + 1;
                recordStarHistory(found, 'user', changes);
              }
              mergedStars += 1;
            } else {
              const id = uid('st');
              starIdMap.set(star.id, id);
              target.stars.push({
                ...star,
                id,
                mapId: target.map.id,
                anchor: undefined,
              });
              importedStars += 1;
            }
          }
          for (const edge of entry.edges || []) {
            const from = starIdMap.get(edge.from);
            const to = starIdMap.get(edge.to);
            if (!from || !to) continue;
            if (
              target.edges.some(
                (item) => item.from === from && item.to === to && item.relation === edge.relation,
              )
            ) {
              continue;
            }
            target.edges.push({ ...edge, id: uid('ed'), from, to });
            importedEdges += 1;
          }
          for (const constellation of entry.constellations || []) {
            const starIds = (constellation.starIds || [])
              .map((id) => starIdMap.get(id))
              .filter(Boolean);
            if (!starIds.length) continue;
            const existingConstellation = target.constellations.find(
              (item) => item.name === constellation.name,
            );
            if (existingConstellation) {
              existingConstellation.starIds = [
                ...new Set([...(existingConstellation.starIds || []), ...starIds]),
              ];
            } else {
              target.constellations.push({
                ...constellation,
                id: uid('co'),
                mapId: target.map.id,
                starIds,
              });
            }
          }
          invalidateIndex(target.map.id);
          layoutCache.delete(target.map.id);
          await persistMap(target.map.id);
          mergedMaps += 1;
          continue;
        }
      }
      const suffix = strategy === 'merge' ? '' : '（导入）';
      const map = makeMap(`${sourceName}${suffix}`, 'project', null);
      const starIdMap = new Map();
      const stars = filterStars(entry.stars).map((star) => {
        const id = uid('st');
        starIdMap.set(star.id, id);
        return {
          ...star,
          id,
          mapId: map.id,
          anchor: undefined,
        };
      });
      const edges = (entry.edges || [])
        .map((edge) => {
          const from = starIdMap.get(edge.from);
          const to = starIdMap.get(edge.to);
          if (!from || !to) return null;
          return { ...edge, id: uid('ed'), from, to };
        })
        .filter(Boolean);
      const constellations = (entry.constellations || []).map((constellation) => ({
        ...constellation,
        id: uid('co'),
        mapId: map.id,
        starIds: (constellation.starIds || [])
          .map((starId) => starIdMap.get(starId))
          .filter(Boolean),
      }));
      maps.set(map.id, { map, stars, edges, constellations });
      index.maps.push(map);
      await persistMap(map.id);
      importedMaps += 1;
      importedStars += stars.length;
      importedEdges += edges.length;
    }
    await persistIndex();
    return {
      maps: importedMaps,
      stars: importedStars,
      edges: importedEdges,
      mergedMaps,
      mergedStars,
      blockedSensitive,
      blockedInstruction,
    };
  }

  function scheduleMapSave(mapId, starId) {
    if (starId) {
      let ids = pendingStarSaves.get(mapId);
      if (!ids) {
        ids = new Set();
        pendingStarSaves.set(mapId, ids);
      }
      ids.add(starId);
    } else {
      pendingFullSaves.add(mapId);
      pendingStarSaves.delete(mapId);
    }
    const current = saveTimers.get(mapId);
    if (current) clearTimeout(current);
    saveTimers.set(
      mapId,
      setTimeout(() => {
        saveTimers.delete(mapId);
        const ids = pendingStarSaves.get(mapId);
        const full = pendingFullSaves.delete(mapId);
        pendingStarSaves.delete(mapId);
        const write =
          !full && ids && ids.size ? persistStarDelta(mapId, ids) : persistMap(mapId);
        write.catch((error) => console.error('[memory-star] save map failed', error));
      }, 300),
    );
  }

  async function appendJournalFile(file, payload) {
    if (!settings.journalFsync) {
      await fs.appendFile(file, payload, 'utf8');
      return;
    }
    const handle = await fs.open(file, 'a');
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  function appendJournalRecords(mapId, records) {
    if (!mapId || !records.length) return Promise.resolve();
    pageCache.delete(mapId);
    return enqueueWrite(`map:${mapId}`, async () => {
      const payload = records.map((record) => `${JSON.stringify(record)}\n`).join('');
      await appendJournalFile(journalPath(mapId), payload);
      const nextBytes = (journalBytes.get(mapId) || 0) + Buffer.byteLength(payload);
      journalBytes.set(mapId, nextBytes);
      metrics.journalAppends += 1;
      if (nextBytes > 8 * 1024 * 1024) {
        metrics.journalCompactions += 1;
        setTimeout(() => {
          persistMap(mapId).catch((error) =>
            console.error('[memory-star] compact journal failed', error),
          );
        }, 0);
      }
    });
  }

  function persistEdgeDelta(mapId, upserts = [], deletes = []) {
    const records = [];
    for (const edge of upserts) {
      if (edge?.id) records.push({ op: 'edge.upsert', edge });
    }
    for (const id of deletes) {
      if (id) records.push({ op: 'edge.delete', id });
    }
    return appendJournalRecords(mapId, records);
  }

  function persistConstellationDelta(mapId, upserts = [], deletes = []) {
    const records = [];
    for (const constellation of upserts) {
      if (constellation?.id) records.push({ op: 'constellation.upsert', constellation });
    }
    for (const id of deletes) {
      if (id) records.push({ op: 'constellation.delete', id });
    }
    return appendJournalRecords(mapId, records);
  }

  function persistStarDelta(mapId, starIds) {    pageCache.delete(mapId);
    return enqueueWrite(`map:${mapId}`, async () => {
      const data = maps.get(mapId);
      if (!data) return;
      const byId =
        starIds.size > 200
          ? new Map(data.stars.map((star) => [star.id, star]))
          : null;
      const lines = [];
      for (const starId of starIds) {
        const star = byId ? byId.get(starId) : data.stars.find((item) => item.id === starId);
        lines.push(
          `${JSON.stringify(star ? { op: 'upsert', star } : { op: 'delete', id: starId })}\n`,
        );
      }
      const payload = lines.join('');
      await appendJournalFile(journalPath(mapId), payload);
      const nextBytes = (journalBytes.get(mapId) || 0) + Buffer.byteLength(payload);
      journalBytes.set(mapId, nextBytes);
      metrics.journalAppends += 1;
      if (nextBytes > 8 * 1024 * 1024) {
        metrics.journalCompactions += 1;
        setTimeout(() => {
          persistMap(mapId).catch((error) =>
            console.error('[memory-star] compact journal failed', error),
          );
        }, 0);
      }
    });
  }

  function scheduleStatsSave(mapId, starId) {
    if (!mapId || !starId) return;
    let ids = pendingStats.get(mapId);
    if (!ids) {
      ids = new Set();
      pendingStats.set(mapId, ids);
    }
    ids.add(starId);
    if (statsTimers.has(mapId)) return;
    const timer = setTimeout(() => {
      statsTimers.delete(mapId);
      const pending = pendingStats.get(mapId);
      pendingStats.delete(mapId);
      if (pending && pending.size) {
        persistStatsDelta(mapId, pending).catch((error) =>
          console.error('[memory-star] save stats failed', error),
        );
      }
    }, 30000);
    timer.unref?.();
    statsTimers.set(mapId, timer);
  }

  function persistStatsDelta(mapId, starIds) {
    pageCache.delete(mapId);
    return enqueueWrite(`map:${mapId}`, async () => {
      const data = maps.get(mapId);
      if (!data) return;
      const byId =
        starIds.size > 200 ? new Map(data.stars.map((star) => [star.id, star])) : null;
      const lines = [];
      for (const starId of starIds) {
        const star = byId ? byId.get(starId) : data.stars.find((item) => item.id === starId);
        if (!star) continue;
        lines.push(
          `${JSON.stringify({
            op: 'stats',
            id: starId,
            recallCount: star.recallCount,
            lastRecalledAt: star.lastRecalledAt,
          })}\n`,
        );
      }
      if (!lines.length) return;
      const payload = lines.join('');
      await appendJournalFile(journalPath(mapId), payload);
      const nextBytes = (journalBytes.get(mapId) || 0) + Buffer.byteLength(payload);
      journalBytes.set(mapId, nextBytes);
      metrics.statsJournalAppends += 1;
      if (nextBytes > 8 * 1024 * 1024) {
        metrics.journalCompactions += 1;
        setTimeout(() => persistMap(mapId).catch(() => {}), 0);
      }
    });
  }

  function scheduleBindings() {
    persistBindings().catch((error) => console.error('[memory-star] save bindings failed', error));
  }

  async function acquireProfileLock() {
    lockToken = uid('lock');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, token: lockToken, startedAt: nowIso() }),
          'utf8',
        );
        await handle.close();
        lockOwned = true;
        return;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        let existing = null;
        try {
          existing = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        } catch {
          // corrupt lock: replace it
        }
        let alive = false;
        if (existing?.pid) {
          if (existing.pid === process.pid) {
            const handle = await fs.open(lockPath, 'w');
            await handle.writeFile(
              JSON.stringify({ pid: process.pid, token: lockToken, startedAt: nowIso() }),
              'utf8',
            );
            await handle.close();
            lockOwned = true;
            return;
          }
          try {
            process.kill(existing.pid, 0);
            alive = true;
          } catch (probeError) {
            alive = probeError?.code === 'EPERM';
          }
        }
        if (alive) {
          throw new Error(
            `Memory profile is already in use by process ${existing.pid}. Close the other DSH window first.`,
          );
        }
        await fs.unlink(lockPath).catch(() => {});
      }
    }
    throw new Error('Could not acquire the memory profile lock.');
  }

  async function releaseProfileLock() {
    if (!lockOwned || !lockPath) return;
    lockOwned = false;
    try {
      const existing = JSON.parse(await fs.readFile(lockPath, 'utf8'));
      if (existing?.token !== lockToken) return;
      await fs.unlink(lockPath);
    } catch {
      // already released or replaced
    }
  }

  async function boot() {
    let profileRoot = process.env.DSH_PROFILE_DIR;
    if (!profileRoot) {
      try {
        const settingsService = ctx.get('settings');
        const patchPath = await settingsService?.prepareDocument?.();
        if (patchPath) profileRoot = path.dirname(patchPath);
      } catch {
        // fall through
      }
    }
    if (!profileRoot) {
      const profileName = process.env.DSH_PROFILE;
      profileRoot = profileName
        ? path.join(os.homedir(), '.dsh', 'profiles', profileName)
        : path.join(os.homedir(), '.dsh');
    }
    dataDir = path.join(profileRoot, 'plugin-data', PLUGIN_ID);
    mapsDir = path.join(dataDir, 'maps');
    backupsDir = path.join(dataDir, 'backups');
    indexPath = path.join(dataDir, 'index.json');
    bindingsPath = path.join(dataDir, 'bindings.json');
    settingsPath = path.join(dataDir, 'settings.json');

    await fs.mkdir(dataDir, { recursive: true });
    lockPath = path.join(dataDir, 'plugin.lock');
    await acquireProfileLock();
    if (path.resolve(dataDir) !== path.resolve(legacyDataDir)) {
      try {
        await fs.access(path.join(dataDir, 'index.json'));
      } catch {
        try {
          await fs.access(path.join(legacyDataDir, 'index.json'));
          await fs.cp(legacyDataDir, dataDir, { recursive: true });
          console.info('[memory-star] migrated legacy data from', legacyDataDir, 'to', dataDir);
        } catch {
          // no legacy data
        }
      }
    }
    await fs.mkdir(mapsDir, { recursive: true });
    await fs.mkdir(backupsDir, { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      Object.assign(index, parsed);
    } catch {
      // first run
    }
    if (!Array.isArray(index.maps)) index.maps = [];
    if (!index.publicMapId || !index.maps.some((map) => map.id === index.publicMapId)) {
      const publicMap = makeMap('公共星图', 'public', null);
      index.publicMapId = publicMap.id;
      index.maps = [publicMap, ...index.maps.filter((map) => map.id !== publicMap.id)];
      maps.set(publicMap.id, { map: publicMap, stars: [], edges: [], constellations: [] });
      await persistIndex();
      await persistMap(publicMap.id);
    }
    for (const map of index.maps) {
      if (maps.has(map.id)) continue;
      try {
        maps.set(map.id, JSON.parse(await fs.readFile(mapPath(map.id), 'utf8')));
      } catch {
        maps.set(map.id, { map, stars: [], edges: [], constellations: [] });
      }
    }
    for (const map of index.maps) {
      const data = maps.get(map.id);
      if (data) await replayMapJournal(map.id, data);
    }
    try {
      const parsed = JSON.parse(await fs.readFile(bindingsPath, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) bindings.set(key, value);
    } catch {
      // no bindings yet
    }
    try {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(await fs.readFile(settingsPath, 'utf8')) };
    } catch {
      // defaults
    }
    HALF_LIFE_DAYS = Number(settings.halfLifeDays) || 45;
  }

  function isSubagent(agent) {
    const session = ctx.sessions.get(agent?.id);
    const header = session?.header;
    return header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0;
  }

  function isWorkspaceMuted(workspaceId) {
    return Boolean(
      workspaceId &&
        Array.isArray(settings.noMemoryWorkspaces) &&
        settings.noMemoryWorkspaces.includes(workspaceId),
    );
  }

  function isSessionMuted(agent) {
    return Boolean(
      agent?.id &&
        Array.isArray(settings.noMemorySessions) &&
        settings.noMemorySessions.includes(agent.id),
    );
  }

  async function ensureBinding(agent) {
    if (!agent?.id) return null;
    if (bindings.has(agent.id)) {
      const stored = bindings.get(agent.id);
      return stored && stored !== index.publicMapId ? stored : null;
    }
    let mapId = null;
    try {
      const session = ctx.sessions.get(agent.id);
      const cwd = session?.header?.cwd;
      if (cwd) {
        const workspace = await ctx.workspaceRegistry?.resolveByPath?.(cwd);
        if (workspace?.id) {
          const existing = index.maps.find(
            (map) => map.kind === 'project' && map.workspaceId === workspace.id,
          );
          if (existing) {
            mapId = existing.id;
          } else {
            const projectMap = makeMap(
              workspace.title || workspace.name || path.basename(cwd) || '项目',
              'project',
              workspace.id,
            );
            index.maps.push(projectMap);
            maps.set(projectMap.id, { map: projectMap, stars: [], edges: [], constellations: [] });
            await persistIndex();
            await persistMap(projectMap.id);
            mapId = projectMap.id;
          }
        }
      }
    } catch (error) {
      console.error('[memory-star] workspace binding failed', error);
    }
    bindings.set(agent.id, mapId);
    scheduleBindings();
    return mapId;
  }

  function weightOf(star, at = Date.now()) {
    const stamp = Date.parse(star.lastRecalledAt || star.updatedAt || star.createdAt || nowIso());
    const ageDays = Math.max(0, (at - (Number.isFinite(stamp) ? stamp : at)) / 86400000);
    const recency = Math.pow(0.5, ageDays / Math.max(1, HALF_LIFE_DAYS));
    const base = Number(star.importance ?? TYPE_IMPORTANCE[star.type] ?? 0.5);
    const recall = Math.min(0.15, Number(star.recallCount || 0) * 0.01);
    const used = Math.min(0.18, Number(star.usedCount || 0) * 0.03);
    const ignored = Math.min(0.08, Number(star.ignoredCount || 0) * 0.02);
    const wrong = Math.min(0.35, Number(star.wrongCount || 0) * 0.12);
    return clamp(
      base * (0.35 + 0.65 * recency) +
        recall +
        used -
        ignored -
        wrong +
        (star.pinned ? 0.25 : 0),
      0,
      1,
    );
  }

  function hashSeed(text) {
    let hash = 2166136261;
    const value = String(text);
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value = (value + 0x6d2b79f5) | 0;
      let next = Math.imul(value ^ (value >>> 15), 1 | value);
      next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildMapLayout(mapId) {
    const data = maps.get(mapId);
    if (!data) return null;
    const cached = layoutCache.get(mapId);
    if (cached) return cached;
    const started = Date.now();
    const stars = data.stars.filter((star) => star.status === 'active' && !star.disputed);
    const count = stars.length;
    const spacing = 72;
    const points = [];
    if (count) {
      const area = Math.max((count * spacing * spacing) / 0.22, 640 * 480 * 1.44);
      const radius = Math.sqrt(area / Math.PI);
      const random = mulberry32(hashSeed(`${mapId}:${count}:radial-v2`));
      const cell = spacing / Math.SQRT2;
      const buckets = new Map();
      const fits = (x, y) => {
        const col = Math.floor(x / cell);
        const row = Math.floor(y / cell);
        for (let r = row - 1; r <= row + 1; r += 1) {
          for (let c = col - 1; c <= col + 1; c += 1) {
            const bucket = buckets.get(`${c}:${r}`);
            if (!bucket) continue;
            for (const point of bucket) {
              if (Math.hypot(point.x - x, point.y - y) < spacing) return false;
            }
          }
        }
        return true;
      };
      const addPoint = (x, y) => {
        const col = Math.floor(x / cell);
        const row = Math.floor(y / cell);
        const key = `${col}:${row}`;
        const point = { x, y, distance: Math.hypot(x, y) };
        const bucket = buckets.get(key);
        if (bucket) bucket.push(point);
        else buckets.set(key, [point]);
        points.push(point);
      };
      const maxAttempts = count * 90;
      for (let attempt = 0; attempt < maxAttempts && points.length < count; attempt += 1) {
        const r = radius * Math.pow(random(), 0.8);
        const angle = random() * Math.PI * 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (fits(x, y)) addPoint(x, y);
      }
      let extra = 0;
      while (points.length < count && extra < count * 30) {
        const r = radius * (1 + extra / Math.max(1, count * 3));
        const angle = random() * Math.PI * 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (fits(x, y)) addPoint(x, y);
        extra += 1;
      }
      let fallback = 0;
      while (points.length < count) {
        const r = radius + spacing * 2 + Math.floor(fallback / 720) * spacing;
        const angle = (fallback * 2.399963229728653) % (Math.PI * 2);
        addPoint(Math.cos(angle) * r, Math.sin(angle) * r);
        fallback += 1;
      }
    }
    points.sort((a, b) => b.distance - a.distance);
    const ranked = stars
      .map((star) => ({
        star,
        weight: weightOf(star) + Number(star.importance ?? 0.5) * 0.6,
      }))
      .sort((a, b) => b.weight - a.weight);
    const positions = new Map();
    const starsById = new Map();
    ranked.forEach((entry, rank) => {
      const point = points[rank];
      if (!point) return;
      positions.set(entry.star.id, { x: point.x, y: point.y });
      starsById.set(entry.star.id, entry.star);
    });
    const gridCell = 160;
    const grid = new Map();
    for (const [starId, point] of positions) {
      const key = `${Math.floor(point.x / gridCell)}:${Math.floor(point.y / gridCell)}`;
      const bucket = grid.get(key);
      const entry = { id: starId, x: point.x, y: point.y };
      if (bucket) bucket.push(entry);
      else grid.set(key, [entry]);
    }
    const layout = {
      mapId,
      positions,
      starsById,
      grid,
      gridCell,
      total: count,
      maxRadius: points.length ? points[0].distance : 0,
      builtAt: Date.now(),
    };
    layoutCache.set(mapId, layout);
    metrics.layoutBuilds += 1;
    metrics.lastLayoutMs = Date.now() - started;
    return layout;
  }

  function compactViewportStar(star) {
    return {
      id: star.id,
      mapId: star.mapId,
      title: star.title,
      type: star.type,
      status: star.status,
      confidence: star.confidence,
      importance: star.importance,
      pinned: Boolean(star.pinned),
      recallCount: star.recallCount,
      lastRecalledAt: star.lastRecalledAt,
      createdAt: star.createdAt,
      updatedAt: star.updatedAt,
      version: star.version,
    };
  }

  function viewportForMap(mapId, cx, cy, width, height, padding = 260, limit = 8000) {
    const layout = buildMapLayout(mapId);
    const data = maps.get(mapId);
    if (!layout || !data) return { stars: [], positions: [], edges: [], total: 0 };
    const starsById = layout.starsById;
    const missing = [];
    let total = 0;
    for (const star of data.stars) {
      if (star.status !== 'active' || star.disputed) continue;
      total += 1;
      if (!starsById.has(star.id)) starsById.set(star.id, star);
      if (!layout.positions.has(star.id)) missing.push(star.id);
    }
    if (missing.length) {
      missing.sort();
      let radius = layout.maxRadius + 80;
      for (const starId of missing) {
        const angle = (hashSeed(starId) / 4294967296) * Math.PI * 2;
        radius += 42;
        const point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
        layout.positions.set(starId, point);
        const key = `${Math.floor(point.x / layout.gridCell)}:${Math.floor(point.y / layout.gridCell)}`;
        const bucket = layout.grid.get(key);
        const entry = { id: starId, x: point.x, y: point.y };
        if (bucket) bucket.push(entry);
        else layout.grid.set(key, [entry]);
      }
      layout.maxRadius = radius;
    }
    const halfWidth = Math.max(1, width) / 2 + padding;
    const halfHeight = Math.max(1, height) / 2 + padding;
    const left = cx - halfWidth;
    const right = cx + halfWidth;
    const top = cy - halfHeight;
    const bottom = cy + halfHeight;
    const hits = [];
    const firstCol = Math.floor(left / layout.gridCell);
    const lastCol = Math.floor(right / layout.gridCell);
    const firstRow = Math.floor(top / layout.gridCell);
    const lastRow = Math.floor(bottom / layout.gridCell);
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let col = firstCol; col <= lastCol; col += 1) {
        const bucket = layout.grid.get(`${col}:${row}`);
        if (!bucket) continue;
        for (const point of bucket) {
          if (point.x < left || point.x > right || point.y < top || point.y > bottom) continue;
          const star = starsById.get(point.id);
          if (!star || star.status !== 'active' || star.disputed) continue;
          hits.push({ star, x: point.x, y: point.y });
        }
      }
    }
    hits.sort((a, b) => weightOf(b.star) - weightOf(a.star));
    const selected = hits.slice(0, limit);
    const ids = new Set(selected.map((hit) => hit.star.id));
    return {
      stars: selected.map((hit) => compactViewportStar(hit.star)),
      positions: selected.map((hit) => ({ id: hit.star.id, x: hit.x, y: hit.y })),
      edges: (data.edges || []).filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
      total,
      truncated: hits.length > selected.length,
    };
  }

  function sortedActivePage(mapId) {
    const data = maps.get(mapId);
    if (!data) return null;
    const cached = pageCache.get(mapId);
    if (cached && cached.starsRef === data.stars) return cached.list;
    const list = data.stars
      .filter((star) => star.status === 'active')
      .map((star) => ({
        star,
        weight: weightOf(star) + Number(star.importance ?? 0.5) * 0.6,
      }))
      .sort(
        (a, b) =>
          b.weight - a.weight ||
          String(a.star.id).localeCompare(String(b.star.id)),
      );
    pageCache.set(mapId, { starsRef: data.stars, list });
    return list;
  }

  function invalidateIndex(mapId, starId) {
    if (!mapId) return;
    starLocator = null;
    if (!starId) {
      dirtyIndex.add(mapId);
      dirtyStars.delete(mapId);
      return;
    }
    if (dirtyIndex.has(mapId)) return;
    let ids = dirtyStars.get(mapId);
    if (!ids) {
      ids = new Set();
      dirtyStars.set(mapId, ids);
    }
    ids.add(starId);
  }

  function searchSignature(star) {
    const text = [
      star.title || '',
      star.fact || '',
      (star.tags || []).join(' '),
      (star.refs || []).join(' '),
      star.reason || '',
      star.condition || '',
    ].join('\n');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
  }

  function makeIndexDoc(star, signature = searchSignature(star)) {
    const tf = new Map();
    let len = 0;
    const addField = (text, weight) => {
      if (!text) return;
      for (const term of tokensOf(text)) {
        tf.set(term, (tf.get(term) || 0) + weight);
        len += weight;
      }
    };
    addField(star.title, 3);
    addField(star.fact, 2);
    addField((star.tags || []).join(' '), 2);
    addField((star.refs || []).join(' '), 2);
    addField(star.reason, 1);
    addField(star.condition, 1);
    return {
      star,
      tf,
      len,
      signature,
      haystack: `${star.title || ''} ${star.fact || ''} ${(star.tags || []).join(' ')}`.toLowerCase(),
    };
  }

  function addIndexDoc(index, star, signature = searchSignature(star)) {
    removeIndexDoc(index, star.id);
    const doc = makeIndexDoc(star, signature);
    index.docs.set(star.id, doc);
    for (const term of doc.tf.keys()) {
      let posting = index.postings.get(term);
      if (!posting) {
        posting = new Set();
        index.postings.set(term, posting);
      }
      posting.add(star.id);
      index.df.set(term, (index.df.get(term) || 0) + 1);
    }
    index.count += 1;
    index.totalLen += doc.len;
    index.avgdl = index.count ? index.totalLen / index.count : 1;
    return doc;
  }

  function removeIndexDoc(index, starId) {
    const doc = index.docs.get(starId);
    if (!doc) return false;
    index.docs.delete(starId);
    for (const term of doc.tf.keys()) {
      const posting = index.postings.get(term);
      if (!posting) continue;
      posting.delete(starId);
      const nextDf = (index.df.get(term) || 0) - 1;
      if (nextDf <= 0) {
        index.df.delete(term);
        index.postings.delete(term);
      } else {
        index.df.set(term, nextDf);
      }
    }
    index.count = Math.max(0, index.count - 1);
    index.totalLen = Math.max(0, index.totalLen - doc.len);
    index.avgdl = index.count ? index.totalLen / index.count : 1;
    return true;
  }

  function rebuildPostings(index) {
    index.postings = new Map();
    index.df = new Map();
    index.totalLen = 0;
    index.count = index.docs.size;
    for (const doc of index.docs.values()) {
      index.totalLen += doc.len;
      for (const term of doc.tf.keys()) {
        let posting = index.postings.get(term);
        if (!posting) {
          posting = new Set();
          index.postings.set(term, posting);
        }
        posting.add(doc.star.id);
        index.df.set(term, (index.df.get(term) || 0) + 1);
      }
    }
    index.avgdl = index.count ? index.totalLen / index.count : 1;
  }

  function buildIndex(mapId) {
    const data = maps.get(mapId);
    if (!data) return null;
    const started = Date.now();
    const index = {
      mapId,
      docs: new Map(),
      postings: new Map(),
      df: new Map(),
      count: 0,
      totalLen: 0,
      avgdl: 1,
    };
    for (const star of data.stars) {
      if (star.status !== 'active' || star.disputed) continue;
      addIndexDoc(index, star);
    }
    indexCache.set(mapId, index);
    dirtyIndex.delete(mapId);
    dirtyStars.delete(mapId);
    metrics.indexRebuilds += 1;
    metrics.lastIndexMs = Date.now() - started;
    return index;
  }

  function syncIndex(mapId, index) {
    const data = maps.get(mapId);
    if (!data) return null;
    const started = Date.now();
    const nextDocs = new Map();
    for (const star of data.stars) {
      if (star.status !== 'active' || star.disputed) continue;
      const previous = index.docs.get(star.id);
      const signature = searchSignature(star);
      nextDocs.set(
        star.id,
        previous && previous.signature === signature
          ? Object.assign(previous, { star })
          : makeIndexDoc(star, signature),
      );
    }
    index.docs = nextDocs;
    rebuildPostings(index);
    dirtyIndex.delete(mapId);
    dirtyStars.delete(mapId);
    metrics.indexSyncs += 1;
    metrics.lastIndexMs = Date.now() - started;
    return index;
  }

  function syncDirtyStars(mapId, index) {
    const data = maps.get(mapId);
    if (!data) return null;
    const ids = dirtyStars.get(mapId);
    if (!ids || !ids.size) return index;
    const started = Date.now();
    const lookup =
      ids.size > 500 ? new Map(data.stars.map((star) => [star.id, star])) : null;
    for (const starId of ids) {
      removeIndexDoc(index, starId);
      const star = lookup ? lookup.get(starId) : data.stars.find((item) => item.id === starId);
      if (star && star.status === 'active' && !star.disputed) {
        addIndexDoc(index, star);
      }
    }
    dirtyStars.delete(mapId);
    metrics.indexSyncs += 1;
    metrics.lastIndexMs = Date.now() - started;
    return index;
  }

  function ensureIndex(mapId) {
    const cached = indexCache.get(mapId);
    if (!cached) return buildIndex(mapId);
    if (dirtyIndex.has(mapId)) return syncIndex(mapId, cached);
    if (dirtyStars.has(mapId)) return syncDirtyStars(mapId, cached);
    return cached;
  }

  async function prewarmIndex(mapId) {
    if (indexCache.has(mapId) || prewarming.has(mapId)) return;
    const data = maps.get(mapId);
    if (!data || data.stars.length < 2000) return;
    prewarming.add(mapId);
    const started = Date.now();
    const index = {
      mapId,
      docs: new Map(),
      postings: new Map(),
      df: new Map(),
      count: 0,
      totalLen: 0,
      avgdl: 1,
    };
    try {
      for (let cursor = 0; cursor < data.stars.length; cursor += 2500) {
        if (indexCache.has(mapId) || dirtyIndex.has(mapId) || dirtyStars.has(mapId)) return;
        const end = Math.min(data.stars.length, cursor + 2500);
        for (let position = cursor; position < end; position += 1) {
          const star = data.stars[position];
          if (star.status !== 'active' || star.disputed) continue;
          addIndexDoc(index, star);
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (indexCache.has(mapId) || dirtyIndex.has(mapId) || dirtyStars.has(mapId)) return;
      indexCache.set(mapId, index);
      metrics.indexPrewarms += 1;
      metrics.lastIndexMs = Date.now() - started;
    } finally {
      prewarming.delete(mapId);
    }
  }

  function bm25Score(doc, queryTerms, index) {
    const k1 = 1.2;
    const b = 0.75;
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.tf.get(term);
      if (!tf) continue;
      const df = index.df.get(term) || 0;
      const idf = Math.log(1 + (index.count - df + 0.5) / (df + 0.5));
      const denominator = tf + k1 * (1 - b + (b * doc.len) / (index.avgdl || 1));
      score += idf * ((tf * (k1 + 1)) / denominator);
    }
    return score;
  }

  function accessibleMapIds(mapId) {
    const ids = new Set([index.publicMapId]);
    if (mapId) ids.add(mapId);
    return [...ids].filter((id) => maps.has(id));
  }

  function diversifyHits(hits, limit) {
    if (hits.length <= limit) return hits;
    const pool = hits.slice(0, Math.min(hits.length, limit * 5)).map((hit) => ({
      ...hit,
      terms: tokensOf(`${hit.star.title || ''} ${hit.star.fact || ''}`),
    }));
    const selected = [];
    while (selected.length < limit && pool.length) {
      let bestIndex = 0;
      let bestValue = -Infinity;
      for (let index = 0; index < pool.length; index += 1) {
        const candidate = pool[index];
        let similarity = 0;
        for (const chosen of selected) {
          similarity = Math.max(similarity, dice(candidate.terms, chosen.terms));
        }
        const value = candidate.score - similarity * 0.2;
        if (value > bestValue) {
          bestValue = value;
          bestIndex = index;
        }
      }
      selected.push(pool.splice(bestIndex, 1)[0]);
    }
    return selected;
  }

  function searchAcrossMaps(mapIds, query, limit, options = {}) {
    const queryTerms = tokensOf(query);
    if (!queryTerms.size) return [];
    const searchStarted = Date.now();
    const at = Date.now();
    const lower = String(query).toLowerCase();
    const preferenceCue = /记住|以后|统一|别再|偏好|always|never|prefer/.test(lower);
    const procedureCue = /怎么|如何|how/.test(lower);
    const hits = [];
    for (const id of mapIds) {
      const data = maps.get(id);
      if (!data) continue;
      const mapIndex = ensureIndex(id);
      if (!mapIndex) continue;
      const candidates = new Set();
      for (const term of queryTerms) {
        const posting = mapIndex.postings.get(term);
        if (!posting) continue;
        for (const starId of posting) candidates.add(starId);
      }
      metrics.searchCandidates += candidates.size;
      for (const starId of candidates) {
        const doc = mapIndex.docs.get(starId);
        if (!doc) continue;
        const star = doc.star;
        if (star.validUntil && Date.parse(star.validUntil) < at) continue;
        const bm25 = bm25Score(doc, queryTerms, mapIndex);
        if (bm25 <= 0) continue;
        let matchedTerms = 0;
        for (const term of queryTerms) {
          if (doc.tf.has(term)) matchedTerms += 1;
        }
        const coverage = matchedTerms / queryTerms.size;
        const text = bm25 / (bm25 + 3);
        const typeSignal =
          (preferenceCue && (star.type === 'preference' || star.type === 'decision')) ||
          (procedureCue && star.type === 'procedure')
            ? 1
            : 0;
        const titleLower = String(star.title || '').toLowerCase();
        const tagsLower = (star.tags || []).join(' ').toLowerCase();
        const exactSignal =
          doc.haystack.includes(lower) || titleLower.includes(lower) || tagsLower.includes(lower)
            ? 1
            : 0;
        const minCoverage = queryTerms.size >= 4 ? 0.35 : queryTerms.size >= 2 ? 0.5 : 0;
        if (!exactSignal && coverage < minCoverage) continue;
        const score =
          0.38 * text +
          0.22 * weightOf(star, at) +
          0.1 * typeSignal +
          0.12 * exactSignal +
          0.18 * coverage;
        if (score < Number(settings.threshold ?? 0.15)) continue;
        hits.push({ star, map: data.map, score, bm25 });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    let results = diversifyHits(hits, clamp(Number(limit) || 8, 1, 50));
    if (options.graph && results.length) {
      const grouped = new Map();
      for (const hit of results) {
        const group = grouped.get(hit.map.id) || [];
        group.push(hit);
        grouped.set(hit.map.id, group);
      }
      const expanded = [];
      for (const [mapId, group] of grouped) {
        expanded.push(...expandHitsWithGraph(mapId, group, results.length));
      }
      results = diversifyHits(
        expanded.sort((a, b) => b.score - a.score),
        clamp(Number(limit) || 8, 1, 50),
      );
    }
    metrics.searches += 1;
    metrics.lastSearchMs = Date.now() - searchStarted;
    metrics.lastSearchAt = nowIso();
    return results;
  }

  function searchInternal(agent, mapId, query, limit) {
    if (settings.privacyIncognito) return [];
    if (isSessionMuted(agent)) return [];
    if (isWorkspaceMuted(maps.get(mapId)?.map.workspaceId)) return [];
    return searchAcrossMaps(accessibleMapIds(mapId), query, limit);
  }

  function redactOutputText(value) {
    if (settings.privacyOutputRedaction === false) return value;
    let text = String(value ?? '');
    if (!text) return text;
    text = text.replace(CREDENTIAL_REDACT_RE, '[redacted]');
    text = text.replace(PERSONAL_REDACT_RE, '[redacted]');
    for (const word of settings.customSensitiveWords || []) {
      const trimmed = String(word || '').trim();
      if (!trimmed) continue;
      const safe = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(safe, 'gi'), '[redacted]');
    }
    return text;
  }

  function compactHit(hit) {
    return {
      id: hit.star.id,
      title: redactOutputText(hit.star.title),
      fact: redactOutputText(hit.star.fact),
      reason: redactOutputText(hit.star.reason),
      condition: redactOutputText(hit.star.condition),
      type: hit.star.type,
      tags: (hit.star.tags || []).map(redactOutputText),
      map: hit.map.name,
      mapId: hit.map.id,
      mapKind: hit.map.kind,
      weight: Number(weightOf(hit.star).toFixed(2)),
      updatedAt: hit.star.updatedAt,
    };
  }

  function starLine(star, map) {
    const condition = star.condition ? `（条件：${redactOutputText(star.condition)}）` : '';
    return `〔${map.name}〕${TYPE_LABEL[star.type] || star.type}：${redactOutputText(star.title)}。${redactOutputText(star.fact)}${condition}`;
  }

  function isRecallSuppressed(sessionId, starId, turn) {
    const limit = Number(settings.repeatSuppressionTurns ?? 3);
    if (!sessionId || !turn || limit <= 0) return false;
    const last = recentRecalls.get(sessionId)?.get(starId);
    return Number.isFinite(last) && turn > last && turn - last <= limit;
  }

  function noteRecalls(sessionId, turn, starIds) {
    if (!sessionId || !turn || !Array.isArray(starIds) || !starIds.length) return;
    let recent = recentRecalls.get(sessionId);
    if (!recent) {
      recent = new Map();
      recentRecalls.set(sessionId, recent);
    }
    for (const id of starIds) recent.set(id, turn);
    for (const [id, last] of recent) {
      if (turn - last > 100) recent.delete(id);
    }
  }

  function recordTurn(sessionId, turn, field, amount = 1) {
    if (!sessionId || !turn) return;
    let perSession = turnTrace.get(sessionId);
    if (!perSession) {
      perSession = new Map();
      turnTrace.set(sessionId, perSession);
    }
    const entry = perSession.get(turn) || { turn, saved: 0, recalled: 0 };
    entry[field] = Number(entry[field] || 0) + amount;
    perSession.set(turn, entry);
    if (perSession.size > 100) {
      const first = perSession.keys().next().value;
      if (first !== undefined) perSession.delete(first);
    }
  }

  function expandHitsWithGraph(mapId, hits, limit, at = Date.now()) {
    const data = maps.get(mapId);
    if (!data || !data.edges?.length || !hits.length) return hits;
    const usable = data.edges.filter((edge) =>
      ['related', 'supports', 'derived', 'part-of'].includes(edge.relation),
    );
    if (!usable.length || usable.length > 200000) return hits;
    const byId = new Map(data.stars.map((star) => [star.id, star]));
    const adjacency = new Map();
    for (const edge of usable) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
      adjacency.get(edge.from).push(edge.to);
      adjacency.get(edge.to).push(edge.from);
    }
    const seen = new Set(hits.map((hit) => hit.star.id));
    const extras = [];
    for (const hit of hits.slice(0, Math.min(hits.length, limit * 2))) {
      for (const neighborId of adjacency.get(hit.star.id) || []) {
        if (!neighborId || seen.has(neighborId)) continue;
        const star = byId.get(neighborId);
        if (!star || star.status !== 'active' || star.disputed) continue;
        if (star.validUntil && Date.parse(star.validUntil) < at) continue;
        seen.add(neighborId);
        extras.push({
          star,
          map: data.map,
          score: hit.score * 0.42,
          bm25: 0,
          expanded: true,
        });
      }
    }
    if (!extras.length) return hits;
    metrics.graphExpansions += 1;
    return hits.concat(extras.sort((a, b) => b.score - a.score)).sort(
      (a, b) => b.score - a.score,
    );
  }

  function retrieveHits(agent, mapId, query, options = {}) {
    const limit = Math.max(1, Number(options.limit ?? settings.topK) || 6);
    const turn = Number(options.turn ?? 0) || 0;
    const allowGraph = options.allowGraph !== false;
    const raw = searchInternal(agent, mapId, query, Math.min(50, limit * 4));
    if (!raw.length) return [];
    let combined = raw.slice();
    if (allowGraph) {
      combined = expandHitsWithGraph(mapId, combined, limit * 2);
    }
    const seen = new Set();
    const allowed = [];
    const suppressedPinned = [];
    for (const hit of combined) {
      if (seen.has(hit.star.id)) continue;
      seen.add(hit.star.id);
      if (isRecallSuppressed(agent?.id, hit.star.id, turn)) {
        if (hit.star.pinned) suppressedPinned.push(hit);
        continue;
      }
      allowed.push(hit);
    }
    if (suppressedPinned.length) {
      allowed.push(...suppressedPinned.slice(0, 1));
    }
    return allowed
      .sort((a, b) => {
        const ap = a.star.pinned ? 1 : 0;
        const bp = b.star.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return b.score - a.score;
      })
      .slice(0, limit);
  }

  function recallForAgent(agent, mapId, query, turn = 0) {
    if (settings.privacyIncognito) return { text: '', count: 0, starIds: [] };
    if (isSessionMuted(agent)) return { text: '', count: 0, starIds: [] };
    if (isWorkspaceMuted(maps.get(mapId)?.map.workspaceId)) {
      return { text: '', count: 0, starIds: [] };
    }
    metrics.recalls += 1;
    metrics.lastRecallAt = nowIso();
    const topK = Math.max(1, Number(settings.topK) || 6);
    const hits = retrieveHits(agent, mapId, query, {
      limit: topK,
      turn,
      allowGraph: true,
    });
    if (!hits.length) return { text: '', count: 0, starIds: [] };
    const lines = [];
    const starIds = [];
    const budget = Math.max(100, Number(settings.tokenBudget ?? 600));
    let used = 0;
    for (const hit of hits) {
      const line = starLine(hit.star, hit.map);
      const cost = Math.ceil(line.length / 2);
      if (lines.length && used + cost > budget) break;
      lines.push(line);
      used += cost;
      starIds.push(hit.star.id);
      hit.star.recallCount = Number(hit.star.recallCount || 0) + 1;
      hit.star.lastRecalledAt = nowIso();
      hit.star.updatedAt = hit.star.updatedAt || nowIso();
      scheduleStatsSave(hit.star.mapId, hit.star.id);
    }
    noteRecalls(agent?.id, turn, starIds);
    return {
      text: [
        '<long-term-memory>',
        ...lines,
        '</long-term-memory>',
        'Historical memories may be outdated. If they conflict with the current conversation, follow the current conversation and mention the conflict.',
      ].join('\n'),
      count: lines.length,
      starIds,
    };
  }

  function briefForAgent(agent, mapId, turn = 0) {
    if (settings.privacyIncognito) return { text: '', count: 0, starIds: [] };
    if (isSessionMuted(agent)) return { text: '', count: 0, starIds: [] };
    if (isWorkspaceMuted(maps.get(mapId)?.map.workspaceId)) {
      return { text: '', count: 0, starIds: [] };
    }
    metrics.briefs += 1;
    const at = Date.now();
    const picked = [];
    const publicData = maps.get(index.publicMapId);
    if (publicData) {
      const publicStars = publicData.stars
        .filter(
          (star) =>
            star.status === 'active' &&
            (star.pinned || !isRecallSuppressed(agent?.id, star.id, turn)),
        )
        .sort((a, b) => weightOf(b, at) - weightOf(a, at))
        .slice(0, 2);
      for (const star of publicStars) picked.push({ star, map: publicData.map });
    }
    const projectData = maps.get(mapId);
    if (projectData && mapId !== index.publicMapId) {
      const projectStars = projectData.stars
        .filter(
          (star) =>
            star.status === 'active' &&
            (star.pinned || !isRecallSuppressed(agent?.id, star.id, turn)),
        )
        .sort((a, b) => {
          const ap = a.pinned ? 1 : 0;
          const bp = b.pinned ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return weightOf(b, at) - weightOf(a, at);
        })
        .slice(0, 3);
      for (const star of projectStars) picked.push({ star, map: projectData.map });
    }
    if (!picked.length) return { text: '', count: 0, starIds: [] };
    const seen = new Set();
    const lines = [];
    const starIds = [];
    const budget = Math.max(100, Number(settings.tokenBudget ?? 600));
    let used = 0;
    for (const { star, map } of picked) {
      if (seen.has(star.id)) continue;
      const line = starLine(star, map);
      const cost = Math.ceil(line.length / 2);
      if (lines.length && used + cost > budget) break;
      seen.add(star.id);
      starIds.push(star.id);
      lines.push(line);
      used += cost;
      star.recallCount = Number(star.recallCount || 0) + 1;
      star.lastRecalledAt = nowIso();
      scheduleStatsSave(star.mapId, star.id);
    }
    noteRecalls(agent?.id, turn, starIds);
    return {
      text: [
        '<long-term-memory>',
        'Project brief:',
        ...lines,
        '</long-term-memory>',
        'Historical memories may be outdated. If they conflict with the current conversation, follow the current conversation and mention the conflict.',
      ].join('\n'),
      count: lines.length,
      starIds,
    };
  }

  function createStar(input, mapId, sourceKind = 'session', sessionId = null) {
    const map = maps.get(mapId)?.map;
    if (!map) throw new Error('map not found');
    const title = String(input.title ?? '').trim();
    const fact = String(input.fact ?? '').trim();
    if (!title) throw new Error('title is required');
    if (!fact) throw new Error('fact is required');
    if (charCount(title) > 20) throw new Error('title must be at most 20 characters');
    if (charCount(fact) > 120) throw new Error('fact must be at most 120 characters');
    const reason = String(input.reason ?? '').trim();
    const condition = String(input.condition ?? '').trim();
    if (charCount(reason) > 120) throw new Error('reason must be at most 120 characters');
    if (charCount(condition) > 100) throw new Error('condition must be at most 100 characters');
    const type = TYPES.includes(input.type) ? input.type : 'fact';
    const tags = Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 5)
      : [];
    const refs = Array.isArray(input.refs)
      ? input.refs.map((ref) => String(ref).trim()).filter(Boolean).slice(0, 5)
      : [];
    const confidence = clamp(Number(input.confidence ?? 0.6), 0, 1);
    const importance = clamp(Number(input.importance ?? TYPE_IMPORTANCE[type] ?? 0.5), 0, 1);
    const status =
      input.status ||
      (map.kind === 'public'
        ? 'pending'
        : confidence >= Number(settings.directActiveConfidence ?? 0.85)
          ? 'active'
          : 'pending');
    const star = {
      id: uid('st'),
      mapId,
      title,
      fact,
      reason,
      condition,
      type,
      tags,
      refs,
      importance,
      confidence,
      status,
      disputed: false,
      source: {
        kind: sourceKind,
        ...(sourceKind === 'session' && sessionId ? { sessionId } : {}),
      },
      anchor: map.workspaceId ? { workspaceId: map.workspaceId } : undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastRecalledAt: null,
      recallCount: 0,
      validUntil: input.validUntil || null,
      pinned: Boolean(input.pinned),
      version: 1,
      history: [],
      mergedFrom: [],
    };
    recordStarHistory(star, sourceKind === 'manual' ? 'user' : 'model', [
      { field: 'created', from: null, to: title },
    ]);
    maps.get(mapId).stars.push(star);
    invalidateIndex(mapId, star.id);
    scheduleMapSave(mapId, star.id);
    return star;
  }

  function findStarAcross(id) {
    if (!starLocator) {
      starLocator = new Map();
      for (const data of maps.values()) {
        for (const star of data.stars) {
          starLocator.set(star.id, { star, data });
        }
      }
    }
    return starLocator.get(id) || null;
  }

  function similarStars(mapId, title, fact) {
    const data = maps.get(mapId);
    if (!data) return [];
    const query = tokensOf(`${title} ${fact}`);
    if (!query.size) return [];
    const index = ensureIndex(mapId);
    if (!index) return [];
    const overlap = new Map();
    for (const term of query) {
      const posting = index.postings.get(term);
      if (!posting) continue;
      for (const starId of posting) {
        overlap.set(starId, (overlap.get(starId) || 0) + 1);
      }
    }
    const candidates = [...overlap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2000);
    const results = candidates
      .map(([starId]) => index.docs.get(starId)?.star)
      .filter(
        (star) =>
          star && star.status !== 'archived' && star.status !== 'rejected',
      )
      .map((star) => ({
        star,
        similarity: dice(query, tokensOf(`${star.title} ${star.fact}`)),
      }));
    const seen = new Set(results.map((entry) => entry.star.id));
    for (const star of data.stars) {
      if (star.status !== 'pending' || seen.has(star.id)) continue;
      results.push({
        star,
        similarity: dice(query, tokensOf(`${star.title} ${star.fact}`)),
      });
    }
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  function currentAgent(exec) {
    if (exec?.agent) return exec.agent;
    try {
      return ctx.agents.currentInitiator();
    } catch {
      return undefined;
    }
  }

  function semanticConflict(nextFact, oldFact, similarity) {
    if (!oldFact || similarity < 0.5) return false;
    const next = String(nextFact || '');
    const old = String(oldFact || '');
    const negate =
      /不要|不再|不使用|不支持|不是|停止|禁用|废弃|移除|never|not\b|no\b|deprecated|removed/i;
    if (negate.test(next) !== negate.test(old)) return true;
    const switchCue = /改用|换成|替换|迁移|切换|instead|switch|replace|migrate/i;
    if (
      (switchCue.test(next) || switchCue.test(old)) &&
      similarity < 0.92
    ) {
      return true;
    }
    const numbers = (text) => new Set(text.match(/\d+(?:\.\d+)?/g) || []);
    const nextNumbers = numbers(next);
    const oldNumbers = numbers(old);
    if (nextNumbers.size && oldNumbers.size) {
      const same =
        nextNumbers.size === oldNumbers.size &&
        [...nextNumbers].every((value) => oldNumbers.has(value));
      if (!same) return true;
    }
    return false;
  }

  async function upsertStarToMap(mapId, input, sourceKind = 'model', options = {}) {
    const title = String(input.title ?? '').trim();
    const fact = String(input.fact ?? '').trim();
    if (!title) throw new Error('title is required');
    if (!fact) throw new Error('fact is required');
    if (charCount(title) > 20) throw new Error('title must be at most 20 characters');
    if (charCount(fact) > 120) throw new Error('fact must be at most 120 characters');
    if (charCount(input.reason ?? '') > 120) throw new Error('reason must be at most 120 characters');
    if (charCount(input.condition ?? '') > 100) throw new Error('condition must be at most 100 characters');
    const actor = sourceKind === 'manual' ? 'user' : 'model';
    const candidates = similarStars(mapId, title, fact);
    const best = candidates[0];
    const conflict = best
      ? semanticConflict(fact, best.star.fact, best.similarity)
      : false;
    if (best && best.similarity > 0.8 && !conflict) {
      const existing = best.star;
      const before = {
        title: existing.title,
        fact: existing.fact,
        reason: existing.reason,
        condition: existing.condition,
        tags: existing.tags,
        refs: existing.refs,
        confidence: existing.confidence,
        status: existing.status,
      };
      existing.title = title || existing.title;
      existing.fact = fact || existing.fact;
      if (input.reason) existing.reason = String(input.reason).trim();
      if (input.condition) existing.condition = String(input.condition).trim();
      existing.tags = [
        ...new Set([
          ...(existing.tags || []),
          ...(Array.isArray(input.tags) ? input.tags : []),
        ]),
      ].slice(0, 5);
      existing.refs = [
        ...new Set([
          ...(existing.refs || []),
          ...(Array.isArray(input.refs) ? input.refs : []),
        ]),
      ].slice(0, 5);
      existing.confidence = Math.max(
        Number(existing.confidence || 0),
        Number(input.confidence ?? 0),
      );
      existing.mergedFrom = Array.isArray(existing.mergedFrom) ? existing.mergedFrom : [];
      existing.mergedFrom.push({
        title: title || existing.title,
        fact: fact || existing.fact,
        at: nowIso(),
        source: sourceKind,
      });
      if (existing.mergedFrom.length > 10) existing.mergedFrom = existing.mergedFrom.slice(-10);
      if (
        existing.status === 'pending' &&
        maps.get(mapId)?.map.kind !== 'public' &&
        existing.confidence >= Number(settings.directActiveConfidence ?? 0.85)
      ) {
        existing.status = 'active';
      }
      existing.updatedAt = nowIso();
      existing.version = Number(existing.version || 1) + 1;
      recordStarHistory(
        existing,
        actor,
        diffFields(before, existing, [
          'title',
          'fact',
          'reason',
          'condition',
          'tags',
          'refs',
          'confidence',
          'status',
        ]),
      );
      invalidateIndex(existing.mapId, existing.id);
      scheduleMapSave(existing.mapId, existing.id);
      metrics.saves += 1;
      metrics.lastSaveAt = nowIso();
      return { status: 'merged', star: existing, merged: true, conflict: false };
    }
    const star = createStar(input, mapId, sourceKind, options.sessionId);
    const newEdges = [];
    if (best && best.similarity > 0.6 && !conflict) {
      const edge = {
        id: uid('ed'),
        from: star.id,
        to: best.star.id,
        relation: 'related',
        createdBy: actor,
        createdAt: nowIso(),
      };
      maps.get(mapId).edges.push(edge);
      newEdges.push(edge);
    }
    if (best && conflict) {
      if (!best.star.disputed) {
        best.star.disputed = true;
        best.star.version = Number(best.star.version || 1) + 1;
        recordStarHistory(best.star, actor, [{ field: 'disputed', from: false, to: true }]);
        scheduleMapSave(mapId, best.star.id);
      }
      invalidateIndex(mapId, best.star.id);
      const edge = {
        id: uid('ed'),
        from: star.id,
        to: best.star.id,
        relation: 'contradicts',
        createdBy: actor,
        createdAt: nowIso(),
      };
      maps.get(mapId).edges.push(edge);
      newEdges.push(edge);
    }
    if (newEdges.length) await persistEdgeDelta(mapId, newEdges);
    metrics.saves += 1;
    metrics.lastSaveAt = nowIso();
    return { status: star.status, star, merged: false, conflict };
  }

  async function saveStarForAgent(agent, args) {
    if (isSubagent(agent)) throw new Error('subagents cannot write memories');
    if (isSessionMuted(agent)) throw new Error('Memory is disabled for this session.');
    if (settings.privacyIncognito) throw new Error('Memory is paused by privacy settings.');
    const input = args && typeof args === 'object' ? args : {};
    const probe = `${input.title ?? ''}\n${input.fact ?? ''}\n${input.reason ?? ''}\n${input.condition ?? ''}\n${
      Array.isArray(input.tags) ? input.tags.join(' ') : ''
    }\n${Array.isArray(input.refs) ? input.refs.join(' ') : ''}`;
    const sensitiveKind = detectSensitive(
      probe,
      settings.privacyMode,
      settings.customSensitiveWords,
    );
    if (isSensitive(probe) || sensitiveKind) {
      throw new Error(
        `Sensitive content detected (${sensitiveKind || 'credential'}); not saved.`,
      );
    }
    if (isInstructionLike(probe)) throw new Error('Instruction-like content detected; not saved.');
    const title = String(input.title ?? '').trim();
    const fact = String(input.fact ?? '').trim();
    if (!title) throw new Error('title is required');
    if (!fact) throw new Error('fact is required');
    if (charCount(title) > 20) throw new Error('title must be at most 20 characters');
    if (charCount(fact) > 120) throw new Error('fact must be at most 120 characters');
    if (charCount(input.reason ?? '') > 120) throw new Error('reason must be at most 120 characters');
    if (charCount(input.condition ?? '') > 100) throw new Error('condition must be at most 100 characters');
    const wantsPublic = input.target === 'public';
    const mapId = wantsPublic ? index.publicMapId : (await ensureBinding(agent)) || index.publicMapId;
    if (isWorkspaceMuted(maps.get(mapId)?.map.workspaceId)) {
      throw new Error('Memory is disabled for this workspace.');
    }
    const result = await upsertStarToMap(mapId, input, 'session', {
      sessionId: agent?.id,
    });
    return {
      status: result.status,
      id: result.star.id,
      message: result.merged
        ? 'Merged into an existing memory.'
        : result.conflict
          ? 'Saved as a new memory; a conflicting older memory was marked disputed.'
          : result.star.status === 'pending'
            ? 'Saved to the nebula for confirmation.'
            : 'Saved.',
      map: maps.get(mapId)?.map.name || '',
      mapKind: maps.get(mapId)?.map.kind || 'project',
    };
  }

  function applyMemoryFeedback(star, signal, actor = 'user') {
    const field =
      signal === 'used'
        ? 'usedCount'
        : signal === 'ignored'
          ? 'ignoredCount'
          : signal === 'wrong'
            ? 'wrongCount'
            : null;
    if (!field) throw new Error('signal must be used, ignored, or wrong');
    const before = Number(star[field] || 0);
    star[field] = before + 1;
    star.lastFeedbackAt = nowIso();
    star.updatedAt = nowIso();
    star.version = Number(star.version || 1) + 1;
    recordStarHistory(star, actor, [{ field, from: before, to: star[field] }]);
    if (signal === 'used') metrics.usedFeedback += 1;
    if (signal === 'ignored') metrics.ignoredFeedback += 1;
    if (signal === 'wrong') metrics.wrongFeedback += 1;
    scheduleMapSave(star.mapId, star.id);
    return {
      ok: true,
      id: star.id,
      signal,
      usedCount: Number(star.usedCount || 0),
      ignoredCount: Number(star.ignoredCount || 0),
      wrongCount: Number(star.wrongCount || 0),
    };
  }

  function registerTools() {
    ctx.tools.register({
      name: 'memory_search',
      description:
        'Search long-term memories by text, tags, or type. Scope: the public map plus the current project map. Use before answering when prior context may matter, and before editing a file or running a command.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look for.' },
          limit: { type: 'number', description: 'Maximum results (1-20, default 8).' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            stars: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
          required: ['stars'],
          additionalProperties: true,
        },
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
        },
      },
      presentCall(args) {
        return {
          card: 'generic',
          title: `查记忆 · ${String(args?.query ?? '').slice(0, 40)}`,
        };
      },
      async execute(args, exec) {
        await ready;
        if (bootError) throw new Error(`memory store unavailable: ${bootError.message}`);
        const agent = currentAgent(exec);
        if (!agent) throw new Error('memory tools require an agent context');
        const mapId = await ensureBinding(agent);
        const hits = searchInternal(agent, mapId, String(args?.query ?? ''), Number(args?.limit) || 8);
        return { stars: hits.map(compactHit) };
      },
    });

    ctx.tools.register({
      name: 'memory_save',
      description:
        'Save one stable fact. Provide title (<=20 chars), fact (<=120), optional reason (<=120) and condition (<=100), type, tags, refs, confidence (0.95 explicit, 0.8 repeated, 0.5 inferred), and target (auto=current project map, public=cross-project user facts). Do not save transient state, secrets, or instruction-like content.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short label, at most 20 characters.' },
          fact: { type: 'string', description: 'One self-contained claim, at most 120 characters.' },
          reason: { type: 'string', description: 'Why it is true, at most 120 characters.' },
          condition: { type: 'string', description: 'When or where it applies, at most 100 characters.' },
          type: { type: 'string', enum: TYPES },
          tags: { type: 'array', items: { type: 'string' } },
          refs: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          importance: { type: 'number' },
          target: { type: 'string', enum: ['auto', 'public'] },
        },
        required: ['title', 'fact', 'type'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            id: { type: 'string' },
            message: { type: 'string' },
            map: { type: 'string' },
            mapKind: { type: 'string' },
          },
          required: ['status', 'id', 'message', 'map', 'mapKind'],
          additionalProperties: false,
        },
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
        },
      },
      presentCall(args) {
        return {
          card: 'generic',
          title: `摘星 · ${String(args?.title ?? '记忆')}`,
          kind: 'other',
          content: [{ type: 'text', text: String(args?.fact ?? '') }],
        };
      },
      async execute(args, exec) {
        await ready;
        if (bootError) throw new Error(`memory store unavailable: ${bootError.message}`);
        const agent = currentAgent(exec);
        if (!agent) throw new Error('memory tools require an agent context');
        const result = await saveStarForAgent(agent, args);
        const session = ctx.sessions.get(agent.id);
        const turn = session ? ctx.agents.turnBoundaryOf(session)?.lastTurn || 0 : 0;
        if (turn) recordTurn(agent.id, turn, 'saved', 1);
        return result;
      },
    });

    ctx.tools.register({
      name: 'memory_link',
      description:
        'Create a relation between two memories: related, supports, contradicts, derived, or part-of. Use it when two memories are connected but not duplicates.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          relation: {
            type: 'string',
            enum: ['related', 'supports', 'contradicts', 'derived', 'part-of'],
          },
        },
        required: ['from', 'to', 'relation'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
          additionalProperties: false,
        },
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value) }];
        },
      },
      presentCall(args) {
        return { card: 'generic', title: `关联 · ${String(args?.relation ?? '')}` };
      },
      async execute(args) {
        await ready;
        const from = findStarAcross(String(args?.from ?? ''));
        const to = findStarAcross(String(args?.to ?? ''));
        if (!from || !to) throw new Error('memory not found');
        const relation = String(args?.relation ?? 'related');
        const exists = from.data.edges.some(
          (edge) =>
            edge.relation === relation &&
            ((edge.from === from.star.id && edge.to === to.star.id) ||
              (['related', 'contradicts'].includes(relation) &&
                edge.from === to.star.id &&
                edge.to === from.star.id)),
        );
        if (exists) return { ok: true };
        const edge = {
          id: uid('ed'),
          from: from.star.id,
          to: to.star.id,
          relation,
          createdBy: 'model',
          createdAt: nowIso(),
        };
        from.data.edges.push(edge);
        await persistEdgeDelta(from.star.mapId, [edge]);
        return { ok: true };
      },
    });

    ctx.tools.register({
      name: 'memory_forget',
      description:
        'Archive an outdated or wrong memory. Archived memories remain recoverable; never hard-delete. Use when the user corrects a fact or asks to forget.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { archived: { type: 'boolean' } },
          required: ['archived'],
          additionalProperties: false,
        },
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value) }];
        },
      },
      presentCall() {
        return { card: 'generic', title: '归档记忆' };
      },
      async execute(args) {
        await ready;
        const found = findStarAcross(String(args?.id ?? ''));
        if (!found) throw new Error('memory not found');
        const beforeStatus = found.star.status;
        found.star.status = 'archived';
        found.star.updatedAt = nowIso();
        found.star.version = Number(found.star.version || 1) + 1;
        recordStarHistory(found.star, 'model', [
          { field: 'status', from: beforeStatus, to: 'archived' },
        ]);
        invalidateIndex(found.star.mapId, found.star.id);
        scheduleMapSave(found.star.mapId, found.star.id);
        return { archived: true };
      },
    });

    ctx.tools.register({
      name: 'memory_feedback',
      description:
        'Record whether a memory was useful, ignored, or wrong. Adjusts future ranking without deleting the memory.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          signal: { type: 'string', enum: ['used', 'ignored', 'wrong'] },
        },
        required: ['id', 'signal'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            usedCount: { type: 'number' },
            ignoredCount: { type: 'number' },
            wrongCount: { type: 'number' },
          },
          required: ['ok'],
          additionalProperties: true,
        },
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value) }];
        },
      },
      presentCall(args) {
        return { card: 'generic', title: `记忆反馈 · ${String(args?.signal ?? '')}` };
      },
      async execute(args, exec) {
        await ready;
        if (settings.privacyIncognito) throw new Error('Memory is paused by privacy settings.');
        const agent = currentAgent(exec);
        if (isSessionMuted(agent)) throw new Error('Memory is disabled for this session.');
        const found = findStarAcross(String(args?.id ?? ''));
        if (!found) throw new Error('memory not found');
        if (isWorkspaceMuted(found.data.map.workspaceId)) {
          throw new Error('Memory is disabled for this workspace.');
        }
        return applyMemoryFeedback(found.star, String(args?.signal ?? ''), 'model');
      },
    });
  }

  function registerPrompt() {
    ctx.systemPrompt.section({
      name: 'memory-star-rules',
      order: 90,
      text: RULES,
    });
  }

  function registerAgentHooks() {
    ctx.on('agent/created', async (payload) => {
      await ready;
      const agent = payload?.agent;
      if (!agent) return;
      try {
        const agentCtx = agent.ctx;
        if (agentCtx?.systemPrompt?.context) {
          agentCtx.systemPrompt.context({
            name: 'memory-star-recall',
            order: 95,
            text: () => recallCache.get(agent.id) || '',
          });
        }
      } catch (error) {
        console.error('[memory-star] agent setup failed', error);
      }
    });

    ctx.on('agent/pre-step', async (payload, next) => {
      try {
        await ready;
        const agent = payload?.agent;
        if (!agent) return next();
        if (isSubagent(agent)) {
          recallCache.set(agent.id, '');
          return next();
        }
        const messages = payload?.messages || [];
        if (!messages.length) return next();
        const query = messages.map(messageText).join('\n').trim();
        if (!query) return next();
        const mapId = await ensureBinding(agent);
        const isFirst = payload.turn === 1 && payload.step === 1;
        let result;
        if (isFirst) {
          result = briefForAgent(agent, mapId, payload.turn);
          if (!result.text) result = recallForAgent(agent, mapId, query, payload.turn);
        } else {
          result = recallForAgent(agent, mapId, query, payload.turn);
        }
        recallCache.set(agent.id, result.text);
        const entries = recallLog.get(agent.id) || [];
        entries.push({
          turn: payload.turn,
          step: payload.step,
          at: nowIso(),
          count: result.count,
          starIds: result.starIds,
          text: result.text,
          mode: isFirst ? 'brief' : 'recall',
          mapId,
        });
        if (entries.length > 30) entries.shift();
        recallLog.set(agent.id, entries);
        if (result.count) recordTurn(agent.id, payload.turn, 'recalled', result.count);
      } catch (error) {
        console.error('[memory-star] pre-step failed', error);
      }
      return next();
    });

    ctx.on('agent/disposed', (payload) => {
      if (payload?.agent?.id) {
        recallCache.delete(payload.agent.id);
        recentRecalls.delete(payload.agent.id);
        recallLog.delete(payload.agent.id);
      }
    });
  }

  function sendJson(res, status, value) {
    const body = JSON.stringify(value);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(body);
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
  }

  async function readBuffer(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  function mapSummary(map) {
    const data = maps.get(map.id);
    const stars = data?.stars || [];
    return {
      ...map,
      starCount: stars.filter((star) => star.status === 'active').length,
      pendingCount: stars.filter((star) => star.status === 'pending').length,
      archivedCount: stars.filter((star) => star.status === 'archived').length,
    };
  }

  function registerApi() {
    const disposer = ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        try {
          await ready;
          const url = new URL(req.url || '/', 'http://localhost');
          const relative = url.pathname.slice(API_PREFIX.length) || '/';
          const parts = relative.split('/').filter(Boolean);
          const method = req.method || 'GET';

          if (method === 'GET' && parts[0] === 'maps' && !parts[1]) {
            sendJson(res, 200, {
              publicMapId: index.publicMapId,
              maps: index.maps.map(mapSummary),
            });
            return;
          }

          if (method === 'GET' && parts[0] === 'maps' && parts[1] && parts[2] === 'meta') {
            const data = maps.get(parts[1]);
            if (!data) {
              sendJson(res, 404, { error: 'map not found' });
              return;
            }
            const activeCount = data.stars.filter((star) => star.status === 'active').length;
            sendJson(res, 200, {
              map: data.map,
              publicMapId: index.publicMapId,
              total: activeCount,
              inactive: data.stars.filter((star) => star.status !== 'active'),
              constellations: data.constellations || [],
            });
            return;
          }

          if (method === 'GET' && parts[0] === 'maps' && parts[1] && parts[2] === 'viewport') {
            const data = maps.get(parts[1]);
            if (!data) {
              sendJson(res, 404, { error: 'map not found' });
              return;
            }
            const cx = Number(url.searchParams.get('cx')) || 0;
            const cy = Number(url.searchParams.get('cy')) || 0;
            const width = Math.max(320, Number(url.searchParams.get('w')) || 1600);
            const height = Math.max(240, Number(url.searchParams.get('h')) || 1000);
            const padding = Math.max(0, Number(url.searchParams.get('pad')) || 260);
            const limit = clamp(Number(url.searchParams.get('limit')) || 8000, 100, 20000);
            const viewport = viewportForMap(parts[1], cx, cy, width, height, padding, limit);
            metrics.viewportRequests += 1;
            sendJson(res, 200, {
              map: data.map,
              publicMapId: index.publicMapId,
              ...viewport,
            });
            return;
          }

          if (method === 'GET' && parts[0] === 'maps' && parts[1] && parts[2] === 'page') {
            const data = maps.get(parts[1]);
            if (!data) {
              sendJson(res, 404, { error: 'map not found' });
              return;
            }
            const limit = Math.max(
              1,
              Math.min(10000, Number(url.searchParams.get('limit')) || 2500),
            );
            const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
            const sorted = sortedActivePage(parts[1]) || [];
            const total = sorted.length;
            const page = sorted.slice(offset, offset + limit).map((entry) => entry.star);
            const pageIds = new Set(page.map((star) => star.id));
            const edges = (data.edges || []).filter(
              (edge) => pageIds.has(edge.from) && pageIds.has(edge.to),
            );
            sendJson(res, 200, {
              map: data.map,
              publicMapId: index.publicMapId,
              stars: page,
              edges,
              constellations: offset === 0 ? data.constellations || [] : [],
              inactive:
                offset === 0
                  ? data.stars.filter((star) => star.status !== 'active')
                  : [],
              total,
              offset,
              limit,
              nextOffset: Math.min(total, offset + page.length),
              hasMore: offset + page.length < total,
            });
            if (total >= 2000) setTimeout(() => prewarmIndex(parts[1]), 0);
            return;
          }

          if (method === 'GET' && parts[0] === 'maps' && parts[1]) {
            const data = maps.get(parts[1]);
            if (!data) {
              sendJson(res, 404, { error: 'map not found' });
              return;
            }
            sendJson(res, 200, {
              map: data.map,
              publicMapId: index.publicMapId,
              stars: data.stars,
              edges: data.edges,
              constellations: data.constellations,
            });
            return;
          }

          if (method === 'POST' && parts[0] === 'maps') {
            const body = await readBody(req);
            const map = makeMap(String(body.name || '新星图').slice(0, 40), 'project', body.workspaceId || null);
            index.maps.push(map);
            maps.set(map.id, { map, stars: [], edges: [], constellations: [] });
            await persistIndex();
            await persistMap(map.id);
            sendJson(res, 200, { map });
            return;
          }

          if (method === 'POST' && parts[0] === 'stars' && !parts[1]) {
            const body = await readBody(req);
            const mapId = body.mapId && maps.has(body.mapId) ? body.mapId : index.publicMapId;
            if (settings.privacyIncognito) {
              sendJson(res, 403, { error: 'Memory is paused by privacy settings.' });
              return;
            }
            if (isWorkspaceMuted(maps.get(mapId)?.map.workspaceId)) {
              sendJson(res, 403, { error: 'Memory is disabled for this workspace.' });
              return;
            }
            const probe = `${body.title ?? ''}\n${body.fact ?? ''}\n${body.reason ?? ''}\n${body.condition ?? ''}\n${
              Array.isArray(body.tags) ? body.tags.join(' ') : ''
            }\n${Array.isArray(body.refs) ? body.refs.join(' ') : ''}`;
            const sensitiveKind = detectSensitive(
              probe,
              settings.privacyMode,
              settings.customSensitiveWords,
            );
            if (isSensitive(probe) || sensitiveKind) {
              sendJson(res, 400, {
                error: `Sensitive content detected (${sensitiveKind || 'credentials'}); not saved.`,
              });
              return;
            }
            if (isInstructionLike(probe)) {
              sendJson(res, 400, { error: 'Instruction-like content detected; not saved.' });
              return;
            }
            const result = await upsertStarToMap(mapId, body, 'manual');
            await persistStarDelta(mapId, new Set([result.star.id]));
            sendJson(res, 200, {
              star: result.star,
              status: result.status,
              merged: Boolean(result.merged),
              conflict: Boolean(result.conflict),
            });
            return;
          }

          if (method === 'POST' && parts[0] === 'stars' && parts[1] && parts[2] === 'feedback') {
            const body = await readBody(req);
            const found = findStarAcross(parts[1]);
            if (!found) {
              sendJson(res, 404, { error: 'memory not found' });
              return;
            }
            try {
              const feedback = applyMemoryFeedback(
                found.star,
                String(body.signal || ''),
                'user',
              );
              await persistStarDelta(found.star.mapId, new Set([found.star.id]));
              sendJson(res, 200, feedback);
            } catch (error) {
              sendJson(res, 400, { error: String(error?.message || error) });
            }
            return;
          }

          if (method === 'GET' && parts[0] === 'stars' && parts[1]) {
            const found = findStarAcross(parts[1]);
            if (!found) {
              sendJson(res, 404, { error: 'memory not found' });
              return;
            }
            sendJson(res, 200, { star: found.star, map: found.data.map });
            return;
          }

          if (method === 'PATCH' && parts[0] === 'stars' && parts[1]) {
            const body = await readBody(req);
            const found = findStarAcross(parts[1]);
            if (!found) {
              sendJson(res, 404, { error: 'memory not found' });
              return;
            }
            const editable = ['title', 'fact', 'reason', 'condition', 'type', 'tags', 'refs', 'importance', 'pinned', 'status', 'disputed'];
            const changedFields = editable.filter((key) => key in body);
            const before = {};
            for (const key of changedFields) {
              before[key] = found.star[key];
              found.star[key] = body[key];
            }
            found.star.updatedAt = nowIso();
            found.star.version = Number(found.star.version || 1) + 1;
            recordStarHistory(found.star, 'user', diffFields(before, found.star, changedFields));
            invalidateIndex(found.star.mapId, found.star.id);
            await persistStarDelta(found.star.mapId, new Set([found.star.id]));
            sendJson(res, 200, { star: found.star });
            return;
          }

          if (method === 'POST' && parts[0] === 'stars' && parts[1] && parts[2] === 'restore') {
            const body = await readBody(req);
            const found = findStarAcross(parts[1]);
            if (!found) {
              sendJson(res, 404, { error: 'memory not found' });
              return;
            }
            const target = Number(body.version);
            const current = Number(found.star.version || 1);
            if (!Number.isInteger(target) || target < 1 || target > current) {
              sendJson(res, 400, { error: 'invalid history version' });
              return;
            }
            const history = Array.isArray(found.star.history) ? found.star.history : [];
            const oldest = history.length
              ? Math.min(...history.map((entry) => Number(entry.version) || 1))
              : current;
            if (!history.length || target < oldest) {
              sendJson(res, 400, { error: 'history is not available for that version' });
              return;
            }
            if (target === current) {
              sendJson(res, 200, { star: found.star });
              return;
            }
            const stateFields = [
              'title',
              'fact',
              'reason',
              'condition',
              'type',
              'tags',
              'refs',
              'importance',
              'pinned',
              'status',
              'disputed',
            ];
            const state = {};
            for (const field of stateFields) state[field] = found.star[field];
            for (let index = history.length - 1; index >= 0; index -= 1) {
              const entry = history[index];
              if (Number(entry.version) <= target) break;
              for (const change of entry.changes || []) {
                if (stateFields.includes(change.field) && change.from !== undefined) {
                  state[change.field] = change.from;
                }
              }
            }
            for (const field of stateFields) {
              if (state[field] === undefined) continue;
              found.star[field] = Array.isArray(state[field]) ? [...state[field]] : state[field];
            }
            found.star.updatedAt = nowIso();
            found.star.version = current + 1;
            recordStarHistory(found.star, 'user', [
              { field: 'restore', from: current, to: target },
            ]);
            invalidateIndex(found.star.mapId, found.star.id);
            await persistStarDelta(found.star.mapId, new Set([found.star.id]));
            sendJson(res, 200, { star: found.star });
            return;
          }

          if (method === 'DELETE' && parts[0] === 'stars' && parts[1]) {
            const id = parts[1];
            const found = findStarAcross(id);
            if (!found) {
              sendJson(res, 404, { error: 'memory not found' });
              return;
            }
            found.data.stars = found.data.stars.filter((star) => star.id !== id);
            found.data.edges = found.data.edges.filter((edge) => edge.from !== id && edge.to !== id);
            for (const constellation of found.data.constellations) {
              constellation.starIds = (constellation.starIds || []).filter((starId) => starId !== id);
            }
            const layout = layoutCache.get(found.star.mapId);
            if (layout) {
              layout.starsById.delete(id);
              layout.positions.delete(id);
            }
            invalidateIndex(found.star.mapId, found.star.id);
            await persistStarDelta(found.star.mapId, new Set([id]));
            sendJson(res, 200, { deleted: true });
            return;
          }

          if (method === 'DELETE' && parts[0] === 'maps' && parts[1]) {
            const id = parts[1];
            if (id === index.publicMapId) {
              sendJson(res, 400, { error: 'the public map cannot be deleted' });
              return;
            }
            if (!maps.has(id)) {
              sendJson(res, 404, { error: 'map not found' });
              return;
            }
            index.maps = index.maps.filter((map) => map.id !== id);
            maps.delete(id);
            let bindingsChanged = false;
            for (const [sessionId, mapId] of bindings) {
              if (mapId === id) {
                bindings.set(sessionId, null);
                bindingsChanged = true;
              }
            }
            await persistIndex();
            if (bindingsChanged) await persistBindings();
            await fs.unlink(mapPath(id)).catch(() => {});
            await fs.unlink(journalPath(id)).catch(() => {});
            layoutCache.delete(id);
            starLocator = null;
            sendJson(res, 200, { deleted: true });
            return;
          }

          if (method === 'GET' && parts[0] === 'binding') {
            const sessionId = url.searchParams.get('sessionId') || '';
            if (!sessionId) {
              sendJson(res, 400, { error: 'sessionId is required' });
              return;
            }
            const mapId = await ensureBinding({ id: sessionId });
            const map = mapId ? maps.get(mapId)?.map : null;
            sendJson(res, 200, {
              sessionId,
              mapId: mapId || null,
              name: map ? map.name : '公共星图',
              kind: map ? map.kind : 'public',
              publicMapId: index.publicMapId,
              publicName: maps.get(index.publicMapId)?.map.name || '公共星图',
            });
            return;
          }

          if (method === 'POST' && parts[0] === 'binding') {
            const body = await readBody(req);
            const sessionId = String(body.sessionId || '');
            const mapId = String(body.mapId || '');
            if (!sessionId) {
              sendJson(res, 400, { error: 'sessionId is required' });
              return;
            }
            if (!mapId || mapId === index.publicMapId) {
              bindings.set(sessionId, null);
              await persistBindings();
              sendJson(res, 200, {
                sessionId,
                mapId: null,
                name: '公共星图',
                kind: 'public',
                publicMapId: index.publicMapId,
                publicName: maps.get(index.publicMapId)?.map.name || '公共星图',
              });
              return;
            }
            const target = maps.get(mapId);
            if (!target || target.map.kind !== 'project') {
              sendJson(res, 400, { error: 'a valid project mapId is required' });
              return;
            }
            bindings.set(sessionId, mapId);
            await persistBindings();
            sendJson(res, 200, {
              sessionId,
              mapId,
              name: target.map.name,
              kind: target.map.kind,
              publicMapId: index.publicMapId,
              publicName: maps.get(index.publicMapId)?.map.name || '公共星图',
            });
            return;
          }

          if (method === 'POST' && parts[0] === 'edges') {
            const body = await readBody(req);
            const fromId = String(body.from || '');
            const toId = String(body.to || '');
            const allowed = ['related', 'supports', 'contradicts', 'derived', 'part-of', 'supersedes'];
            const relation = allowed.includes(body.relation) ? body.relation : 'related';
            const from = findStarAcross(fromId);
            const to = findStarAcross(toId);
            if (!from || !to) {
              sendJson(res, 404, { error: 'memory not found' });
              return;
            }
            if (from.star.mapId !== to.star.mapId) {
              sendJson(res, 400, { error: 'edges must connect memories in the same map' });
              return;
            }
            const data = from.data;
            const existing = data.edges.find(
              (edge) => edge.from === fromId && edge.to === toId && edge.relation === relation,
            );
            if (existing) {
              sendJson(res, 200, { edge: existing });
              return;
            }
            const edge = {
              id: uid('ed'),
              from: fromId,
              to: toId,
              relation,
              createdBy: 'user',
              createdAt: nowIso(),
            };
            data.edges.push(edge);
            await persistEdgeDelta(from.star.mapId, [edge]);
            sendJson(res, 201, { edge });
            return;
          }

          if (method === 'POST' && parts[0] === 'conflicts' && parts[1] === 'resolve') {
            const body = await readBody(req);
            const keepId = String(body.keepId || '');
            const dropId = String(body.dropId || '');
            const mode = String(body.mode || 'keep-both');
            const keep = findStarAcross(keepId);
            const drop = findStarAcross(dropId);
            if (!keep || !drop) {
              sendJson(res, 404, { error: 'memory not found' });
              return;
            }
            if (keep.star.mapId !== drop.star.mapId) {
              sendJson(res, 400, { error: 'conflicting memories must be in the same map' });
              return;
            }
            const data = keep.data;
            const keepBefore = {
              status: keep.star.status,
              disputed: keep.star.disputed,
              reason: keep.star.reason,
            };
            const dropBefore = {
              status: drop.star.status,
              disputed: drop.star.disputed,
              reason: drop.star.reason,
            };
            keep.star.disputed = false;
            drop.star.disputed = false;
            keep.star.updatedAt = nowIso();
            drop.star.updatedAt = nowIso();
            keep.star.version = Number(keep.star.version || 1) + 1;
            drop.star.version = Number(drop.star.version || 1) + 1;
            if (mode === 'supersede' || mode === 'merge') {
              drop.star.status = 'archived';
              if (mode === 'merge') {
                keep.star.reason = [keep.star.reason, `合并自：${drop.star.fact}`]
                  .filter(Boolean)
                  .join('；')
                  .slice(0, 120);
                keep.star.mergedFrom = Array.isArray(keep.star.mergedFrom)
                  ? keep.star.mergedFrom
                  : [];
                keep.star.mergedFrom.push({
                  title: drop.star.title,
                  fact: drop.star.fact,
                  at: nowIso(),
                  source: 'conflict',
                });
                if (keep.star.mergedFrom.length > 10) {
                  keep.star.mergedFrom = keep.star.mergedFrom.slice(-10);
                }
              }
            }
            for (const edge of data.edges) {
              if (
                (edge.from === keepId && edge.to === dropId) ||
                (edge.from === dropId && edge.to === keepId)
              ) {
                edge.relation = mode === 'keep-both' ? 'contradicts' : 'supersedes';
                edge.resolvedAt = nowIso();
              }
            }
            invalidateIndex(keep.star.mapId, keep.star.id);
            invalidateIndex(drop.star.mapId, drop.star.id);
            recordStarHistory(
              keep.star,
              'user',
              diffFields(keepBefore, keep.star, ['status', 'disputed', 'reason']),
            );
            recordStarHistory(
              drop.star,
              'user',
              diffFields(dropBefore, drop.star, ['status', 'disputed', 'reason']),
            );
            await persistMap(keep.star.mapId);
            sendJson(res, 200, { ok: true });
            return;
          }

          if (method === 'POST' && parts[0] === 'constellations' && parts[1] === 'suggest') {
            const body = await readBody(req);
            const mapId = String(body.mapId || '');
            const data = maps.get(mapId);
            if (!data) {
              sendJson(res, 404, { error: 'map not found' });
              return;
            }
            const groups = new Map();
            for (const star of data.stars) {
              if (star.status !== 'active') continue;
              for (const tag of star.tags || []) {
                const name = String(tag).trim();
                if (!name) continue;
                if (!groups.has(name)) groups.set(name, []);
                groups.get(name).push(star.id);
              }
            }
            const suggestions = [...groups.entries()]
              .filter(([, starIds]) => starIds.length >= 3)
              .sort((a, b) => b[1].length - a[1].length)
              .slice(0, 8)
              .map(([name, starIds], index) => ({
                name,
                starIds,
                color: COLORS[index % COLORS.length],
              }));
            const previousAuto = data.constellations.filter((constellation) => constellation.auto);
            const manual = data.constellations.filter((constellation) => !constellation.auto);
            const nextAuto = suggestions.map((suggestion) => {
              const previous = previousAuto.find(
                (constellation) => constellation.name === suggestion.name,
              );
              return {
                id: previous?.id || uid('co'),
                mapId,
                name: suggestion.name,
                starIds: suggestion.starIds,
                color: suggestion.color,
                auto: true,
                createdAt: previous?.createdAt || nowIso(),
                updatedAt: nowIso(),
              };
            });
            data.constellations = [...manual, ...nextAuto];
            const nextIds = new Set(nextAuto.map((constellation) => constellation.id));
            const removedAuto = previousAuto
              .filter((constellation) => !nextIds.has(constellation.id))
              .map((constellation) => constellation.id);
            await persistConstellationDelta(mapId, nextAuto, removedAuto);
            sendJson(res, 200, {
              constellations: data.constellations,
              suggested: nextAuto.length,
            });
            return;
          }

          if (method === 'GET' && parts[0] === 'search') {
            const query = url.searchParams.get('q') || '';
            const limit = Number(url.searchParams.get('limit')) || 20;
            const graph = url.searchParams.get('graph') === '1';
            const hits = searchAcrossMaps([...maps.keys()], query, limit, { graph });
            sendJson(res, 200, {
              query,
              stars: hits.map(compactHit),
            });
            return;
          }

          if (method === 'GET' && parts[0] === 'export') {
            const mapId = url.searchParams.get('mapId') || '';
            const selected = mapId
              ? [maps.get(mapId)].filter(Boolean)
              : [...maps.values()];
            const payload = {
              format: 'rian-memory-star',
              version: 1,
              exportedAt: nowIso(),
              maps: selected.map((data) => ({
                map: data.map,
                stars: data.stars,
                edges: data.edges,
                constellations: data.constellations,
              })),
              ...(mapId ? {} : { settings }),
            };
            if (url.searchParams.get('zip') === '1') {
              const stamp = new Date().toISOString().slice(0, 10);
              const starCount = payload.maps.reduce((sum, entry) => sum + entry.stars.length, 0);
              const edgeCount = payload.maps.reduce((sum, entry) => sum + entry.edges.length, 0);
              const historyCount = payload.maps.reduce(
                (sum, entry) =>
                  sum + entry.stars.reduce((inner, star) => inner + (star.history?.length || 0), 0),
                0,
              );
              const files = {
                'manifest.json': JSON.stringify(
                  {
                    format: 'rian-memory-star',
                    version: 1,
                    schemaVersion: 1,
                    exportedAt: payload.exportedAt,
                    maps: payload.maps.map((entry) => ({
                      id: entry.map.id,
                      name: entry.map.name,
                      kind: entry.map.kind,
                      starCount: entry.stars.length,
                      edgeCount: entry.edges.length,
                    })),
                    counts: {
                      maps: payload.maps.length,
                      stars: starCount,
                      edges: edgeCount,
                      history: historyCount,
                    },
                  },
                  null,
                  2,
                ),
                ...Object.fromEntries(
                  payload.maps.map((entry) => [
                    `maps/${entry.map.id}.json`,
                    JSON.stringify(entry, null, 2),
                  ]),
                ),
                ...(payload.settings
                  ? { 'settings.json': JSON.stringify(payload.settings, null, 2) }
                  : {}),
              };
              const archive = zipSync(files);
              res.writeHead(200, {
                'content-type': 'application/zip',
                'content-disposition': `attachment; filename="rian-memory-star-${stamp}.memstar.zip"`,
                'content-length': archive.length,
              });
              res.end(archive);
              return;
            }
            sendJson(res, 200, payload);
            return;
          }

          if (method === 'POST' && parts[0] === 'import') {
            const body = await readBody(req);
            if (body?.format !== 'rian-memory-star' || !Array.isArray(body.maps)) {
              sendJson(res, 400, { error: 'unsupported import format' });
              return;
            }
            if (url.searchParams.get('preview') === '1') {
              sendJson(res, 200, previewEntries(body.maps));
              return;
            }
            const strategy = url.searchParams.get('strategy') === 'merge' ? 'merge' : 'copy';
            const sanitize = url.searchParams.get('privacy') !== 'allow';
            const imported = await importMapEntries(body.maps, strategy, { sanitize });
            sendJson(res, 200, { imported });
            return;
          }

          if (method === 'POST' && parts[0] === 'import-zip') {
            const buffer = await readBuffer(req);
            const files = unzipSync(buffer);
            const manifestBuffer = files.get('manifest.json');
            if (!manifestBuffer) {
              sendJson(res, 400, { error: 'manifest.json is missing' });
              return;
            }
            const manifest = JSON.parse(manifestBuffer.toString('utf8'));
            if (manifest?.format !== 'rian-memory-star') {
              sendJson(res, 400, { error: 'unsupported import format' });
              return;
            }
            const entries = [];
            for (const [name, content] of files) {
              if (name.startsWith('maps/') && name.endsWith('.json')) {
                entries.push(JSON.parse(content.toString('utf8')));
              }
            }
            if (!entries.length) {
              sendJson(res, 400, { error: 'no map files found' });
              return;
            }
            if (url.searchParams.get('preview') === '1') {
              sendJson(res, 200, previewEntries(entries));
              return;
            }
            const strategy = url.searchParams.get('strategy') === 'merge' ? 'merge' : 'copy';
            const sanitize = url.searchParams.get('privacy') !== 'allow';
            const imported = await importMapEntries(entries, strategy, { sanitize });
            sendJson(res, 200, { imported });
            return;
          }

          if (method === 'GET' && parts[0] === 'settings') {
            sendJson(res, 200, { settings, defaults: { ...DEFAULT_SETTINGS } });
            return;
          }

          if (method === 'POST' && parts[0] === 'settings') {
            const body = await readBody(req);
            settings = { ...settings, ...body };
            HALF_LIFE_DAYS = Number(settings.halfLifeDays) || 45;
            await persistSettings();
            sendJson(res, 200, { settings });
            return;
          }

          if (method === 'GET' && parts[0] === 'recall-log') {
            const sessionId = url.searchParams.get('sessionId') || '';
            sendJson(res, 200, {
              sessionId,
              entries: recallLog.get(sessionId) || [],
            });
            return;
          }

          if (method === 'GET' && parts[0] === 'traces') {
            const sessionId = url.searchParams.get('sessionId') || '';
            const perSession = turnTrace.get(sessionId);
            sendJson(res, 200, {
              turns: perSession ? [...perSession.values()].sort((a, b) => a.turn - b.turn) : [],
            });
            return;
          }

          if (method === 'GET' && parts[0] === 'health') {
            const all = [...maps.values()].flatMap((data) => data.stars);
            const mapsDetail = index.maps.map((map) => {
              const stars = maps.get(map.id)?.stars || [];
              return {
                id: map.id,
                name: map.name,
                kind: map.kind,
                stars: stars.length,
                active: stars.filter((star) => star.status === 'active').length,
                pending: stars.filter((star) => star.status === 'pending').length,
                disputed: stars.filter((star) => star.status === 'active' && star.disputed).length,
              };
            });
            let backups = 0;
            try {
              backups = (await fs.readdir(backupsDir)).filter((name) =>
                name.endsWith('.zip'),
              ).length;
            } catch {
              // no backups yet
            }
            sendJson(res, 200, {
              maps: index.maps.length,
              stars: all.length,
              pending: all.filter((star) => star.status === 'pending').length,
              active: all.filter((star) => star.status === 'active').length,
              archived: all.filter((star) => star.status === 'archived').length,
              rejected: all.filter((star) => star.status === 'rejected').length,
              disputed: all.filter((star) => star.status === 'active' && star.disputed).length,
              mapsDetail,
              metrics: { ...metrics },
              backups,
              version: PLUGIN_VERSION,
              schemaVersion: 1,
              profile: process.env.DSH_PROFILE || null,
              profileDir: process.env.DSH_PROFILE_DIR || null,
              dataDir,
            });
            return;
          }

          sendJson(res, 404, { error: 'not found' });
        } catch (error) {
          sendJson(res, 500, { error: String(error?.message || error) });
        }
      },
    });
    return disposer;
  }

  registerTools();
  registerPrompt();
  registerAgentHooks();
  ctx.effect(() => registerApi());

  ctx.effect(() => () => {
    for (const timer of saveTimers.values()) clearTimeout(timer);
    saveTimers.clear();
    const writes = [];
    for (const mapId of maps.keys()) {
      writes.push(persistMap(mapId).catch(() => {}));
    }
    writes.push(persistIndex().catch(() => {}));
    writes.push(persistBindings().catch(() => {}));
    return Promise.allSettled(writes).then(() => releaseProfileLock());
  });
}

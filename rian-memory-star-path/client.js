window.__ModuleLoader__.load({
  id: 'rian-memory-star-path',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const API = '/plugins/rian-memory-star-path/api-v2';

    const THEMES = {
      dark: {
        bg: '#0B1026',
        panel: '#10162F',
        panel2: '#131A3A',
        text: '#E8ECFF',
        border: 'rgba(190,205,255,0.2)',
        subtle: 'rgba(255,255,255,0.06)',
      },
      light: {
        bg: '#F4F6FB',
        panel: '#FFFFFF',
        panel2: '#E9EEF9',
        text: '#17203A',
        border: 'rgba(23,32,58,0.18)',
        subtle: 'rgba(23,32,58,0.06)',
      },
    };

    function applyTheme(name) {
      if (typeof document === 'undefined') return;
      const theme = THEMES[name] || THEMES.dark;
      const root = document.documentElement;
      root.style.setProperty('--ms-bg', theme.bg);
      root.style.setProperty('--ms-panel', theme.panel);
      root.style.setProperty('--ms-panel-2', theme.panel2);
      root.style.setProperty('--ms-text', theme.text);
      root.style.setProperty('--ms-border', theme.border);
      root.style.setProperty('--ms-subtle', theme.subtle);
    }

    applyTheme('dark');

    const TYPE_COLOR = {
      fact: '#CFE3FF',
      preference: '#FFD479',
      decision: '#7FD8FF',
      event: '#B98CFF',
      entity: '#FF9EC4',
      procedure: '#8FE3B0',
    };
    const TYPE_LABEL = {
      fact: '事实',
      preference: '偏好',
      decision: '决策',
      event: '事件',
      entity: '实体',
      procedure: '经验',
    };
    const CONSTELLATION_COLORS = ['#7FD8FF', '#FFD479', '#B98CFF', '#8FE3B0', '#FF9EC4', '#9BB8FF'];
    const HISTORY_FIELD_LABEL = {
      created: '创建',
      title: '标题',
      fact: '事实',
      reason: '理由',
      condition: '条件',
      type: '类型',
      tags: '标签',
      refs: '引用',
      importance: '重要度',
      confidence: '置信度',
      status: '状态',
      disputed: '冲突',
      pinned: '固定',
      restore: '恢复',
    };

    function shortValue(value) {
      if (Array.isArray(value)) return value.join(', ');
      if (value === null || value === undefined) return '—';
      const text = String(value);
      return text.length > 36 ? `${text.slice(0, 36)}…` : text;
    }

    async function api(path, options) {
      const response = await fetch(API + path, {
        headers: { 'content-type': 'application/json' },
        ...(options || {}),
      });
      const text = await response.text();
      let value = {};
      try {
        value = text ? JSON.parse(text) : {};
      } catch {
        value = { error: text };
      }
      if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
      return value;
    }

    function weightOf(star) {
      const stamp = Date.parse(star.lastRecalledAt || star.updatedAt || star.createdAt || '');
      const ageDays = Number.isFinite(stamp) ? Math.max(0, (Date.now() - stamp) / 86400000) : 0;
      const recency = Math.pow(0.5, ageDays / 45);
      const base = Number(star.importance ?? 0.5);
      const recall = Math.min(0.15, Number(star.recallCount || 0) * 0.01);
      return Math.min(1, Math.max(0, base * (0.35 + 0.65 * recency) + recall + (star.pinned ? 0.25 : 0)));
    }

    function hexToRgb(hex) {
      const value = String(hex || '#CFE3FF').replace('#', '');
      return [
        parseInt(value.slice(0, 2), 16) / 255,
        parseInt(value.slice(2, 4), 16) / 255,
        parseInt(value.slice(4, 6), 16) / 255,
      ];
    }

    function hexAlpha(hex, alpha) {
      const [red, green, blue] = hexToRgb(hex);
      return `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${alpha})`;
    }

    const LAYOUT_WORKER = `
let nodes = [];
let edges = [];
let width = 600;
let height = 400;
self.onmessage = (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'init') return;
  nodes = msg.nodes.map((node) => ({ ...node, vx: 0, vy: 0 }));
  edges = msg.edges || [];
  width = msg.width;
  height = msg.height;
  run();
};
function post() {
  self.postMessage({ type: 'tick', positions: nodes.map((node) => [node.id, node.x, node.y]) });
}
function run() {
  const count = nodes.length;
  const maxIterations = count > 5000 ? 120 : 160;
  let alpha = 1;
  let iteration = 0;
  function step() {
    const exact = count <= 600;
    const sampleCount = 14;
    const stride = exact ? 1 : Math.max(1, Math.floor(count / sampleCount));
    for (let i = 0; i < count; i++) {
      const a = nodes[i];
      if (exact) {
        for (let j = i + 1; j < count; j++) {
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            d2 = 1;
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
          }
          const d = Math.sqrt(d2);
          const force = (1800 * alpha) / d2;
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      } else {
        for (let k = 1; k <= sampleCount; k++) {
          const j = (i + k * stride + (i % 5)) % count;
          if (j === i) continue;
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            d2 = 1;
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
          }
          const d = Math.sqrt(d2);
          const force = (1800 * alpha) / d2;
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }
    for (const edge of edges) {
      const a = nodes[edge[0]];
      const b = nodes[edge[1]];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (d - 110) * 0.02 * alpha;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (const node of nodes) {
      node.vx += (width / 2 - node.x) * 0.002 * alpha;
      node.vy += (height / 2 - node.y) * 0.002 * alpha;
      node.vx *= 0.86;
      node.vy *= 0.86;
      node.x = Math.max(40, Math.min(width - 40, node.x + node.vx));
      node.y = Math.max(40, Math.min(height - 40, node.y + node.vy));
    }
    alpha *= 0.985;
    iteration += 1;
    if (iteration % 4 === 0) post();
    if (iteration < maxIterations && alpha > 0.02) setTimeout(step, 0);
    else post();
  }
  step();
}
`;

    function createWebGLRenderer(canvas) {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });
      if (!gl) return null;

      const starVS = `#version 300 es
in vec2 a_position;
in float a_size;
in vec3 a_color;
uniform vec2 u_resolution;
out vec3 v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;

      const starFS = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 out_color;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  float core = smoothstep(1.0, 0.0, d);
  float glow = pow(core, 2.0);
  out_color = vec4(v_color, clamp(core * 0.92 + glow * 0.32, 0.0, 1.0));
}`;

      const lineVS = `#version 300 es
in vec2 a_position;
uniform vec2 u_resolution;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
}`;

      const lineFS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 out_color;
void main() {
  out_color = u_color;
}`;

      function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error('[memory-star] shader error', gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      }

      function createProgram(vsSource, fsSource) {
        const vs = compile(gl.VERTEX_SHADER, vsSource);
        const fs = compile(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.error('[memory-star] program error', gl.getProgramInfoLog(program));
          gl.deleteProgram(program);
          return null;
        }
        return program;
      }

      const starProgram = createProgram(starVS, starFS);
      const lineProgram = createProgram(lineVS, lineFS);
      if (!starProgram || !lineProgram) return null;

      const starVao = gl.createVertexArray();
      const starPosBuffer = gl.createBuffer();
      const starSizeBuffer = gl.createBuffer();
      const starColorBuffer = gl.createBuffer();
      gl.bindVertexArray(starVao);
      const starPosLoc = gl.getAttribLocation(starProgram, 'a_position');
      const starSizeLoc = gl.getAttribLocation(starProgram, 'a_size');
      const starColorLoc = gl.getAttribLocation(starProgram, 'a_color');
      gl.bindBuffer(gl.ARRAY_BUFFER, starPosBuffer);
      gl.enableVertexAttribArray(starPosLoc);
      gl.vertexAttribPointer(starPosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, starSizeBuffer);
      gl.enableVertexAttribArray(starSizeLoc);
      gl.vertexAttribPointer(starSizeLoc, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, starColorBuffer);
      gl.enableVertexAttribArray(starColorLoc);
      gl.vertexAttribPointer(starColorLoc, 3, gl.FLOAT, false, 0, 0);

      const lineVao = gl.createVertexArray();
      const lineBuffer = gl.createBuffer();
      gl.bindVertexArray(lineVao);
      const linePosLoc = gl.getAttribLocation(lineProgram, 'a_position');
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.enableVertexAttribArray(linePosLoc);
      gl.vertexAttribPointer(linePosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      const starResLoc = gl.getUniformLocation(starProgram, 'u_resolution');
      const lineResLoc = gl.getUniformLocation(lineProgram, 'u_resolution');
      const lineColorLoc = gl.getUniformLocation(lineProgram, 'u_color');

      return {
        canvas,
        draw(width, height, dpr, positions, edges) {
          const pixelWidth = Math.max(1, Math.floor(width * dpr));
          const pixelHeight = Math.max(1, Math.floor(height * dpr));
          if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
          if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
          gl.viewport(0, 0, pixelWidth, pixelHeight);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

          if (edges.length) {
            const lineData = new Float32Array(edges.length * 4);
            let cursor = 0;
            for (const edge of edges) {
              lineData[cursor++] = edge.from.x * dpr;
              lineData[cursor++] = edge.from.y * dpr;
              lineData[cursor++] = edge.to.x * dpr;
              lineData[cursor++] = edge.to.y * dpr;
            }
            gl.useProgram(lineProgram);
            gl.uniform2f(lineResLoc, pixelWidth, pixelHeight);
            gl.uniform4f(lineColorLoc, 0.72, 0.8, 1.0, 0.18);
            gl.bindVertexArray(lineVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
            gl.drawArrays(gl.LINES, 0, edges.length * 2);
          }

          const count = positions.length;
          if (count) {
            const positionData = new Float32Array(count * 2);
            const sizeData = new Float32Array(count);
            const colorData = new Float32Array(count * 3);
            positions.forEach((item, index) => {
              const weight = weightOf(item.star);
              const radius = 3.5 + 9 * Number(item.star.importance ?? 0.5) * weight;
              positionData[index * 2] = item.x * dpr;
              positionData[index * 2 + 1] = item.y * dpr;
              sizeData[index] = Math.max(2, radius * 2 * dpr);
              const rgb = hexToRgb(TYPE_COLOR[item.star.type] || '#CFE3FF');
              colorData[index * 3] = rgb[0];
              colorData[index * 3 + 1] = rgb[1];
              colorData[index * 3 + 2] = rgb[2];
            });
            gl.useProgram(starProgram);
            gl.uniform2f(starResLoc, pixelWidth, pixelHeight);
            gl.bindVertexArray(starVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, starPosBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, starSizeBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, sizeData, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, starColorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.DYNAMIC_DRAW);
            gl.drawArrays(gl.POINTS, 0, count);
          }
        },
      };
    }

    function drawLabels(canvas, width, height, dpr, positions, selectedId, emptyText, constellations) {
      if (!canvas) return;
      const pixelWidth = Math.max(1, Math.floor(width * dpr));
      const pixelHeight = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const surface = canvas.getContext('2d');
      if (!surface) return;
      surface.setTransform(dpr, 0, 0, dpr, 0, 0);
      surface.clearRect(0, 0, width, height);
      for (let index = 0; index < 70; index += 1) {
        const x = (index * 97) % width;
        const y = (index * 53) % height;
        surface.strokeStyle = 'rgba(155,184,255,0.06)';
        surface.lineWidth = 1;
        surface.beginPath();
        surface.moveTo(x, y);
        surface.lineTo(x - 3, y + 16);
        surface.stroke();
      }
      const byId = new Map(positions.map((item) => [item.star.id, item]));
      for (const [index, constellation] of (constellations || []).entries()) {
        const members = (constellation.starIds || [])
          .map((starId) => byId.get(starId))
          .filter(Boolean);
        if (members.length < 2) continue;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const member of members) {
          minX = Math.min(minX, member.x);
          minY = Math.min(minY, member.y);
          maxX = Math.max(maxX, member.x);
          maxY = Math.max(maxY, member.y);
        }
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const radius = Math.max(52, Math.max(maxX - minX, maxY - minY) / 2 + 34);
        const color = constellation.color || CONSTELLATION_COLORS[index % CONSTELLATION_COLORS.length];
        const gradient = surface.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, hexAlpha(color, 0.1));
        gradient.addColorStop(1, hexAlpha(color, 0));
        surface.fillStyle = gradient;
        surface.beginPath();
        surface.arc(centerX, centerY, radius, 0, Math.PI * 2);
        surface.fill();
        surface.strokeStyle = hexAlpha(color, 0.22);
        surface.lineWidth = 1;
        surface.setLineDash([4, 6]);
        surface.beginPath();
        surface.arc(centerX, centerY, radius, 0, Math.PI * 2);
        surface.stroke();
        surface.setLineDash([]);
        surface.fillStyle = hexAlpha(color, 0.75);
        surface.font = '11px system-ui, sans-serif';
        surface.textAlign = 'center';
        surface.fillText(constellation.name || '', centerX, Math.max(12, centerY - radius + 12));
        surface.textAlign = 'start';
      }
      for (const item of positions) {
        const weight = weightOf(item.star);
        const radius = 3.5 + 9 * Number(item.star.importance ?? 0.5) * weight;
        if (item.star.id === selectedId) {
          surface.strokeStyle = '#FFD479';
          surface.lineWidth = 2;
          surface.beginPath();
          surface.arc(item.x, item.y, radius + 5, 0, Math.PI * 2);
          surface.stroke();
        }
        if (weight > 0.55 && positions.length <= 120) {
          surface.fillStyle = 'rgba(232,236,255,0.82)';
          surface.font = '11px system-ui, sans-serif';
          surface.fillText(item.star.title, item.x + radius + 6, item.y + 4);
        }
      }
      if (emptyText) {
        surface.fillStyle = 'rgba(232,236,255,0.62)';
        surface.font = '14px system-ui, sans-serif';
        surface.textAlign = 'center';
        surface.fillText(emptyText, width / 2, height / 2);
        surface.textAlign = 'start';
      }
    }

    function MemoryIcon({ size = 20 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true },
        h('path', {
          d: 'M12 2l2.6 6.3L21 9l-4.9 4.3L17.5 20 12 16.7 6.5 20l1.4-6.7L3 9l6.4-.7z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M5 21l-1 2M9 22l-1 2M17 21l-1 2M21 22l-1 2',
          stroke: 'currentColor',
          strokeWidth: 1,
          strokeLinecap: 'round',
          opacity: 0.6,
        }),
      );
    }

    function Panel() {
      const [maps, setMaps] = React.useState([]);
      const [publicMapId, setPublicMapId] = React.useState(null);
      const [activeId, setActiveId] = React.useState(null);
      const [data, setData] = React.useState(null);
      const [selectedId, setSelectedId] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [draft, setDraft] = React.useState(null);
      const [mapDraft, setMapDraft] = React.useState(null);
      const [confirmDelete, setConfirmDelete] = React.useState(null);
      const [editDraft, setEditDraft] = React.useState(null);
      const [query, setQuery] = React.useState('');
      const [globalResults, setGlobalResults] = React.useState([]);
      const [pendingSelectId, setPendingSelectId] = React.useState(null);
      const [nebulaSelected, setNebulaSelected] = React.useState([]);
      const [bulkConfirm, setBulkConfirm] = React.useState(null);
      const [settings, setSettings] = React.useState(null);
      const [nebulaOpen, setNebulaOpen] = React.useState(false);
      const [mapToast, setMapToast] = React.useState(null);
      const [exportConfirm, setExportConfirm] = React.useState(false);
      const [archiveOpen, setArchiveOpen] = React.useState(false);
      const [onboarded, setOnboarded] = React.useState(() => {
        try {
          return window.localStorage.getItem('rian-memory-star-onboarded-v1') === '1';
        } catch {
          return true;
        }
      });
      const canvasRef = React.useRef(null);
      const labelRef = React.useRef(null);
      const positionsRef = React.useRef([]);
      const glRef = React.useRef({ canvas: null, renderer: null });
      const layoutRef = React.useRef({ worker: null, url: null, positions: new Map(), frame: 0 });
      const [size, setSize] = React.useState({ width: 640, height: 420 });
      const [layoutVersion, setLayoutVersion] = React.useState(0);
      const immersive = settings?.uiMode !== 'edit';

      React.useEffect(() => {
        let alive = true;
        api('/settings')
          .then((value) => alive && setSettings(value.settings || {}))
          .catch(() => {});
        api('/maps')
          .then((value) => {
            if (!alive) return;
            setMaps(value.maps || []);
            setPublicMapId(value.publicMapId || null);
            setActiveId(
              (current) =>
                current ||
                value.maps?.find((map) => map.kind === 'project' && map.starCount > 0)?.id ||
                value.publicMapId ||
                value.maps?.[0]?.id ||
                null,
            );
          })
          .catch((cause) => alive && setError(String(cause.message || cause)));
        return () => {
          alive = false;
        };
      }, []);

      React.useEffect(() => {
        applyTheme(settings?.theme || 'dark');
      }, [settings?.theme]);

      const loadMap = React.useCallback(
        (mapId) => {
          if (!mapId) return;
          api(`/maps/${encodeURIComponent(mapId)}`)
            .then((value) => {
              setData(value);
              setSelectedId(null);
            })
            .catch((cause) => setError(String(cause.message || cause)));
        },
        [],
      );

      React.useEffect(() => {
        loadMap(activeId);
      }, [activeId, loadMap]);

      React.useEffect(() => {
        const text = query.trim();
        if (text.length < 2) {
          setGlobalResults([]);
          return undefined;
        }
        const timer = window.setTimeout(() => {
          api(`/search?q=${encodeURIComponent(text)}&limit=30`)
            .then((value) => setGlobalResults(value.stars || []))
            .catch(() => setGlobalResults([]));
        }, 250);
        return () => window.clearTimeout(timer);
      }, [query]);

      React.useEffect(() => {
        if (!pendingSelectId) return;
        if ((data?.stars || []).some((star) => star.id === pendingSelectId)) {
          setSelectedId(pendingSelectId);
          setPendingSelectId(null);
        }
      }, [data, pendingSelectId]);

      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const parent = canvas.parentElement;
        if (!parent) return undefined;
        const update = () => {
          const rect = parent.getBoundingClientRect();
          setSize({
            width: Math.max(320, Math.floor(rect.width)),
            height: Math.max(240, Math.floor(rect.height)),
          });
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(parent);
        return () => observer.disconnect();
      }, []);

      React.useEffect(() => {
        const active = (data?.stars || []).filter((star) => star.status === 'active');
        const width = size.width;
        const height = size.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.34;
        const initial = new Map();
        active.forEach((star, index) => {
          if (star.position?.x) {
            initial.set(star.id, { x: star.position.x * width, y: star.position.y * height });
          } else {
            const angle = (index / Math.max(1, active.length)) * Math.PI * 2 - Math.PI / 2;
            const jitter = 0.82 + 0.18 * Math.sin(index * 1.7);
            initial.set(star.id, {
              x: centerX + Math.cos(angle) * radius * jitter,
              y: centerY + Math.sin(angle) * radius * jitter,
            });
          }
        });
        const state = layoutRef.current;
        state.positions = initial;
        setLayoutVersion((version) => version + 1);
        if (state.worker) {
          state.worker.terminate();
          state.worker = null;
        }
        if (state.url) {
          URL.revokeObjectURL(state.url);
          state.url = null;
        }
        if (active.length < 3 || active.length > 600) return undefined;
        try {
          const blob = new Blob([LAYOUT_WORKER], { type: 'text/javascript' });
          const url = URL.createObjectURL(blob);
          const worker = new Worker(url);
          state.worker = worker;
          state.url = url;
          const indexById = new Map(active.map((star, index) => [star.id, index]));
          const edges = (data?.edges || [])
            .map((edge) => [indexById.get(edge.from), indexById.get(edge.to)])
            .filter(([from, to]) => from !== undefined && to !== undefined);
          worker.onmessage = (event) => {
            const message = event.data;
            if (!message || message.type !== 'tick') return;
            for (const [id, x, y] of message.positions) state.positions.set(id, { x, y });
            if (!state.frame) {
              state.frame = requestAnimationFrame(() => {
                state.frame = 0;
                setLayoutVersion((version) => version + 1);
              });
            }
          };
          worker.onerror = () => {
            worker.terminate();
            if (state.worker === worker) state.worker = null;
          };
          worker.postMessage({
            type: 'init',
            nodes: active.map((star) => ({
              id: star.id,
              x: initial.get(star.id).x,
              y: initial.get(star.id).y,
            })),
            edges,
            width,
            height,
          });
        } catch (cause) {
          console.error('[memory-star] layout worker failed', cause);
        }
        return () => {
          if (state.frame) {
            cancelAnimationFrame(state.frame);
            state.frame = 0;
          }
          if (state.worker) {
            state.worker.terminate();
            state.worker = null;
          }
          if (state.url) {
            URL.revokeObjectURL(state.url);
            state.url = null;
          }
        };
      }, [data, size.width, size.height]);

      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !immersive || maps.length < 2) return undefined;
        const onWheel = (event) => {
          event.preventDefault();
          const index = maps.findIndex((map) => map.id === activeId);
          if (index < 0) return;
          const next = maps[(index + (event.deltaY > 0 ? 1 : -1) + maps.length) % maps.length];
          if (next) {
            setActiveId(next.id);
            setMapToast(next.name);
          }
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
      }, [immersive, maps, activeId]);

      React.useEffect(() => {
        if (!mapToast) return undefined;
        const timer = window.setTimeout(() => setMapToast(null), 2000);
        return () => window.clearTimeout(timer);
      }, [mapToast]);

      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = Math.max(320, size.width);
        const height = Math.max(240, size.height);
        const dpr = window.devicePixelRatio || 1;

        if (!glRef.current.renderer || glRef.current.canvas !== canvas) {
          glRef.current.renderer = createWebGLRenderer(canvas);
          glRef.current.canvas = canvas;
        }
        const glRenderer = glRef.current.renderer;
        if (glRenderer) {
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          const stars = (data?.stars || []).filter((star) => {
            if (star.status !== 'active') return false;
            const queryText = query.trim().toLowerCase();
            if (!queryText) return true;
            const haystack = [star.title, star.fact, star.reason, star.condition, (star.tags || []).join(' ')]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(queryText);
          });
          const stored = layoutRef.current.positions;
          const centerX = width / 2;
          const centerY = height / 2;
          const radius = Math.min(width, height) * 0.34;
          const positions = stars.map((star, index) => {
            const point = stored.get(star.id);
            if (point) return { x: point.x, y: point.y, star };
            const angle = (index / Math.max(1, stars.length)) * Math.PI * 2 - Math.PI / 2;
            const jitter = 0.82 + 0.18 * Math.sin(index * 1.7);
            return {
              x: centerX + Math.cos(angle) * radius * jitter,
              y: centerY + Math.sin(angle) * radius * jitter,
              star,
            };
          });
          positionsRef.current = positions;
          const byId = new Map(positions.map((item) => [item.star.id, item]));
          const edgePairs = [];
          for (const edge of data?.edges || []) {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (from && to) edgePairs.push({ from, to });
          }
          glRenderer.draw(width, height, dpr, positions, edgePairs);
          const emptyText = stars.length
            ? ''
            : query.trim()
              ? '没有找到相关记忆。'
              : '这片星域还空着。去对话里让 AI 记住一件事。';
          drawLabels(
            labelRef.current,
            width,
            height,
            dpr,
            positions,
            selectedId,
            emptyText,
            data?.constellations || [],
          );
          return;
        }

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const surface = canvas.getContext('2d');
        if (!surface) return;
        surface.setTransform(dpr, 0, 0, dpr, 0, 0);

        const gradient = surface.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#0B1026');
        gradient.addColorStop(1, '#131A3A');
        surface.fillStyle = gradient;
        surface.fillRect(0, 0, width, height);

        for (let index = 0; index < 90; index += 1) {
          const x = (index * 97) % width;
          const y = (index * 53) % height;
          surface.strokeStyle = 'rgba(155,184,255,0.07)';
          surface.lineWidth = 1;
          surface.beginPath();
          surface.moveTo(x, y);
          surface.lineTo(x - 3, y + 16);
          surface.stroke();
        }

        const stars = (data?.stars || []).filter((star) => {
          if (star.status !== 'active') return false;
          const queryText = query.trim().toLowerCase();
          if (!queryText) return true;
          const haystack = [star.title, star.fact, star.reason, star.condition, (star.tags || []).join(' ')]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(queryText);
        });
        const positions = [];
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.34;
        stars.forEach((star, index) => {
          const angle = (index / Math.max(1, stars.length)) * Math.PI * 2 - Math.PI / 2;
          const jitter = 0.82 + 0.18 * Math.sin(index * 1.7);
          const x = star.position?.x ? star.position.x * width : centerX + Math.cos(angle) * radius * jitter;
          const y = star.position?.y ? star.position.y * height : centerY + Math.sin(angle) * radius * jitter;
          positions.push({ x, y, star });
        });
        positionsRef.current = positions;
        const byId = new Map(positions.map((item) => [item.star.id, item]));

        for (const edge of data?.edges || []) {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) continue;
          surface.strokeStyle =
            edge.relation === 'contradicts' ? 'rgba(255,107,107,0.55)' : 'rgba(190,205,255,0.18)';
          surface.lineWidth = 1;
          surface.beginPath();
          surface.moveTo(from.x, from.y);
          const midX = (from.x + to.x) / 2 + (from.y - to.y) * 0.08;
          const midY = (from.y + to.y) / 2 + (to.x - from.x) * 0.08;
          surface.quadraticCurveTo(midX, midY, to.x, to.y);
          surface.stroke();
        }

        for (const item of positions) {
          const weight = weightOf(item.star);
          const radiusStar = 3.5 + 9 * Number(item.star.importance ?? 0.5) * weight;
          const color = TYPE_COLOR[item.star.type] || '#CFE3FF';
          surface.save();
          surface.shadowColor = color;
          surface.shadowBlur = 10 + 14 * weight;
          surface.fillStyle = color;
          surface.beginPath();
          surface.arc(item.x, item.y, radiusStar, 0, Math.PI * 2);
          surface.fill();
          surface.restore();
          if (item.star.id === selectedId) {
            surface.strokeStyle = '#FFD479';
            surface.lineWidth = 2;
            surface.beginPath();
            surface.arc(item.x, item.y, radiusStar + 5, 0, Math.PI * 2);
            surface.stroke();
          }
          if (weight > 0.55 && positions.length <= 90) {
            surface.fillStyle = 'rgba(232,236,255,0.82)';
            surface.font = '11px system-ui, sans-serif';
            surface.fillText(item.star.title, item.x + radiusStar + 6, item.y + 4);
          }
        }

        if (!stars.length) {
          surface.fillStyle = 'rgba(232,236,255,0.62)';
          surface.font = '14px system-ui, sans-serif';
          surface.textAlign = 'center';
          const emptyText = query.trim()
            ? '没有找到相关记忆。'
            : '这片星域还空着。去对话里让 AI 记住一件事。';
          surface.fillText(emptyText, width / 2, height / 2);
          surface.textAlign = 'start';
        }
      }, [data, selectedId, query, size, layoutVersion]);

      function onCanvasClick(event) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        let best = null;
        for (const item of positionsRef.current) {
          const distance = Math.hypot(item.x - x, item.y - y);
          if (distance <= 14 && (!best || distance < best.distance)) best = { ...item, distance };
        }
        setSelectedId(best ? best.star.id : null);
        setNebulaOpen(false);
      }

      function openSearchResult(star) {
        setQuery('');
        setGlobalResults([]);
        setSelectedId(null);
        setNebulaOpen(false);
        if (star.mapId && star.mapId !== activeId) {
          setPendingSelectId(star.id);
          setActiveId(star.mapId);
        } else {
          setSelectedId(star.id);
        }
      }

      const selected = (data?.stars || []).find((star) => star.id === selectedId) || null;
      const pending = (data?.stars || []).filter((star) => star.status === 'pending');
      const activeCount = (data?.stars || []).filter((star) => star.status === 'active').length;
      const archivedStars = (data?.stars || [])
        .filter((star) => star.status === 'archived')
        .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
      const activeWorkspaceId = maps.find((map) => map.id === activeId)?.workspaceId || null;
      const workspaceMuted = Boolean(
        activeWorkspaceId &&
          Array.isArray(settings?.noMemoryWorkspaces) &&
          settings.noMemoryWorkspaces.includes(activeWorkspaceId),
      );
      const searchOpen = query.trim().length >= 2;
      const groupedGlobalResults = [];
      {
        const groups = new Map();
        for (const star of globalResults) {
          const name = star.map || '未命名';
          if (!groups.has(name)) groups.set(name, []);
          groups.get(name).push(star);
        }
        for (const [name, stars] of groups) groupedGlobalResults.push([name, stars]);
      }
      const lowConfidence = bulkConfirm
        ? pending.filter(
            (star) => bulkConfirm.ids.includes(star.id) && Number(star.confidence || 0) < 0.5,
          ).length
        : 0;
      const conflictEdge = selected
        ? (data?.edges || []).find(
            (edge) =>
              edge.relation === 'contradicts' &&
              !edge.resolvedAt &&
              (edge.from === selected.id || edge.to === selected.id),
          )
        : null;
      const conflictStar =
        conflictEdge && data
          ? (data.stars || []).find(
              (star) =>
                star.id === (conflictEdge.from === selected.id ? conflictEdge.to : conflictEdge.from),
            )
          : null;

      async function updateStar(star, patch) {
        try {
          await api(`/stars/${encodeURIComponent(star.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          });
          loadMap(activeId);
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      async function suggestConstellations() {
        if (!activeId) return;
        try {
          const result = await api('/constellations/suggest', {
            method: 'POST',
            body: JSON.stringify({ mapId: activeId }),
          });
          const auto = (result.constellations || []).filter((item) => item.auto).length;
          setMapToast(
            auto
              ? `已整理 ${auto} 个星座`
              : '暂无可整理的星座（每个标签至少 3 颗星）',
          );
          loadMap(activeId);
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      async function restoreHistory(version) {
        if (!selected) return;
        try {
          await api(`/stars/${encodeURIComponent(selected.id)}/restore`, {
            method: 'POST',
            body: JSON.stringify({ version }),
          });
          setMapToast(`已恢复到 v${version}`);
          loadMap(activeId);
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      async function downloadCurrentMap() {
        if (!activeId) return;
        setExportConfirm(false);
        const mapName = maps.find((map) => map.id === activeId)?.name || '当前图';
        const safeName = mapName.replace(/[\\/:*?"<>|]/g, '_');
        try {
          const response = await fetch(
            API + `/export?zip=1&mapId=${encodeURIComponent(activeId)}`,
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `rian-memory-star-${safeName}-${new Date().toISOString().slice(0, 10)}.memstar.zip`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setMapToast('已导出当前图');
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      function requestExportCurrent() {
        if (!activeId) return;
        if (settings?.exportReminder === false) {
          void downloadCurrentMap();
          return;
        }
        setExportConfirm(true);
      }

      async function toggleWorkspaceMemory() {
        const workspaceId = maps.find((map) => map.id === activeId)?.workspaceId;
        if (!workspaceId) return;
        const current = Array.isArray(settings?.noMemoryWorkspaces)
          ? settings.noMemoryWorkspaces
          : [];
        const next = current.includes(workspaceId)
          ? current.filter((id) => id !== workspaceId)
          : [...current, workspaceId];
        try {
          const updated = await api('/settings', {
            method: 'POST',
            body: JSON.stringify({ noMemoryWorkspaces: next }),
          });
          setSettings(updated.settings || settings);
          setMapToast(
            next.includes(workspaceId) ? '此工作区已暂停记忆' : '此工作区已恢复记忆',
          );
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      async function resolveConflict(mode) {
        if (!selected || !conflictStar) return;
        const selectedNewer =
          Date.parse(selected.createdAt || 0) >= Date.parse(conflictStar.createdAt || 0);
        const keepId = selectedNewer ? selected.id : conflictStar.id;
        const dropId = selectedNewer ? conflictStar.id : selected.id;
        try {
          await api('/conflicts/resolve', {
            method: 'POST',
            body: JSON.stringify({ keepId, dropId, mode }),
          });
          loadMap(activeId);
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      async function createStar() {
        if (!draft || !draft.title.trim() || !draft.fact.trim()) return;
        try {
          await api('/stars', {
            method: 'POST',
            body: JSON.stringify({
              mapId: activeId,
              title: draft.title.trim(),
              fact: draft.fact.trim(),
              reason: draft.reason.trim(),
              condition: draft.condition.trim(),
              type: draft.type,
              tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
              confidence: 0.95,
              status: 'active',
            }),
          });
          setDraft(null);
          loadMap(activeId);
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      async function saveEdit() {
        if (!editDraft) return;
        const title = String(editDraft.title || '').trim();
        const fact = String(editDraft.fact || '').trim();
        if (!title || !fact) return;
        try {
          await api(`/stars/${encodeURIComponent(editDraft.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              title,
              fact,
              reason: String(editDraft.reason || '').trim(),
              condition: String(editDraft.condition || '').trim(),
              type: editDraft.type,
              tags: String(editDraft.tags || '')
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
              importance: Number(editDraft.importance ?? 0.5),
            }),
          });
          setEditDraft(null);
          loadMap(activeId);
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      async function createMap() {
        const name = String(mapDraft || '').trim();
        if (!name) return;
        try {
          const value = await api('/maps', { method: 'POST', body: JSON.stringify({ name }) });
          const list = await api('/maps');
          setMaps(list.maps || []);
          if (value.map?.id) setActiveId(value.map.id);
          setMapDraft(null);
        } catch (cause) {
          setError(String(cause.message || cause));
        }
      }

      async function deleteConfirmed() {
        if (!confirmDelete) return;
        try {
          if (confirmDelete.kind === 'star') {
            await api(`/stars/${encodeURIComponent(confirmDelete.id)}`, { method: 'DELETE' });
            setConfirmDelete(null);
            setSelectedId(null);
            loadMap(activeId);
          } else {
            await api(`/maps/${encodeURIComponent(confirmDelete.id)}`, { method: 'DELETE' });
            setConfirmDelete(null);
            const list = await api('/maps');
            setMaps(list.maps || []);
            setActiveId(list.publicMapId || null);
          }
        } catch (cause) {
          setError(String(cause.message || cause));
          setConfirmDelete(null);
        }
      }

      function toggleNebula(id) {
        setNebulaSelected((current) =>
          current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
        );
      }

      function selectAllNebula() {
        setNebulaSelected((current) =>
          current.length === pending.length ? [] : pending.map((star) => star.id),
        );
      }

      async function runBulk(status, ids) {
        try {
          await Promise.all(
            ids.map((id) =>
              api(`/stars/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: JSON.stringify({ status }),
              }),
            ),
          );
          setNebulaSelected([]);
          setBulkConfirm(null);
          loadMap(activeId);
        } catch (cause) {
          setError(String(cause.message || cause));
          setBulkConfirm(null);
        }
      }

      function applyNebula(status) {
        const ids = [...nebulaSelected];
        if (!ids.length) return;
        if (ids.length > 5) {
          setBulkConfirm({ status, ids });
          return;
        }
        void runBulk(status, ids);
      }

      function finishOnboarding() {
        try {
          window.localStorage.setItem('rian-memory-star-onboarded-v1', '1');
        } catch {
          // localStorage unavailable: keep it in memory for this session
        }
        setOnboarded(true);
      }

      const tabStyle = (id) => ({
        border: '0',
        borderRadius: '999px',
        padding: '5px 12px',
        fontSize: '12px',
        cursor: 'pointer',
        color: id === activeId ? '#0B1026' : 'var(--ms-text)',
        background: id === activeId ? '#FFD479' : 'var(--ms-subtle)',
        whiteSpace: 'nowrap',
      });

      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            position: 'relative',
            background: 'var(--ms-bg)',
            color: 'var(--ms-text)',
            colorScheme: settings?.theme === 'light' ? 'light' : 'dark',
            fontFamily: 'system-ui, sans-serif',
          },
        },
        h(
          'div',
          {
            style: {
              display: immersive ? 'none' : 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderBottom: '1px solid var(--ms-border)',
              flexWrap: 'wrap',
            },
          },
          h('strong', { style: { fontSize: '13px', marginRight: '4px' } }, '✦ 雨咯记忆星'),
          ...(maps || []).map((map) =>
            h(
              'button',
              {
                key: map.id,
                type: 'button',
                style: tabStyle(map.id),
                onClick: () => setActiveId(map.id),
                title: `${map.kind === 'public' ? '公共星图' : '项目星图'} · ${map.starCount || 0} 颗`,
              },
              `${map.name}${map.pendingCount ? ` · ${map.pendingCount}` : ''}`,
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              style: { ...tabStyle('__new'), background: 'rgba(127,216,255,0.16)', color: '#7FD8FF' },
              onClick: () =>
                setDraft({ title: '', fact: '', reason: '', condition: '', type: 'fact', tags: '' }),
            },
            '＋ 星',
          ),
          h(
            'button',
            {
              type: 'button',
              style: { ...tabStyle('__newmap'), background: 'rgba(255,212,121,0.12)', color: '#FFD479' },
              onClick: () => setMapDraft(''),
            },
            '＋ 图',
          ),
          h(
            'button',
            {
              type: 'button',
              style: { ...tabStyle('__constellations'), background: 'rgba(182,156,255,0.14)', color: '#B98CFF' },
              onClick: suggestConstellations,
            },
            '整理',
          ),
          activeWorkspaceId
            ? h(
                'button',
                {
                  type: 'button',
                  title: workspaceMuted ? '恢复此工作区的记忆' : '暂停此工作区的记忆',
                  style: {
                    ...tabStyle('__mute'),
                    background: workspaceMuted
                      ? 'rgba(255,107,107,0.14)'
                      : 'var(--ms-subtle)',
                    color: workspaceMuted ? '#FF9E9E' : 'inherit',
                  },
                  onClick: toggleWorkspaceMemory,
                },
                workspaceMuted ? '已暂停' : '暂停',
              )
            : null,
          activeId
            ? h(
                'button',
                {
                  type: 'button',
                  title: '查看归档记忆',
                  style: {
                    ...tabStyle('__archive'),
                    background: 'var(--ms-subtle)',
                  },
                  onClick: () => setArchiveOpen(true),
                },
                `归档 ${archivedStars.length}`,
              )
            : null,
          activeId
            ? h(
                'button',
                {
                  type: 'button',
                  title: '导出当前图（zip，含星尘）',
                  style: {
                    ...tabStyle('__export'),
                    background: 'rgba(127,216,255,0.12)',
                    color: '#7FD8FF',
                  },
                  onClick: requestExportCurrent,
                },
                '导出',
              )
            : null,
          activeId && activeId !== publicMapId
            ? h(
                'button',
                {
                  type: 'button',
                  style: {
                    ...tabStyle('__delmap'),
                    background: 'rgba(255,107,107,0.12)',
                    color: '#FF9E9E',
                  },
                  onClick: () =>
                    setConfirmDelete({
                      kind: 'map',
                      id: activeId,
                      label: maps.find((map) => map.id === activeId)?.name || '星图',
                    }),
                },
                '删除图',
              )
            : null,
          h('input', {
            value: query,
            onChange: (event) => {
              setQuery(event.target.value);
              setSelectedId(null);
              setNebulaOpen(false);
            },
            placeholder: '搜索全部星图',
            style: {
              width: '150px',
              padding: '5px 8px',
              borderRadius: '8px',
              border: '1px solid var(--ms-border)',
              background: 'var(--ms-subtle)',
              color: 'inherit',
              fontSize: '11px',
              outline: 'none',
            },
          }),
          h('div', { style: { flex: 1 } }),
          h('span', { style: { fontSize: '11px', opacity: 0.65 } }, `${activeCount} 颗亮星`),
        ),
        h(
          'div',
          { style: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' } },
          h('canvas', {
            ref: canvasRef,
            onClick: onCanvasClick,
            style: {
              display: 'block',
              width: '100%',
              height: '100%',
              cursor: immersive ? 'default' : 'crosshair',
              background: 'linear-gradient(135deg, #0B1026, #131A3A)',
            },
          }),
          h('canvas', {
            ref: labelRef,
            'aria-hidden': true,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            },
          }),
          mapToast
            ? h(
                'div',
                {
                  style: {
                    position: 'absolute',
                    top: '16px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '4px 12px',
                    borderRadius: '999px',
                    background: 'rgba(12,17,38,0.82)',
                    border: '1px solid var(--ms-border)',
                    fontSize: '12px',
                    pointerEvents: 'none',
                  },
                },
                mapToast,
              )
            : null,
          pending.length
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: () => {
                    setSelectedId(null);
                    setNebulaSelected([]);
                    setNebulaOpen(true);
                  },
                  style: {
                    position: 'absolute',
                    right: '12px',
                    bottom: '12px',
                    padding: '6px 12px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,212,121,0.35)',
                    background: 'rgba(255,212,121,0.12)',
                    color: '#FFD479',
                    cursor: 'pointer',
                    fontSize: '11px',
                  },
                },
                `星云 ${pending.length}`,
              )
            : null,
          searchOpen
            ? h(
                'div',
                {
                  style: {
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '380px',
                    maxHeight: '60%',
                    overflow: 'auto',
                    zIndex: 30,
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid var(--ms-border)',
                    background: 'rgba(12,17,38,0.97)',
                    boxShadow: '0 18px 40px rgba(0,0,0,0.4)',
                    fontSize: '12px',
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', marginBottom: '6px' } },
                  h('strong', { style: { fontSize: '12px' } }, `全局搜索 · ${globalResults.length}`),
                  h('div', { style: { flex: 1 } }),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setQuery(''),
                      style: {
                        border: 0,
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                      },
                    },
                    '×',
                  ),
                ),
                groupedGlobalResults.length === 0
                  ? h('div', { style: { opacity: 0.6 } }, '没有找到相关记忆')
                  : groupedGlobalResults.map(([mapName, stars]) =>
                      h(
                        'div',
                        { key: mapName, style: { marginTop: '6px' } },
                        h(
                          'div',
                          { style: { fontSize: '10px', opacity: 0.55, marginBottom: '4px' } },
                          mapName,
                        ),
                        ...stars.map((star) =>
                          h(
                            'button',
                            {
                              key: star.id,
                              type: 'button',
                              onClick: () => openSearchResult(star),
                              style: {
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '6px 8px',
                                marginBottom: '4px',
                                borderRadius: '8px',
                                border: 0,
                                background: 'var(--ms-subtle)',
                                color: 'inherit',
                                cursor: 'pointer',
                              },
                            },
                            h('div', { style: { fontWeight: 600 } }, star.title),
                            h(
                              'div',
                              { style: { opacity: 0.65, fontSize: '11px', marginTop: '2px' } },
                              (star.fact || '').slice(0, 70),
                            ),
                          ),
                        ),
                      ),
                    ),
              )
            : null,
          selected
            ? h(
                'aside',
                {
                  style: {
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '286px',
                    maxHeight: 'calc(100% - 24px)',
                    overflow: 'auto',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid var(--ms-border)',
                    background: 'rgba(12,17,38,0.94)',
                    boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
                    fontSize: '12px',
                    lineHeight: 1.55,
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' } },
                  h(
                    'span',
                    {
                      style: {
                        padding: '1px 7px',
                        borderRadius: '999px',
                        background: 'rgba(127,216,255,0.14)',
                        color: TYPE_COLOR[selected.type] || '#CFE3FF',
                        fontSize: '10px',
                      },
                    },
                    TYPE_LABEL[selected.type] || selected.type,
                  ),
                  h('div', { style: { flex: 1 } }),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setSelectedId(null),
                      style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' },
                    },
                    '×',
                  ),
                ),
                h('div', { style: { fontSize: '14px', fontWeight: 600, marginBottom: '6px' } }, selected.title),
                h('div', { style: { opacity: 0.9 } }, selected.fact),
                selected.reason
                  ? h('div', { style: { marginTop: '8px', opacity: 0.72 } }, `理由：${selected.reason}`)
                  : null,
                selected.condition
                  ? h('div', { style: { marginTop: '4px', opacity: 0.72 } }, `条件：${selected.condition}`)
                  : null,
                (selected.tags || []).length
                  ? h(
                      'div',
                      { style: { marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' } },
                      ...selected.tags.map((tag) =>
                        h(
                          'span',
                          {
                            key: tag,
                            style: {
                              padding: '1px 6px',
                              borderRadius: '999px',
                              background: 'var(--ms-subtle)',
                              fontSize: '10px',
                            },
                          },
                          tag,
                        ),
                      ),
                    )
                  : null,
                (selected.mergedFrom || []).length
                  ? h(
                      'div',
                      { style: { marginTop: '8px', fontSize: '11px', opacity: 0.72 } },
                      h('div', { style: { opacity: 0.6 } }, '合并来源'),
                      ...selected.mergedFrom.slice(-5).map((item, index) =>
                        h(
                          'div',
                          {
                            key: index,
                            style: { marginTop: '2px', wordBreak: 'break-word' },
                          },
                          `「${item.title}」${item.fact}`,
                        ),
                      ),
                    )
                  : null,
                (selected.history || []).length
                  ? h(
                      'details',
                      { style: { marginTop: '10px', fontSize: '11px' } },
                      h(
                        'summary',
                        { style: { cursor: 'pointer', opacity: 0.65 } },
                        `星尘 · ${selected.history.length} 版`,
                      ),
                      h(
                        'div',
                        { style: { marginTop: '6px', display: 'grid', gap: '6px' } },
                        ...[...selected.history].reverse().map((entry, index) =>
                          h(
                            'div',
                            {
                              key: `${entry.version}-${index}`,
                              style: {
                                padding: '6px 8px',
                                borderRadius: '8px',
                                background: 'var(--ms-subtle)',
                              },
                            },
                            h(
                              'div',
                              { style: { opacity: 0.55 } },
                              `v${entry.version} · ${new Date(entry.at).toLocaleString()} · ${entry.by === 'user' ? '用户' : '模型'}`,
                            ),
                            h(
                              'div',
                              { style: { marginTop: '2px', opacity: 0.85, wordBreak: 'break-word' } },
                              (entry.changes || [])
                                .map(
                                  (change) =>
                                    `${HISTORY_FIELD_LABEL[change.field] || change.field}：${shortValue(change.to)}`,
                                )
                                .join('；'),
                            ),
                            !immersive && entry.version < selected.version
                              ? h(
                                  'button',
                                  {
                                    type: 'button',
                                    onClick: () => restoreHistory(entry.version),
                                    style: {
                                      marginTop: '4px',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--ms-border)',
                                      background: 'transparent',
                                      color: 'inherit',
                                      fontSize: '10px',
                                      cursor: 'pointer',
                                    },
                                  },
                                  '恢复此版',
                                )
                              : null,
                          ),
                        ),
                      ),
                    )
                  : null,
                conflictStar
                  ? h(
                      'div',
                      {
                        style: {
                          marginTop: '8px',
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,107,107,0.3)',
                          background: 'rgba(255,107,107,0.12)',
                          fontSize: '11px',
                        },
                      },
                      h(
                        'div',
                        { style: { fontWeight: 600, color: '#FF9E9E' } },
                        '⚠ 存在未裁决冲突',
                      ),
                      h(
                        'div',
                        { style: { opacity: 0.8, marginTop: '3px' } },
                        `与「${conflictStar.title}」：${conflictStar.fact}`,
                      ),
                      !immersive
                        ? h(
                            'div',
                            {
                              style: {
                                display: 'flex',
                                gap: '6px',
                                marginTop: '6px',
                                flexWrap: 'wrap',
                              },
                            },
                            h(
                              'button',
                              { type: 'button', onClick: () => resolveConflict('supersede') },
                              '以新为准',
                            ),
                            h(
                              'button',
                              { type: 'button', onClick: () => resolveConflict('keep-both') },
                              '保留双方',
                            ),
                            h(
                              'button',
                              { type: 'button', onClick: () => resolveConflict('merge') },
                              '合并',
                            ),
                          )
                        : null,
                    )
                  : null,
                h(
                  'div',
                  { style: { marginTop: '10px', display: immersive ? 'none' : 'flex', gap: '6px', flexWrap: 'wrap' } },
                  selected.status === 'pending'
                    ? h(
                        'button',
                        { type: 'button', onClick: () => updateStar(selected, { status: 'active' }) },
                        '点亮',
                      )
                    : null,
                  selected.status === 'pending'
                    ? h(
                        'button',
                        { type: 'button', onClick: () => updateStar(selected, { status: 'rejected' }) },
                        '丢弃',
                      )
                    : null,
                  selected.status === 'active'
                    ? h(
                        'button',
                        { type: 'button', onClick: () => updateStar(selected, { status: 'archived' }) },
                        '归档',
                      )
                    : null,
                  selected.status === 'archived'
                    ? h(
                        'button',
                        { type: 'button', onClick: () => updateStar(selected, { status: 'active' }) },
                        '恢复',
                      )
                    : null,
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () =>
                        setEditDraft({
                          id: selected.id,
                          title: selected.title,
                          fact: selected.fact,
                          reason: selected.reason || '',
                          condition: selected.condition || '',
                          type: selected.type,
                          tags: (selected.tags || []).join(', '),
                          importance: selected.importance ?? 0.5,
                        }),
                    },
                    '编辑',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      style: { color: '#FF9E9E' },
                      onClick: () =>
                        setConfirmDelete({
                          kind: 'star',
                          id: selected.id,
                          label: selected.title,
                        }),
                    },
                    '删除',
                  ),
                ),
              )
            : null,
          nebulaOpen
            ? h(
                'aside',
                {
                  style: {
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '320px',
                    maxHeight: 'calc(100% - 24px)',
                    overflow: 'auto',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,212,121,0.28)',
                    background: 'rgba(12,17,38,0.96)',
                    boxShadow: '0 18px 40px rgba(0,0,0,0.4)',
                    fontSize: '12px',
                    lineHeight: 1.5,
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } },
                  h('strong', { style: { fontSize: '13px' } }, `星云 · ${pending.length}`),
                  h('div', { style: { flex: 1 } }),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: selectAllNebula,
                      style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '11px' },
                    },
                    nebulaSelected.length === pending.length && pending.length ? '清空' : '全选',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setNebulaOpen(false),
                      style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' },
                    },
                    '×',
                  ),
                ),
                pending.length === 0
                  ? h('div', { style: { opacity: 0.6 } }, '没有待确认的星')
                  : pending.map((star) =>
                      h(
                        'div',
                        {
                          key: star.id,
                          style: { padding: '9px 0', borderTop: '1px solid var(--ms-border)' },
                        },
                        h(
                          'div',
                          { style: { display: 'flex', gap: '6px', alignItems: 'flex-start' } },
                          h('input', {
                            type: 'checkbox',
                            checked: nebulaSelected.includes(star.id),
                            onChange: () => toggleNebula(star.id),
                            style: { marginTop: '3px' },
                          }),
                          h(
                            'div',
                            { style: { flex: 1 } },
                            h('div', { style: { fontWeight: 600 } }, star.title),
                            h('div', { style: { opacity: 0.74, marginTop: '3px' } }, star.fact),
                          ),
                        ),
                        h(
                          'div',
                          { style: { display: 'flex', gap: '8px', marginTop: '7px' } },
                          h(
                            'button',
                            { type: 'button', onClick: () => updateStar(star, { status: 'active' }) },
                            '点亮',
                          ),
                          h(
                            'button',
                            { type: 'button', onClick: () => updateStar(star, { status: 'rejected' }) },
                            '丢弃',
                          ),
                        ),
                      ),
                    ),
                nebulaSelected.length
                  ? h(
                      'div',
                      {
                        style: {
                          position: 'sticky',
                          bottom: 0,
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(255,212,121,0.2)',
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center',
                        },
                      },
                      h('span', null, `已选 ${nebulaSelected.length}`),
                      h('button', { type: 'button', onClick: () => applyNebula('active') }, '点亮'),
                      h('button', { type: 'button', onClick: () => applyNebula('rejected') }, '丢弃'),
                      h('button', { type: 'button', onClick: () => setNebulaSelected([]) }, '取消'),
                    )
                  : null,
              )
            : null,
          draft
            ? h(
                'div',
                {
                  style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 50,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(4,7,18,0.62)',
                  },
                  onClick: () => setDraft(null),
                },
                h(
                  'div',
                  {
                    style: {
                      width: '420px',
                      maxWidth: 'calc(100vw - 32px)',
                      padding: '18px',
                      borderRadius: '14px',
                      border: '1px solid var(--ms-border)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '12px',
                    },
                    onClick: (event) => event.stopPropagation(),
                  },
                  h('div', { style: { fontSize: '14px', fontWeight: 600, marginBottom: '12px' } }, '点亮一颗星'),
                  ...[
                    ['title', '标题（≤20 字）'],
                    ['fact', '事实（≤120 字）'],
                    ['reason', '理由（可选）'],
                    ['condition', '条件（可选）'],
                    ['tags', '标签（逗号分隔）'],
                  ].map(([key, label]) =>
                    h(
                      'label',
                      { key, style: { display: 'block', marginBottom: '8px' } },
                      h('div', { style: { opacity: 0.68, marginBottom: '3px' } }, label),
                      h('input', {
                        value: draft[key],
                        onChange: (event) => setDraft({ ...draft, [key]: event.target.value }),
                        style: {
                          width: '100%',
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: '1px solid var(--ms-border)',
                          background: 'var(--ms-subtle)',
                          color: 'inherit',
                          outline: 'none',
                        },
                      }),
                    ),
                  ),
                  h(
                    'label',
                    { style: { display: 'block', marginBottom: '12px' } },
                    h('div', { style: { opacity: 0.68, marginBottom: '3px' } }, '类型'),
                    h(
                      'select',
                      {
                        value: draft.type,
                        onChange: (event) => setDraft({ ...draft, type: event.target.value }),
                        style: {
                          width: '100%',
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: '1px solid var(--ms-border)',
                          background: 'var(--ms-subtle)',
                          color: 'inherit',
                        },
                      },
                      ...Object.keys(TYPE_LABEL).map((type) => h('option', { key: type, value: type }, TYPE_LABEL[type])),
                    ),
                  ),
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
                    h('button', { type: 'button', onClick: () => setDraft(null) }, '取消'),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: createStar,
                        style: {
                          background: '#FFD479',
                          color: '#0B1026',
                          border: 0,
                          borderRadius: '8px',
                          padding: '7px 12px',
                          cursor: 'pointer',
                        },
                      },
                      '点亮',
                    ),
                  ),
                ),
              )
            : null,
          editDraft
            ? h(
                'div',
                {
                  style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 55,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(4,7,18,0.62)',
                  },
                  onClick: () => setEditDraft(null),
                },
                h(
                  'div',
                  {
                    style: {
                      width: '440px',
                      maxWidth: 'calc(100vw - 32px)',
                      maxHeight: 'calc(100vh - 40px)',
                      overflow: 'auto',
                      padding: '18px',
                      borderRadius: '14px',
                      border: '1px solid var(--ms-border)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '12px',
                    },
                    onClick: (event) => event.stopPropagation(),
                  },
                  h(
                    'div',
                    { style: { fontSize: '14px', fontWeight: 600, marginBottom: '12px' } },
                    '编辑记忆',
                  ),
                  ...[
                    ['title', '标题（≤20 字）'],
                    ['fact', '事实（≤120 字）'],
                    ['reason', '理由（可选）'],
                    ['condition', '条件（可选）'],
                    ['tags', '标签（逗号分隔）'],
                  ].map(([key, label]) =>
                    h(
                      'label',
                      { key, style: { display: 'block', marginBottom: '8px' } },
                      h('div', { style: { opacity: 0.68, marginBottom: '3px' } }, label),
                      h('input', {
                        value: editDraft[key],
                        onChange: (event) => setEditDraft({ ...editDraft, [key]: event.target.value }),
                        style: {
                          width: '100%',
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: '1px solid var(--ms-border)',
                          background: 'var(--ms-subtle)',
                          color: 'inherit',
                          outline: 'none',
                        },
                      }),
                    ),
                  ),
                  h(
                    'label',
                    { style: { display: 'block', marginBottom: '8px' } },
                    h('div', { style: { opacity: 0.68, marginBottom: '3px' } }, '类型'),
                    h(
                      'select',
                      {
                        value: editDraft.type,
                        onChange: (event) => setEditDraft({ ...editDraft, type: event.target.value }),
                        style: {
                          width: '100%',
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: '1px solid var(--ms-border)',
                          background: 'var(--ms-subtle)',
                          color: 'inherit',
                        },
                      },
                      ...Object.keys(TYPE_LABEL).map((type) =>
                        h('option', { key: type, value: type }, TYPE_LABEL[type]),
                      ),
                    ),
                  ),
                  h(
                    'label',
                    { style: { display: 'block', marginBottom: '12px' } },
                    h('div', { style: { opacity: 0.68, marginBottom: '3px' } }, '重要度（0~1）'),
                    h('input', {
                      type: 'number',
                      min: 0,
                      max: 1,
                      step: 0.1,
                      value: editDraft.importance,
                      onChange: (event) =>
                        setEditDraft({ ...editDraft, importance: event.target.value }),
                      style: {
                        width: '90px',
                        padding: '7px 8px',
                        borderRadius: '8px',
                        border: '1px solid var(--ms-border)',
                        background: 'var(--ms-subtle)',
                        color: 'inherit',
                        outline: 'none',
                      },
                    }),
                  ),
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
                    h('button', { type: 'button', onClick: () => setEditDraft(null) }, '取消'),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: saveEdit,
                        style: {
                          background: '#FFD479',
                          color: '#0B1026',
                          border: 0,
                          borderRadius: '8px',
                          padding: '7px 12px',
                          cursor: 'pointer',
                        },
                      },
                      '保存',
                    ),
                  ),
                ),
              )
            : null,
          mapDraft !== null
            ? h(
                'div',
                {
                  style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 50,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(4,7,18,0.62)',
                  },
                  onClick: () => setMapDraft(null),
                },
                h(
                  'div',
                  {
                    style: {
                      width: '360px',
                      maxWidth: 'calc(100vw - 32px)',
                      padding: '18px',
                      borderRadius: '14px',
                      border: '1px solid var(--ms-border)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '12px',
                    },
                    onClick: (event) => event.stopPropagation(),
                  },
                  h(
                    'div',
                    { style: { fontSize: '14px', fontWeight: 600, marginBottom: '12px' } },
                    '新建星图',
                  ),
                  h('input', {
                    autoFocus: true,
                    value: mapDraft,
                    placeholder: '星图名称',
                    onChange: (event) => setMapDraft(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') createMap();
                      if (event.key === 'Escape') setMapDraft(null);
                    },
                    style: {
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: '8px',
                      border: '1px solid var(--ms-border)',
                      background: 'var(--ms-subtle)',
                      color: 'inherit',
                      outline: 'none',
                    },
                  }),
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' } },
                    h('button', { type: 'button', onClick: () => setMapDraft(null) }, '取消'),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: createMap,
                        style: {
                          background: '#FFD479',
                          color: '#0B1026',
                          border: 0,
                          borderRadius: '8px',
                          padding: '7px 12px',
                          cursor: 'pointer',
                        },
                      },
                      '创建',
                    ),
                  ),
                ),
              )
            : null,
          confirmDelete
            ? h(
                'div',
                {
                  style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 60,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(4,7,18,0.68)',
                  },
                  onClick: () => setConfirmDelete(null),
                },
                h(
                  'div',
                  {
                    style: {
                      width: '360px',
                      maxWidth: 'calc(100vw - 32px)',
                      padding: '18px',
                      borderRadius: '14px',
                      border: '1px solid rgba(255,107,107,0.35)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '12px',
                    },
                    onClick: (event) => event.stopPropagation(),
                  },
                  h(
                    'div',
                    { style: { fontSize: '14px', fontWeight: 600, marginBottom: '8px' } },
                    confirmDelete.kind === 'star' ? '删除这颗星？' : '删除这张星图？',
                  ),
                  h(
                    'div',
                    { style: { opacity: 0.74, lineHeight: 1.6 } },
                    `「${confirmDelete.label}」将被永久删除，无法恢复。`,
                  ),
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' } },
                    h('button', { type: 'button', onClick: () => setConfirmDelete(null) }, '取消'),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: deleteConfirmed,
                        style: {
                          background: '#FF6B6B',
                          color: '#0B1026',
                          border: 0,
                          borderRadius: '8px',
                          padding: '7px 12px',
                          cursor: 'pointer',
                        },
                      },
                      '删除',
                    ),
                  ),
                ),
              )
            : null,
          bulkConfirm
            ? h(
                'div',
                {
                  style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 60,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(4,7,18,0.68)',
                  },
                  onClick: () => setBulkConfirm(null),
                },
                h(
                  'div',
                  {
                    style: {
                      width: '360px',
                      maxWidth: 'calc(100vw - 32px)',
                      padding: '18px',
                      borderRadius: '14px',
                      border: '1px solid rgba(255,212,121,0.35)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '12px',
                    },
                    onClick: (event) => event.stopPropagation(),
                  },
                  h(
                    'div',
                    { style: { fontSize: '14px', fontWeight: 600, marginBottom: '8px' } },
                    `${bulkConfirm.status === 'active' ? '点亮' : '丢弃'} ${bulkConfirm.ids.length} 颗星？`,
                  ),
                  h(
                    'div',
                    { style: { opacity: 0.74, lineHeight: 1.6 } },
                    bulkConfirm.status === 'active'
                      ? '点亮后进入正式记忆。'
                      : '丢弃后不再出现在星云。',
                  ),
                  lowConfidence
                    ? h(
                        'div',
                        { style: { color: '#FFD479', marginTop: '6px' } },
                        `其中 ${lowConfidence} 颗置信度低于 0.5。`,
                      )
                    : null,
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' } },
                    h('button', { type: 'button', onClick: () => setBulkConfirm(null) }, '取消'),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => void runBulk(bulkConfirm.status, bulkConfirm.ids),
                        style: {
                          background: '#FFD479',
                          color: '#0B1026',
                          border: 0,
                          borderRadius: '8px',
                          padding: '7px 12px',
                          cursor: 'pointer',
                        },
                      },
                      '确认',
                    ),
                  ),
                ),
              )
            : null,
          error
            ? h(
                'div',
                {
                  style: {
                    position: 'absolute',
                    left: '12px',
                    bottom: '12px',
                    maxWidth: '70%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    background: 'rgba(255,107,107,0.16)',
                    color: '#FF9E9E',
                    fontSize: '11px',
                  },
                },
                error,
              )
            : null,
        ),
        h(
          'div',
          {
            style: {
              display: immersive ? 'none' : 'flex',
              gap: '10px',
              alignItems: 'center',
              padding: '8px 12px',
              borderTop: '1px solid var(--ms-border)',
              fontSize: '11px',
              opacity: 0.72,
            },
          },
          h('span', null, `待确认 ${pending.length}`),
          h('span', null, `共 ${(data?.stars || []).length} 颗`),
          h('span', { style: { flex: 1 } }),
          h('span', null, maps.find((map) => map.id === activeId)?.name || ''),
        ),
        archiveOpen
          ? h(
              'div',
              {
                style: {
                  position: 'fixed',
                  inset: 0,
                  zIndex: 70,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(4,7,18,0.7)',
                },
                onClick: () => setArchiveOpen(false),
              },
              h(
                'div',
                {
                  style: {
                    width: '520px',
                    maxWidth: 'calc(100vw - 32px)',
                    maxHeight: '70vh',
                    overflow: 'auto',
                    padding: '16px',
                    borderRadius: '14px',
                    border: '1px solid var(--ms-border)',
                    background: 'var(--ms-panel)',
                    color: 'var(--ms-text)',
                  },
                  onClick: (event) => event.stopPropagation(),
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } },
                  h('div', { style: { fontSize: '15px', fontWeight: 600 } }, `归档 · ${archivedStars.length}`),
                  h('div', { style: { flex: 1 } }),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setArchiveOpen(false),
                      style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' },
                    },
                    '×',
                  ),
                ),
                archivedStars.length
                  ? archivedStars.map((star) =>
                      h(
                        'div',
                        {
                          key: star.id,
                          style: {
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center',
                            padding: '8px 0',
                            borderBottom: '1px solid var(--ms-border)',
                          },
                        },
                        h(
                          'div',
                          { style: { flex: 1, minWidth: 0 } },
                          h('div', { style: { fontSize: '12px', fontWeight: 600 } }, star.title),
                          h(
                            'div',
                            { style: { opacity: 0.65, fontSize: '11px', marginTop: '2px', wordBreak: 'break-word' } },
                            star.fact,
                          ),
                          h(
                            'div',
                            { style: { opacity: 0.45, fontSize: '10px', marginTop: '2px' } },
                            `${star.type} · ${new Date(star.updatedAt).toLocaleString()}`,
                          ),
                        ),
                        h(
                          'button',
                          { type: 'button', onClick: () => updateStar(star, { status: 'active' }) },
                          '恢复',
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: () => {
                              setArchiveOpen(false);
                              setConfirmDelete({ kind: 'star', id: star.id, label: star.title });
                            },
                            style: { color: '#FF9E9E' },
                          },
                          '删除',
                        ),
                      ),
                    )
                  : h('div', { style: { opacity: 0.6, fontSize: '12px', padding: '12px 0' } }, '没有归档的记忆。'),
              ),
            )
          : null,
        exportConfirm
          ? h(
              'div',
              {
                style: {
                  position: 'fixed',
                  inset: 0,
                  zIndex: 80,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(4,7,18,0.72)',
                },
              },
              h(
                'div',
                {
                  style: {
                    width: '400px',
                    maxWidth: 'calc(100vw - 32px)',
                    padding: '18px',
                    borderRadius: '14px',
                    border: '1px solid var(--ms-border)',
                    background: 'var(--ms-panel)',
                    color: 'var(--ms-text)',
                    fontSize: '12px',
                  },
                },
                h(
                  'div',
                  { style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } },
                  '导出当前图',
                ),
                h(
                  'div',
                  { style: { opacity: 0.75, lineHeight: 1.6 } },
                  `将导出「${maps.find((map) => map.id === activeId)?.name || '当前图'}」及其星尘历史。`,
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' } },
                  h('button', { type: 'button', onClick: () => setExportConfirm(false) }, '取消'),
                  h(
                    'button',
                    { type: 'button', onClick: () => void downloadCurrentMap() },
                    '确认导出',
                  ),
                ),
              ),
            )
          : null,
        !onboarded
          ? h(
              'div',
              {
                style: {
                  position: 'absolute',
                  inset: 0,
                  zIndex: 80,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(4,7,18,0.72)',
                  backdropFilter: 'blur(6px)',
                  padding: '16px',
                },
              },
              h(
                'div',
                {
                  style: {
                    width: 'min(520px, 100%)',
                    padding: '24px',
                    borderRadius: '16px',
                    border: '1px solid var(--ms-border)',
                    background: 'rgba(14,20,44,0.98)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
                    color: 'var(--ms-text)',
                  },
                },
                h('h2', { style: { margin: '0 0 6px', fontSize: '20px' } }, '欢迎来到雨咯记忆星'),
                h(
                  'p',
                  { style: { margin: '0 0 16px', opacity: 0.7, fontSize: '12px' } },
                  '跨会话的项目长期记忆，像星图一样可看、可整理、可删除。',
                ),
                ...[
                  ['1', '让 AI 记住', '在对话里说「记住：数据库用 PostgreSQL」，它会写入当前项目图。'],
                  ['2', '公共图始终参与', '公共星图不绑定，永远参与召回；一次只额外绑定一张项目图。'],
                  ['3', '点亮与整理', '待确认的星在星云里点亮；编辑模式可以建星、改星、整理星座、导出备份。'],
                ].map(([index, title, text]) =>
                  h(
                    'div',
                    { key: index, style: { display: 'flex', gap: '10px', marginBottom: '10px' } },
                    h(
                      'div',
                      {
                        style: {
                          width: '22px',
                          height: '22px',
                          borderRadius: '999px',
                          background: 'rgba(127,216,255,0.16)',
                          color: '#7FD8FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          flex: 'none',
                        },
                      },
                      index,
                    ),
                    h(
                      'div',
                      null,
                      h('div', { style: { fontWeight: 600, fontSize: '12px' } }, title),
                      h(
                        'div',
                        { style: { opacity: 0.65, fontSize: '11px', marginTop: '2px' } },
                        text,
                      ),
                    ),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: finishOnboarding,
                    style: {
                      marginTop: '8px',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      border: 0,
                      background: '#7FD8FF',
                      color: '#08101f',
                      fontWeight: 600,
                      cursor: 'pointer',
                    },
                  },
                  '开始使用',
                ),
              ),
            )
          : null,
      );
    }

    function Settings() {
      const [settings, setSettings] = React.useState(null);
      const [saved, setSaved] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [health, setHealth] = React.useState(null);
      const [defaults, setDefaults] = React.useState(null);
      const [resetConfirm, setResetConfirm] = React.useState(false);
      const importRef = React.useRef(null);
      const [transfer, setTransfer] = React.useState(null);
      const [pendingImport, setPendingImport] = React.useState(null);
      const [pendingExport, setPendingExport] = React.useState(null);

      React.useEffect(() => {
        let alive = true;
        Promise.all([api('/settings'), api('/health')])
          .then(([value, healthValue]) => {
            if (!alive) return;
            setSettings(value.settings || {});
            setDefaults(value.defaults || {});
            setHealth(healthValue);
          })
          .catch((cause) => alive && setError(String(cause.message || cause)));
        return () => {
          alive = false;
        };
      }, []);

      React.useEffect(() => {
        applyTheme(settings?.theme || 'dark');
      }, [settings?.theme]);

      function update(patch) {
        const next = { ...settings, ...patch };
        setSettings(next);
        api('/settings', { method: 'POST', body: JSON.stringify(next) })
          .then(() => {
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1500);
          })
          .catch((cause) => setError(String(cause.message || cause)));
      }

      function refreshHealth() {
        api('/health')
          .then(setHealth)
          .catch((cause) => setError(String(cause.message || cause)));
      }

      function resetSettings() {
        if (!defaults) return;
        update(defaults);
        setResetConfirm(false);
      }

      async function exportAll() {
        try {
          const response = await fetch(API + '/export');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const text = await response.text();
          const blob = new Blob([text], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          const stamp = new Date().toISOString().slice(0, 10);
          anchor.href = url;
          anchor.download = `rian-memory-star-${stamp}.memstar.json`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setTransfer({ ok: true, text: '已导出全部星图' });
        } catch (cause) {
          setTransfer({ ok: false, text: String(cause.message || cause) });
        }
      }

      async function exportZip() {
        try {
          const response = await fetch(API + '/export?zip=1');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          const stamp = new Date().toISOString().slice(0, 10);
          anchor.href = url;
          anchor.download = `rian-memory-star-${stamp}.memstar.zip`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setTransfer({ ok: true, text: '已导出 zip 备份（含星尘历史）' });
        } catch (cause) {
          setTransfer({ ok: false, text: String(cause.message || cause) });
        }
      }

      async function performExport(kind) {
        setPendingExport(null);
        if (kind === 'zip') {
          await exportZip();
        } else {
          await exportAll();
        }
      }

      function requestExport(kind) {
        if (settings?.exportReminder === false) {
          void performExport(kind);
          return;
        }
        setPendingExport(kind);
      }

      async function previewImport(buffer, isZip) {
        const path = isZip ? '/import-zip?preview=1' : '/import?preview=1';
        const response = await fetch(API + path, {
          method: 'POST',
          headers: { 'content-type': isZip ? 'application/zip' : 'application/json' },
          body: isZip ? buffer : new TextDecoder().decode(buffer),
        });
        const text = await response.text();
        let value;
        try {
          value = text ? JSON.parse(text) : {};
        } catch {
          value = { error: text };
        }
        if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
        return value;
      }

      async function importBuffer(buffer, isZip, strategy) {
        const path = (isZip ? '/import-zip' : '/import') + `?strategy=${strategy}`;
        const response = await fetch(API + path, {
          method: 'POST',
          headers: { 'content-type': isZip ? 'application/zip' : 'application/json' },
          body: isZip ? buffer : new TextDecoder().decode(buffer),
        });
        const text = await response.text();
        let value;
        try {
          value = text ? JSON.parse(text) : {};
        } catch {
          value = { error: text };
        }
        if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
        const imported = value.imported || {};
        const merged = imported.mergedStars ? `，合并 ${imported.mergedStars} 颗` : '';
        setTransfer({
          ok: true,
          text: `已导入 ${imported.maps || 0} 张图、${imported.stars || 0} 颗星${merged}`,
        });
        setPendingImport(null);
      }

      async function importFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
          const preview = await previewImport(buffer, isZip);
          if (preview.hasConflict) {
            setPendingImport({ buffer, isZip, preview });
            setTransfer(null);
            return;
          }
          await importBuffer(buffer, isZip, 'copy');
        } catch (cause) {
          setTransfer({ ok: false, text: String(cause.message || cause) });
        }
      }

      function confirmImport(strategy) {
        if (!pendingImport) return;
        const { buffer, isZip } = pendingImport;
        importBuffer(buffer, isZip, strategy).catch((cause) =>
          setTransfer({ ok: false, text: String(cause.message || cause) }),
        );
      }

      if (!settings) {
        return h(
          'div',
          { style: { padding: '24px', color: 'var(--dsw-alias-text-primary, inherit)' } },
          error || '加载中…',
        );
      }

      const field = (label, control) =>
        h(
          'label',
          { style: { display: 'grid', gridTemplateColumns: '180px 1fr', gap: '12px', alignItems: 'center', marginBottom: '12px' } },
          h('span', { style: { opacity: 0.78, fontSize: '12px' } }, label),
          control,
        );

      return h(
        'div',
        { style: { padding: '20px 24px', maxWidth: '760px', minHeight: '100%', background: 'var(--ms-bg)', color: 'var(--ms-text)', colorScheme: settings?.theme === 'light' ? 'light' : 'dark' } },
        h('h2', { style: { margin: '0 0 4px', fontSize: '18px' } }, '雨咯记忆星'),
        h(
          'p',
          { style: { margin: '0 0 18px', opacity: 0.6, fontSize: '12px' } },
          '跨会话的项目长期记忆。修改即时保存。',
        ),
        h('h3', { style: { margin: '0 0 10px', fontSize: '13px', opacity: 0.8 } }, '界面'),
        field(
          '界面模式',
          h(
            'select',
            {
              value: settings.uiMode || 'immersive',
              onChange: (event) => update({ uiMode: event.target.value }),
              style: { padding: '6px 8px', borderRadius: '8px', maxWidth: '220px' },
            },
            h('option', { value: 'immersive' }, '全沉浸'),
            h('option', { value: 'edit' }, '编辑模式'),
          ),
        ),
        h('h3', { style: { margin: '18px 0 10px', fontSize: '13px', opacity: 0.8 } }, '记忆'),
        field(
          '每轮注入条数',
          h('input', {
            type: 'number',
            min: 1,
            max: 12,
            value: settings.topK ?? 6,
            onChange: (event) => update({ topK: Number(event.target.value) }),
            style: { padding: '6px 8px', borderRadius: '8px', width: '90px' },
          }),
        ),
        field(
          '重复抑制回合数',
          h('input', {
            type: 'number',
            min: 0,
            max: 10,
            value: settings.repeatSuppressionTurns ?? 3,
            onChange: (event) =>
              update({ repeatSuppressionTurns: Number(event.target.value) }),
            style: { padding: '6px 8px', borderRadius: '8px', width: '90px' },
          }),
        ),
        field(
          '注入预算（token）',
          h('input', {
            type: 'number',
            min: 100,
            max: 2000,
            step: 50,
            value: settings.tokenBudget ?? 600,
            onChange: (event) => update({ tokenBudget: Number(event.target.value) }),
            style: { padding: '6px 8px', borderRadius: '8px', width: '110px' },
          }),
        ),
        field(
          '相关性阈值',
          h('input', {
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05,
            value: settings.threshold ?? 0.15,
            onChange: (event) => update({ threshold: Number(event.target.value) }),
            style: { padding: '6px 8px', borderRadius: '8px', width: '90px' },
          }),
        ),
        field(
          '直接生效置信线',
          h('input', {
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05,
            value: settings.directActiveConfidence ?? 0.85,
            onChange: (event) => update({ directActiveConfidence: Number(event.target.value) }),
            style: { padding: '6px 8px', borderRadius: '8px', width: '90px' },
          }),
        ),
        field(
          '衰减半衰期（天）',
          h('input', {
            type: 'number',
            min: 1,
            max: 365,
            step: 5,
            value: settings.halfLifeDays ?? 45,
            onChange: (event) => update({ halfLifeDays: Number(event.target.value) }),
            style: { padding: '6px 8px', borderRadius: '8px', width: '90px' },
          }),
        ),
        h('h3', { style: { margin: '18px 0 10px', fontSize: '13px', opacity: 0.8 } }, '外观'),
        field(
          '主题',
          h(
            'select',
            {
              value: settings.theme || 'dark',
              onChange: (event) => update({ theme: event.target.value }),
              style: { padding: '6px 8px', borderRadius: '8px', maxWidth: '160px' },
            },
            h('option', { value: 'dark' }, '深色'),
            h('option', { value: 'light' }, '浅色'),
          ),
        ),
        field(
          '雨丝强度',
          h(
            'select',
            {
              value: settings.rain || 'light',
              onChange: (event) => update({ rain: event.target.value }),
              style: { padding: '6px 8px', borderRadius: '8px', maxWidth: '160px' },
            },
            h('option', { value: 'light' }, '轻'),
            h('option', { value: 'mid' }, '中'),
            h('option', { value: 'off' }, '关'),
          ),
        ),
        h('h3', { style: { margin: '18px 0 10px', fontSize: '13px', opacity: 0.8 } }, '隐私'),
        field(
          '敏感过滤',
          h(
            'select',
            {
              value: settings.privacyMode || 'standard',
              onChange: (event) => update({ privacyMode: event.target.value }),
              style: { padding: '6px 8px', borderRadius: '8px', maxWidth: '180px' },
            },
            h('option', { value: 'standard' }, '标准'),
            h('option', { value: 'strict' }, '严格'),
            h('option', { value: 'credentials' }, '只拦凭据'),
          ),
        ),
        field(
          '自定义敏感词',
          h('input', {
            value: (settings.customSensitiveWords || []).join(','),
            onChange: (event) =>
              update({
                customSensitiveWords: event.target.value
                  .split(',')
                  .map((word) => word.trim())
                  .filter(Boolean),
              }),
            placeholder: '逗号分隔',
            style: { padding: '6px 8px', borderRadius: '8px', width: '260px' },
          }),
        ),
        field(
          '隐身模式',
          h(
            'label',
            { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' } },
            h('input', {
              type: 'checkbox',
              checked: Boolean(settings.privacyIncognito),
              onChange: (event) => update({ privacyIncognito: event.target.checked }),
            }),
            '暂停所有记忆写入与注入',
          ),
        ),
        h(
          'p',
          { style: { margin: '0 0 8px', opacity: 0.55, fontSize: '11px' } },
          '凭据类内容始终拒绝保存；自定义词在所有模式下生效。',
        ),
        saved ? h('div', { style: { color: '#8FE3B0', fontSize: '12px' } }, '已保存') : null,
        error ? h('div', { style: { color: '#FF9E9E', fontSize: '12px' } }, error) : null,
        h(
          'div',
          { style: { marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--ms-border)' } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
            h('h3', { style: { margin: 0, fontSize: '14px' } }, '健康度'),
            h('button', { type: 'button', onClick: refreshHealth }, '刷新'),
          ),
          health
            ? h(
                'div',
                {
                  style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
                    gap: '8px',
                  },
                },
                ...[
                  ['星图', health.maps],
                  ['活跃', health.active],
                  ['待确认', health.pending],
                  ['冲突', health.disputed],
                  ['归档', health.archived],
                  ['星总数', health.stars],
                  ['检索次数', health.metrics?.searches ?? 0],
                  ['最近检索', `${health.metrics?.lastSearchMs ?? 0}ms`],
                  ['写入次数', health.metrics?.saves ?? 0],
                  ['备份', health.backups ?? 0],
                ].map(([label, value]) =>
                  h(
                    'div',
                    {
                      key: label,
                      style: {
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--ms-border)',
                        background: 'var(--ms-subtle)',
                      },
                    },
                    h(
                      'div',
                      {
                        style: {
                          fontSize: '18px',
                          fontWeight: 600,
                          color:
                            label === '冲突' && value
                              ? '#FFD479'
                              : label === '待确认' && value
                                ? '#7FD8FF'
                                : 'inherit',
                        },
                      },
                      String(value ?? 0),
                    ),
                    h('div', { style: { fontSize: '11px', opacity: 0.6, marginTop: '2px' } }, label),
                  ),
                ),
              )
            : h('div', { style: { fontSize: '12px', opacity: 0.6 } }, '加载中…'),
          health?.dataDir
            ? h(
                'div',
                {
                  style: {
                    marginTop: '10px',
                    fontSize: '11px',
                    opacity: 0.55,
                    wordBreak: 'break-all',
                  },
                },
                health.dataDir,
              )
            : null,
          health
            ? h(
                'div',
                { style: { marginTop: '8px', display: 'grid', gap: '4px', fontSize: '12px' } },
                ...[
                  health.pending > 0 ? `有 ${health.pending} 颗待确认，去星云点亮或丢弃。` : null,
                  health.disputed > 0 ? `有 ${health.disputed} 条冲突待裁决。` : null,
                  health.active === 0 && health.pending === 0
                    ? '还没有记忆，去对话里让 AI 记住一件事。'
                    : null,
                ]
                  .filter(Boolean)
                  .map((text, index) =>
                    h('div', { key: index, style: { color: '#FFD479', opacity: 0.8 } }, `→ ${text}`),
                  ),
              )
            : null,
        ),
        h(
          'div',
          {
            style: {
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid var(--ms-border)',
            },
          },
          h('h3', { style: { margin: '0 0 6px', fontSize: '14px' } }, '数据'),
          h(
            'p',
            { style: { margin: '0 0 10px', opacity: 0.6, fontSize: '12px' } },
            '导出 JSON 或 zip（含星尘历史）；导入支持新建副本或合并到现有。',
          ),
          field(
            '导出前提醒',
            h(
              'label',
              { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' } },
              h('input', {
                type: 'checkbox',
                checked: settings.exportReminder !== false,
                onChange: (event) => update({ exportReminder: event.target.checked }),
              }),
              '导出前弹出确认',
            ),
          ),
          field(
            '自动备份',
            h(
              'label',
              { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' } },
              h('input', {
                type: 'checkbox',
                checked: settings.autoBackup !== false,
                onChange: (event) => update({ autoBackup: event.target.checked }),
              }),
              '启动时保留最近 5 份',
            ),
          ),
          h(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', { type: 'button', onClick: () => requestExport('json') }, '导出全部'),
            h('button', { type: 'button', onClick: () => requestExport('zip') }, '导出 zip'),
            h('button', { type: 'button', onClick: () => importRef.current?.click() }, '导入备份'),
            h('input', {
              ref: importRef,
              type: 'file',
              accept: '.zip,.json,.memstar.json',
              onChange: importFile,
              style: { display: 'none' },
            }),
          ),
          transfer
            ? h(
                'div',
                {
                  style: {
                    marginTop: '8px',
                    fontSize: '12px',
                    color: transfer.ok ? '#8FE3B0' : '#FF9E9E',
                  },
                },
                transfer.text,
              )
            : null,
        ),
        h(
          'div',
          {
            style: {
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid var(--ms-border)',
            },
          },
          h('h3', { style: { margin: '0 0 6px', fontSize: '14px' } }, '关于'),
          h(
            'div',
            { style: { fontSize: '12px', opacity: 0.7, display: 'grid', gap: '4px' } },
            h(
              'div',
              null,
              `版本 ${health?.version || '0.0.1'} · schema ${health?.schemaVersion || 1}`,
            ),
            h('div', null, `${health?.maps || 0} 张图 · ${health?.stars || 0} 颗星`),
            h('div', null, '导出备份前建议先确认数据目录。'),
          ),
          h(
            'button',
            {
              type: 'button',
              style: { marginTop: '10px' },
              onClick: () => setResetConfirm(true),
            },
            '恢复默认设置',
          ),
        ),
        resetConfirm
          ? h(
              'div',
              {
                style: {
                  position: 'fixed',
                  inset: 0,
                  zIndex: 80,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(4,7,18,0.72)',
                },
              },
              h(
                'div',
                {
                  style: {
                    width: '400px',
                    maxWidth: 'calc(100vw - 32px)',
                    padding: '18px',
                    borderRadius: '14px',
                    border: '1px solid var(--ms-border)',
                    background: 'var(--ms-panel)',
                    color: 'var(--ms-text)',
                    fontSize: '12px',
                  },
                },
                h(
                  'div',
                  { style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } },
                  '恢复默认设置',
                ),
                h(
                  'div',
                  { style: { opacity: 0.75, lineHeight: 1.6 } },
                  '将恢复界面、记忆、隐私和导出提醒的默认值；不会删除任何星图或记忆。',
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' } },
                  h('button', { type: 'button', onClick: () => setResetConfirm(false) }, '取消'),
                  h('button', { type: 'button', onClick: resetSettings }, '确认恢复'),
                ),
              ),
            )
          : null,
        pendingExport
          ? h(
              'div',
              {
                style: {
                  position: 'fixed',
                  inset: 0,
                  zIndex: 80,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(4,7,18,0.72)',
                },
              },
              h(
                'div',
                {
                  style: {
                    width: '400px',
                    maxWidth: 'calc(100vw - 32px)',
                    padding: '18px',
                    borderRadius: '14px',
                    border: '1px solid var(--ms-border)',
                    background: 'var(--ms-panel)',
                    color: 'var(--ms-text)',
                    fontSize: '12px',
                  },
                },
                h(
                  'div',
                  { style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } },
                  '导出备份',
                ),
                h(
                  'div',
                  { style: { opacity: 0.75, lineHeight: 1.6 } },
                  '导出会包含记忆内容与星尘历史，请确认文件存放位置安全。',
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' } },
                  h('button', { type: 'button', onClick: () => setPendingExport(null) }, '取消'),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => void performExport(pendingExport),
                    },
                    '确认导出',
                  ),
                ),
              ),
            )
          : null,
        pendingImport
          ? h(
              'div',
              {
                style: {
                  position: 'fixed',
                  inset: 0,
                  zIndex: 80,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(4,7,18,0.72)',
                },
              },
              h(
                'div',
                {
                  style: {
                    width: '420px',
                    maxWidth: 'calc(100vw - 32px)',
                    padding: '18px',
                    borderRadius: '14px',
                    border: '1px solid var(--ms-border)',
                    background: 'var(--ms-panel)',
                    color: 'var(--ms-text)',
                    fontSize: '12px',
                  },
                },
                h(
                  'div',
                  { style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } },
                  '发现同名星图',
                ),
                h(
                  'div',
                  { style: { opacity: 0.75, lineHeight: 1.6 } },
                  '以下星图已存在。选择新建副本，或合并到现有：',
                ),
                ...pendingImport.preview.maps
                  .filter((item) => item.existingId)
                  .map((item) =>
                    h(
                      'div',
                      {
                        key: item.name,
                        style: {
                          marginTop: '6px',
                          padding: '6px 8px',
                          borderRadius: '8px',
                          background: 'var(--ms-subtle)',
                        },
                      },
                      `「${item.name}」· ${item.starCount} 颗星`,
                    ),
                  ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } },
                  h('button', { type: 'button', onClick: () => confirmImport('copy') }, '新建副本'),
                  h('button', { type: 'button', onClick: () => confirmImport('merge') }, '合并到现有'),
                  h('button', { type: 'button', onClick: () => setPendingImport(null) }, '取消'),
                ),
              ),
            )
          : null,
      );
    }

    function BindingChip(props) {
      const sessionId = props.sessionId;
      const [binding, setBinding] = React.useState(null);
      const [maps, setMaps] = React.useState([]);
      const [muted, setMuted] = React.useState(false);

      React.useEffect(() => {
        if (!sessionId) return undefined;
        let alive = true;
        Promise.all([
          api(`/binding?sessionId=${encodeURIComponent(sessionId)}`),
          api('/maps'),
          api('/settings'),
        ])
          .then(([value, list, settingsValue]) => {
            if (!alive) return;
            setBinding(value);
            setMaps(list.maps || []);
            setMuted(
              Array.isArray(settingsValue.settings?.noMemorySessions) &&
                settingsValue.settings.noMemorySessions.includes(sessionId),
            );
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [sessionId]);

      if (!binding || !sessionId) return null;

      const projectMaps = maps.filter((map) => map.kind === 'project');
      const options = [{ id: '', name: '仅公共' }, ...projectMaps];

      async function cycle() {
        if (options.length < 2) return;
        const currentIndex = binding.mapId
          ? options.findIndex((option) => option.id === binding.mapId)
          : 0;
        const next = options[(Math.max(0, currentIndex) + 1) % options.length];
        if (!next) return;
        try {
          const updated = await api('/binding', {
            method: 'POST',
            body: JSON.stringify({ sessionId, mapId: next.id }),
          });
          setBinding(updated);
        } catch {
          // Keep the current chip silently; the next mount retries.
        }
      }

      async function toggleMute() {
        try {
          const value = await api('/settings');
          const current = Array.isArray(value.settings?.noMemorySessions)
            ? value.settings.noMemorySessions
            : [];
          const next = current.includes(sessionId)
            ? current.filter((id) => id !== sessionId)
            : [...current, sessionId];
          await api('/settings', {
            method: 'POST',
            body: JSON.stringify({ noMemorySessions: next }),
          });
          setMuted(next.includes(sessionId));
        } catch {
          // Keep the current state; the next mount retries.
        }
      }

      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            type: 'button',
            onClick: cycle,
            title: '公共星图始终参与召回；点击切换项目图',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '999px',
              border: '1px solid var(--ms-border)',
              background: 'rgba(127,216,255,0.08)',
              color: 'inherit',
              fontSize: '11px',
              cursor: 'pointer',
              maxWidth: '200px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: muted ? 0.55 : 1,
            },
          },
          `✦ ${binding.mapId ? `公共 + ${binding.name || '项目图'}` : '仅公共'}`,
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: toggleMute,
            title: muted ? '恢复此会话记忆' : '暂停此会话记忆',
            'aria-label': muted ? '恢复此会话记忆' : '暂停此会话记忆',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              marginLeft: '4px',
              borderRadius: '999px',
              border: '1px solid var(--ms-border)',
              background: muted ? 'rgba(255,107,107,0.16)' : 'var(--ms-subtle)',
              color: muted ? '#FF9E9E' : 'inherit',
              fontSize: '10px',
              cursor: 'pointer',
            },
          },
          muted ? '▶' : '⏸',
        ),
      );
    }

    function TurnTail(props) {
      const sessionId = props.sessionId;
      const turnNumber =
        typeof props.turn === 'number'
          ? props.turn
          : Number(props.turn?.turn ?? props.turn?.index ?? props.turn?.number ?? 0);
      const [stats, setStats] = React.useState(null);
      const [logOpen, setLogOpen] = React.useState(false);
      const [logEntries, setLogEntries] = React.useState([]);
      const [logError, setLogError] = React.useState(null);

      React.useEffect(() => {
        if (!sessionId || !turnNumber) return;
        let alive = true;
        api(`/traces?sessionId=${encodeURIComponent(sessionId)}`)
          .then((value) => {
            if (!alive) return;
            const entry = (value.turns || []).find((item) => Number(item.turn) === turnNumber);
            setStats(entry || null);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [sessionId, turnNumber]);

      async function openLog() {
        try {
          const value = await api(
            `/recall-log?sessionId=${encodeURIComponent(sessionId)}`,
          );
          setLogEntries(
            (value.entries || []).filter((item) => Number(item.turn) === turnNumber),
          );
          setLogError(null);
          setLogOpen(true);
        } catch (cause) {
          setLogEntries([]);
          setLogError(String(cause.message || cause));
          setLogOpen(true);
        }
      }

      if (!stats || (!stats.saved && !stats.recalled)) return null;
      const logModal = logOpen
        ? h(
            'div',
            {
              style: {
                position: 'fixed',
                inset: 0,
                zIndex: 80,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(4,7,18,0.72)',
              },
              onClick: () => setLogOpen(false),
            },
            h(
              'div',
              {
                style: {
                  width: '640px',
                  maxWidth: 'calc(100vw - 32px)',
                  maxHeight: '80vh',
                  overflow: 'auto',
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1px solid var(--ms-border)',
                  background: 'var(--ms-panel)',
                  color: 'var(--ms-text)',
                  fontSize: '12px',
                },
                onClick: (event) => event.stopPropagation(),
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } },
                h('div', { style: { fontSize: '15px', fontWeight: 600 } }, `第 ${turnNumber} 回合召回`),
                h('div', { style: { flex: 1 } }),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setLogOpen(false),
                    style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' },
                  },
                  '×',
                ),
              ),
              logError
                ? h('div', { style: { color: '#FF9E9E' } }, logError)
                : null,
              logEntries.length
                ? logEntries.map((entry, index) =>
                    h(
                      'div',
                      {
                        key: `${entry.step}-${index}`,
                        style: {
                          padding: '8px 0',
                          borderBottom: '1px solid var(--ms-border)',
                        },
                      },
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px', fontSize: '11px', opacity: 0.6 } },
                        h('span', null, entry.mode === 'brief' ? '开场简报' : '每轮召回'),
                        h('span', null, `step ${entry.step}`),
                        h('span', null, `${entry.count} 颗`),
                        h('span', null, new Date(entry.at).toLocaleTimeString()),
                      ),
                      h(
                        'pre',
                        {
                          style: {
                            margin: '6px 0 0',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                            fontSize: '10px',
                            opacity: 0.82,
                            lineHeight: 1.5,
                          },
                        },
                        entry.text || '（空）',
                      ),
                    ),
                  )
                : h(
                    'div',
                    { style: { opacity: 0.6, padding: '10px 0' } },
                    '本轮没有召回日志。可能为空召回，或该回合发生在日志功能启用前。',
                  ),
            ),
          )
        : null;
      return h(
        React.Fragment,
        null,
        h(
          'div',
          {
            style: {
              display: 'flex',
              gap: '8px',
              padding: '2px 0',
              fontSize: '11px',
              opacity: 0.62,
            },
          },
          stats.saved ? h('span', null, `✦ 摘星 ${stats.saved}`) : null,
          stats.recalled
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: openLog,
                  title: '查看本轮实际注入的召回内容',
                  style: {
                    border: 0,
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '11px',
                    textDecoration: 'underline dotted',
                  },
                },
                `召回 ${stats.recalled}`,
              )
            : null,
        ),
        logModal,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'rian-memory-star',
              order: 30,
              label: () => '记忆星',
            },
            MemoryIcon,
          ),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'rian-memory-star' }, Panel),
        );
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'rian-memory-star',
              order: 60,
              label: () => '雨咯记忆星',
            },
            Settings,
          ),
        );
        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register(
            {
              name: 'conversation.chat.turnTail',
              id: 'rian-memory-star-tail',
              order: 60,
            },
            TurnTail,
          ),
        );
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'rian-memory-star-binding',
              order: 30,
            },
            BindingChip,
          ),
        );
      },
    };
  },
});

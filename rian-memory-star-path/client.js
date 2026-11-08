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
        accent: '#7FD8FF',
        warn: '#FFD479',
        violet: '#B98CFF',
        glass: 'rgba(16,22,47,0.82)',
        vignette: 'rgba(3,6,18,0.55)',
        nebula1: 'rgba(90,70,200,0.28)',
        nebula2: 'rgba(20,120,180,0.2)',
        nebula3: 'rgba(255,120,200,0.1)',
      },
      light: {
        bg: '#F4F6FB',
        panel: '#FFFFFF',
        panel2: '#E9EEF9',
        text: '#17203A',
        border: 'rgba(23,32,58,0.18)',
        subtle: 'rgba(23,32,58,0.06)',
        accent: '#0B63CE',
        warn: '#8A5A00',
        violet: '#6533B7',
        glass: 'rgba(255,255,255,0.82)',
        vignette: 'rgba(20,30,60,0.16)',
        nebula1: 'rgba(120,140,255,0.18)',
        nebula2: 'rgba(80,200,220,0.14)',
        nebula3: 'rgba(255,160,220,0.12)',
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
      root.style.setProperty('--ms-accent', theme.accent);
      root.style.setProperty('--ms-warn', theme.warn);
      root.style.setProperty('--ms-violet', theme.violet);
      root.style.setProperty('--ms-panel-glass', theme.glass);
      root.style.setProperty('--ms-vignette', theme.vignette);
      root.style.setProperty('--ms-nebula-1', theme.nebula1);
      root.style.setProperty('--ms-nebula-2', theme.nebula2);
      root.style.setProperty('--ms-nebula-3', theme.nebula3);
    }

    function normalizeSettings(value) {
      return { ...(value || {}), viewMode: '2d' };
    }

    function hash01(value) {
      const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    }

    const scatterPointsCache = new Map();

    function mulberry32(seed) {
      let value = seed >>> 0;
      return function random() {
        value = (value + 0x6d2b79f5) | 0;
        let next = Math.imul(value ^ (value >>> 15), 1 | value);
        next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
      };
    }

    function poissonPoints(count, width, height) {
      if (!count) return [];
      const aspect = width / height;
      const baseArea = width * height * 1.44;
      const area = Math.max(baseArea, (count * 40 * 40) / 0.22);
      const worldWidth = Math.max(Math.sqrt(area * aspect), width * 1.2);
      const worldHeight = Math.max(Math.sqrt(area / aspect), height * 1.2);
      const minDistance = Math.max(
        28,
        Math.sqrt((worldWidth * worldHeight * 0.22) / count),
      );
      const points = [];
      const random = mulberry32(
        (Math.imul(count, 2654435761) ^ Math.imul(width, 31) ^ height) >>> 0,
      );
      const cell = minDistance / Math.SQRT2;
      const gridCols = Math.max(1, Math.ceil(worldWidth / cell));
      const gridRows = Math.max(1, Math.ceil(worldHeight / cell));
      const grid2 = new Int32Array(gridCols * gridRows);
      const fits = (x, y) => {
        const col = Math.floor(x / cell);
        const row = Math.floor(y / cell);
        for (let r = Math.max(0, row - 2); r <= Math.min(gridRows - 1, row + 2); r += 1) {
          for (let c = Math.max(0, col - 2); c <= Math.min(gridCols - 1, col + 2); c += 1) {
            const index = grid2[r * gridCols + c];
            if (!index) continue;
            const other = points[index - 1];
            if (Math.hypot(other[0] - x, other[1] - y) < minDistance) return false;
          }
        }
        return true;
      };
      const attempts = count * 40;
      for (let attempt = 0; attempt < attempts && points.length < count; attempt += 1) {
        const x = random() * worldWidth;
        const y = random() * worldHeight;
        if (!fits(x, y)) continue;
        points.push([x, y]);
        grid2[
          Math.floor(y / cell) * gridCols + Math.floor(x / cell)
        ] = points.length;
      }
      const left = (width - worldWidth) / 2;
      const top = (height - worldHeight) / 2;
      return points.map(([x, y]) => ({
        x: x + left,
        y: y + top,
        distance: Math.hypot(x - worldWidth / 2, y - worldHeight / 2),
      }));
    }

    function buildScatterLayout(stars, width, height, totalCount) {
      const total = Math.max(stars.length, Number(totalCount) || stars.length);
      if (!total) return new Map();
      const cacheKey = `${total}:${width}:${height}`;
      let slots = scatterPointsCache.get(cacheKey);
      if (!slots) {
        slots = poissonPoints(total, width, height).sort(
          (a, b) => b.distance - a.distance,
        );
        if (scatterPointsCache.size > 6) scatterPointsCache.clear();
        scatterPointsCache.set(cacheKey, slots);
      }
      const ranked = stars
        .map((star) => ({
          star,
          weight: weightOf(star) + Number(star.importance ?? 0.5) * 0.6,
        }))
        .sort((a, b) => b.weight - a.weight);
      const positions = new Map();
      ranked.forEach((entry, rank) => {
        const slot = slots[rank];
        if (!slot) return;
        positions.set(entry.star.id, {
          x: slot.x,
          y: slot.y,
          z: 0,
        });
      });
      return positions;
    }

    applyTheme('dark');
    function starDepth(star, width, height) {
      const id = String(star?.id || star?.title || '');
      let hash = 2166136261;
      for (let index = 0; index < id.length; index += 1) {
        hash ^= id.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      const unit = (hash % 10000) / 10000;
      return (unit - 0.5) * Math.min(width, height) * 0.5;
    }

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

    const STAR_POINT_SIZE = 32;

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
uniform float u_sizeScale;
out vec3 v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = a_size * u_sizeScale;
  v_color = a_color;
}`;

      const starFS = `#version 300 es
precision mediump float;
in vec3 v_color;
uniform float u_alpha;
out vec4 out_color;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  float core = smoothstep(0.62, 0.0, d);
  float halo = smoothstep(1.0, 0.04, d) * 0.34;
  float spikeH = max(0.0, 1.0 - abs(uv.y) * 7.0) * max(0.0, 1.0 - abs(uv.x) * 1.2);
  float spikeV = max(0.0, 1.0 - abs(uv.x) * 7.0) * max(0.0, 1.0 - abs(uv.y) * 1.2);
  float alpha = core * 0.96 + halo + (spikeH + spikeV) * 0.5;
  vec3 color = mix(v_color, vec3(1.0), core);
  out_color = vec4(color, clamp(alpha, 0.0, 1.0) * u_alpha);
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
      const starSizeScaleLoc = gl.getUniformLocation(starProgram, 'u_sizeScale');
      const starAlphaLoc = gl.getUniformLocation(starProgram, 'u_alpha');
      const lineResLoc = gl.getUniformLocation(lineProgram, 'u_resolution');
      const lineColorLoc = gl.getUniformLocation(lineProgram, 'u_color');

      return {
        kind: '2d',
        canvas,
        draw(width, height, dpr, positions, edges, panX = 0, panY = 0) {
          const pixelWidth = Math.max(1, Math.floor(width * dpr));
          const pixelHeight = Math.max(1, Math.floor(height * dpr));
          if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
          if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
          gl.viewport(0, 0, pixelWidth, pixelHeight);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          const project = (x, y) => ({ x: x + panX, y: y + panY });
          const projected = [];

          if (edges.length) {
            const lineData = new Float32Array(edges.length * 4);
            let cursor = 0;
            for (const edge of edges) {
              const from = project(edge.from.x, edge.from.y);
              const to = project(edge.to.x, edge.to.y);
              lineData[cursor++] = from.x * dpr;
              lineData[cursor++] = from.y * dpr;
              lineData[cursor++] = to.x * dpr;
              lineData[cursor++] = to.y * dpr;
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
              const point = project(item.x, item.y);
              positionData[index * 2] = point.x * dpr;
              positionData[index * 2 + 1] = point.y * dpr;
              sizeData[index] = STAR_POINT_SIZE * dpr;
              const rgb = hexToRgb(TYPE_COLOR[item.star.type] || '#CFE3FF');
              colorData[index * 3] = rgb[0];
              colorData[index * 3 + 1] = rgb[1];
              colorData[index * 3 + 2] = rgb[2];
              projected.push({ ...item, x: point.x, y: point.y });
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
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.uniform1f(starSizeScaleLoc, 2.15);
            gl.uniform1f(starAlphaLoc, 0.16);
            gl.drawArrays(gl.POINTS, 0, count);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.uniform1f(starSizeScaleLoc, 1);
            gl.uniform1f(starAlphaLoc, 1);
            gl.drawArrays(gl.POINTS, 0, count);
          }
          return projected;
        },
      };
    }

    function createWebGLRenderer3D(canvas) {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });
      if (!gl) return null;

      const starVS = `#version 300 es
in vec3 a_position;
in float a_size;
in vec3 a_color;
in float a_phase;
uniform mat4 u_viewProjection;
uniform float u_dpr;
uniform float u_time;
uniform float u_sizeScale;
uniform float u_alpha;
out vec3 v_color;
out float v_alpha;
void main() {
  vec4 clip = u_viewProjection * vec4(a_position, 1.0);
  gl_Position = clip;
  float depth = max(0.2, clip.w);
  float twinkle = 0.88 + 0.12 * sin(u_time * 1.6 + a_phase);
  gl_PointSize = clamp(a_size * u_dpr * (1.8 / depth) * u_sizeScale * twinkle, 1.0, 64.0);
  v_color = a_color;
  v_alpha = clamp(1.8 / depth, 0.2, 1.0) * u_alpha * twinkle;
}`;

      const starFS = `#version 300 es
precision mediump float;
in vec3 v_color;
in float v_alpha;
out vec4 out_color;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  float core = smoothstep(1.0, 0.0, d);
  float glow = pow(core, 2.0);
  out_color = vec4(v_color, clamp(core * 0.92 + glow * 0.32, 0.0, 1.0) * v_alpha);
}`;

      const lineVS = `#version 300 es
in vec3 a_position;
uniform mat4 u_viewProjection;
void main() {
  gl_Position = u_viewProjection * vec4(a_position, 1.0);
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
          console.error('[memory-star] 3d shader error', gl.getShaderInfoLog(shader));
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
          console.error('[memory-star] 3d program error', gl.getProgramInfoLog(program));
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
      const starPhaseBuffer = gl.createBuffer();
      gl.bindVertexArray(starVao);
      const starPosLoc = gl.getAttribLocation(starProgram, 'a_position');
      const starSizeLoc = gl.getAttribLocation(starProgram, 'a_size');
      const starColorLoc = gl.getAttribLocation(starProgram, 'a_color');
      const starPhaseLoc = gl.getAttribLocation(starProgram, 'a_phase');
      gl.bindBuffer(gl.ARRAY_BUFFER, starPosBuffer);
      gl.enableVertexAttribArray(starPosLoc);
      gl.vertexAttribPointer(starPosLoc, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, starSizeBuffer);
      gl.enableVertexAttribArray(starSizeLoc);
      gl.vertexAttribPointer(starSizeLoc, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, starColorBuffer);
      gl.enableVertexAttribArray(starColorLoc);
      gl.vertexAttribPointer(starColorLoc, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, starPhaseBuffer);
      gl.enableVertexAttribArray(starPhaseLoc);
      gl.vertexAttribPointer(starPhaseLoc, 1, gl.FLOAT, false, 0, 0);

      const lineVao = gl.createVertexArray();
      const lineBuffer = gl.createBuffer();
      gl.bindVertexArray(lineVao);
      const linePosLoc = gl.getAttribLocation(lineProgram, 'a_position');
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.enableVertexAttribArray(linePosLoc);
      gl.vertexAttribPointer(linePosLoc, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      const starVpLoc = gl.getUniformLocation(starProgram, 'u_viewProjection');
      const starDprLoc = gl.getUniformLocation(starProgram, 'u_dpr');
      const starTimeLoc = gl.getUniformLocation(starProgram, 'u_time');
      const starSizeScaleLoc = gl.getUniformLocation(starProgram, 'u_sizeScale');
      const starAlphaLoc = gl.getUniformLocation(starProgram, 'u_alpha');
      const lineVpLoc = gl.getUniformLocation(lineProgram, 'u_viewProjection');
      const lineColorLoc = gl.getUniformLocation(lineProgram, 'u_color');

      const camera = {
        yaw: 0.55,
        pitch: -0.28,
        distance: 3.4,
        target: [0, 0, 0],
        autoRotate: true,
        dragging: false,
        velocityYaw: 0,
        velocityPitch: 0,
        lastTime: 0,
      };

      function perspective(fovy, aspect, near, far) {
        const f = 1 / Math.tan(fovy / 2);
        return new Float32Array([
          f / aspect, 0, 0, 0,
          0, f, 0, 0,
          0, 0, (far + near) / (near - far), -1,
          0, 0, (2 * far * near) / (near - far), 0,
        ]);
      }

      function lookAt(eye, center, up) {
        const zx = eye[0] - center[0];
        const zy = eye[1] - center[1];
        const zz = eye[2] - center[2];
        const zl = Math.hypot(zx, zy, zz) || 1;
        const z0 = zx / zl;
        const z1 = zy / zl;
        const z2 = zz / zl;
        let x0 = up[1] * z2 - up[2] * z1;
        let x1 = up[2] * z0 - up[0] * z2;
        let x2 = up[0] * z1 - up[1] * z0;
        const xl = Math.hypot(x0, x1, x2) || 1;
        x0 /= xl;
        x1 /= xl;
        x2 /= xl;
        const y0 = z1 * x2 - z2 * x1;
        const y1 = z2 * x0 - z0 * x2;
        const y2 = z0 * x1 - z1 * x0;
        return new Float32Array([
          x0, y0, z0, 0,
          x1, y1, z1, 0,
          x2, y2, z2, 0,
          -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
          -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
          -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
          1,
        ]);
      }

      function multiply(a, b) {
        const out = new Float32Array(16);
        for (let column = 0; column < 4; column += 1) {
          for (let row = 0; row < 4; row += 1) {
            out[column * 4 + row] =
              a[0 * 4 + row] * b[column * 4 + 0] +
              a[1 * 4 + row] * b[column * 4 + 1] +
              a[2 * 4 + row] * b[column * 4 + 2] +
              a[3 * 4 + row] * b[column * 4 + 3];
          }
        }
        return out;
      }

      return {
        kind: '3d',
        orbit(dx, dy) {
          camera.dragging = true;
          camera.yaw += dx * 0.008;
          camera.pitch = Math.max(-1.2, Math.min(1.2, camera.pitch + dy * 0.006));
          camera.velocityYaw = dx * 0.0012;
          camera.velocityPitch = dy * 0.0008;
        },
        endDrag() {
          camera.dragging = false;
        },
        tick(time) {
          const previous = camera.lastTime || time;
          const dt = Math.min(0.05, Math.max(0.001, (time - previous) / 1000));
          camera.lastTime = time;
          if (camera.autoRotate && !camera.dragging) {
            camera.yaw += dt * 0.16;
          }
          camera.yaw += camera.velocityYaw;
          camera.pitch = Math.max(
            -1.2,
            Math.min(1.2, camera.pitch + camera.velocityPitch),
          );
          camera.velocityYaw *= 0.9;
          camera.velocityPitch *= 0.9;
        },
        zoom(delta) {
          camera.distance = Math.max(
            0.015,
            camera.distance * (delta > 0 ? 1.08 : 0.92),
          );
        },
        setAutoRotate(value) {
          camera.autoRotate = Boolean(value);
          return camera.autoRotate;
        },
        getAutoRotate() {
          return camera.autoRotate;
        },
        focusItem(item, width, height) {
          if (!item) return;
          const minDim = Math.max(1, Math.min(width, height));
          camera.target = [
            ((item.worldX ?? item.x) - width / 2) / minDim,
            -((item.worldY ?? item.y) - height / 2) / minDim,
            (item.worldZ ?? item.z ?? 0) / minDim,
          ];
          camera.distance = 2;
          camera.velocityYaw = 0;
          camera.velocityPitch = 0;
        },
        reset() {
          camera.yaw = 0.55;
          camera.pitch = -0.28;
          camera.distance = 3.4;
          camera.target = [0, 0, 0];
          camera.autoRotate = true;
          camera.dragging = false;
          camera.velocityYaw = 0;
          camera.velocityPitch = 0;
        },
        getRevealLevel() {
          if (camera.distance >= 3.6) return 0;
          const level =
            Math.log(3.6 / camera.distance) / Math.log(3.6 / 0.25);
          return Math.max(0, Math.min(1, level));
        },
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

          const minDim = Math.max(1, Math.min(width, height));
          const cosPitch = Math.cos(camera.pitch);
          const target = camera.target;
          const eye = [
            target[0] + Math.sin(camera.yaw) * cosPitch * camera.distance,
            target[1] + Math.sin(camera.pitch) * camera.distance,
            target[2] + Math.cos(camera.yaw) * cosPitch * camera.distance,
          ];
          const view = lookAt(eye, target, [0, 1, 0]);
          const near = Math.max(0.0005, camera.distance * 0.004);
          const far = Math.max(80, camera.distance * 40);
          const projection = perspective(Math.PI / 4, width / height, near, far);
          const viewProjection = multiply(projection, view);
          const project = (x, y, z) => {
            const nx = (x - width / 2) / minDim;
            const ny = -(y - height / 2) / minDim;
            const nz = (z || 0) / minDim;
            const clipX =
              viewProjection[0] * nx +
              viewProjection[4] * ny +
              viewProjection[8] * nz +
              viewProjection[12];
            const clipY =
              viewProjection[1] * nx +
              viewProjection[5] * ny +
              viewProjection[9] * nz +
              viewProjection[13];
            const clipZ =
              viewProjection[2] * nx +
              viewProjection[6] * ny +
              viewProjection[10] * nz +
              viewProjection[14];
            const clipW =
              viewProjection[3] * nx +
              viewProjection[7] * ny +
              viewProjection[11] * nz +
              viewProjection[15];
            const visible = clipW > 0.05;
            return {
              nx,
              ny,
              nz,
              w: clipW,
              depth: clipZ,
              visible,
              sx: visible ? (clipX / clipW * 0.5 + 0.5) * width : -9999,
              sy: visible ? (0.5 - clipY / clipW * 0.5) * height : -9999,
            };
          };

          if (edges.length) {
            const lineValues = [];
            for (const edge of edges) {
              const from = project(edge.from.x, edge.from.y, edge.from.z);
              const to = project(edge.to.x, edge.to.y, edge.to.z);
              if (!from.visible || !to.visible) continue;
              lineValues.push(from.nx, from.ny, from.nz, to.nx, to.ny, to.nz);
            }
            if (lineValues.length) {
              const lineData = new Float32Array(lineValues);
              gl.useProgram(lineProgram);
              gl.uniformMatrix4fv(lineVpLoc, false, viewProjection);
              gl.uniform4f(lineColorLoc, 0.72, 0.8, 1.0, 0.16);
              gl.bindVertexArray(lineVao);
              gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
              gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
              gl.drawArrays(gl.LINES, 0, lineValues.length / 3);
            }
          }

          const count = positions.length;
          const heavy = count > 20000;
          if (count) {
            const positionData = new Float32Array(count * 3);
            const sizeData = new Float32Array(count);
            const colorData = new Float32Array(count * 3);
            const phaseData = new Float32Array(count);
            const projected = [];
            positions.forEach((item, index) => {
              const point = project(item.x, item.y, item.z);
              const weight = heavy ? 0.5 : weightOf(item.star);
              const radius = heavy
                ? 2.2 + 3 * Number(item.star.importance ?? 0.5)
                : 3.5 + 9 * Number(item.star.importance ?? 0.5) * weight;
              positionData[index * 3] = point.nx;
              positionData[index * 3 + 1] = point.ny;
              positionData[index * 3 + 2] = point.nz;
              sizeData[index] = point.visible ? Math.max(2, radius * 2) : 0;
              const rgb = hexToRgb(TYPE_COLOR[item.star.type] || '#CFE3FF');
              colorData[index * 3] = rgb[0];
              colorData[index * 3 + 1] = rgb[1];
              colorData[index * 3 + 2] = rgb[2];
              const id = String(item.star.id || '');
              let hash = 0;
              for (let cursor = 0; cursor < id.length; cursor += 1) {
                hash = (hash * 31 + id.charCodeAt(cursor)) >>> 0;
              }
              phaseData[index] = ((hash % 1000) / 1000) * Math.PI * 2;
              projected.push({
                ...item,
                x: point.sx,
                y: point.sy,
                worldX: item.x,
                worldY: item.y,
                worldZ: item.z,
                depth: point.depth,
                visible: point.visible,
              });
            });
            gl.useProgram(starProgram);
            gl.uniformMatrix4fv(starVpLoc, false, viewProjection);
            gl.uniform1f(starDprLoc, dpr);
            gl.uniform1f(starTimeLoc, performance.now() / 1000);
            gl.bindVertexArray(starVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, starPosBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, starSizeBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, sizeData, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, starColorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, starPhaseBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, phaseData, gl.DYNAMIC_DRAW);

            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.uniform1f(starSizeScaleLoc, 3.2);
            gl.uniform1f(starAlphaLoc, 0.12);
            gl.drawArrays(gl.POINTS, 0, count);

            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.uniform1f(starSizeScaleLoc, 1);
            gl.uniform1f(starAlphaLoc, 1);
            gl.drawArrays(gl.POINTS, 0, count);
            return projected;
          }
          return [];
        },
      };
    }

    function drawLabels(canvas, width, height, dpr, positions, selectedId, hoveredId, emptyText, constellations) {
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
      if (positions.length > 2000) {
        if (emptyText) {
          surface.fillStyle = 'rgba(232,236,255,0.62)';
          surface.font = '14px system-ui, sans-serif';
          surface.textAlign = 'center';
          surface.fillText(emptyText, width / 2, height / 2);
          surface.textAlign = 'start';
        }
        return;
      }
      const byId = new Map(positions.map((item) => [item.star.id, item]));
      for (const [index, constellation] of (constellations || []).entries()) {
        const members = (constellation.starIds || [])
          .map((starId) => byId.get(starId))
          .filter((member) => member && member.visible !== false);
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
      const dense = positions.length > 2000;
      for (const item of positions) {
        if (item.visible === false) continue;
        const weight = dense ? 0.5 : weightOf(item.star);
        const radius = STAR_POINT_SIZE / 2;
        if (item.star.id === selectedId) {
          surface.strokeStyle = '#FFD479';
          surface.lineWidth = 2;
          surface.beginPath();
          surface.arc(item.x, item.y, radius + 5, 0, Math.PI * 2);
          surface.stroke();
        } else if (item.star.id === hoveredId) {
          surface.strokeStyle = '#7FD8FF';
          surface.lineWidth = 1.5;
          surface.beginPath();
          surface.arc(item.x, item.y, radius + 4, 0, Math.PI * 2);
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
      const [settings, setSettings] = React.useState({ viewMode: '2d', theme: 'dark' });
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
      const starLayerRef = React.useRef(null);
      const interactionRef = React.useRef(null);
      const glRef = React.useRef({ canvas: null, renderer: null, mode: null });
      const drawRef = React.useRef(null);
      const dragRef = React.useRef({ active: false, lastX: 0, lastY: 0, moved: 0 });
      const pressedStarRef = React.useRef(null);
      const suppressBackgroundClickRef = React.useRef(false);
      const hoveredIdRef = React.useRef(null);
      const pan2dRef = React.useRef({ x: 0, y: 0 });
      const [hovered, setHovered] = React.useState(null);
      const [autoRotate, setAutoRotate] = React.useState(true);
      const layoutRef = React.useRef({ worker: null, url: null, positions: new Map(), frame: 0 });
      const [size, setSize] = React.useState({ width: 640, height: 420 });
      const sizeRef = React.useRef(size);
      const dataRef = React.useRef(null);
      const loadedRef = React.useRef({
        stars: new Map(),
        edges: new Map(),
        positions: new Map(),
      });
      const viewportSeqRef = React.useRef(0);
      const viewportRequestRef = React.useRef({ inFlight: false, pending: null });
      const viewportTimerRef = React.useRef(0);
      const fetchViewportRef = React.useRef(null);
      const [viewportLoading, setViewportLoading] = React.useState(false);
      const [layoutVersion, setLayoutVersion] = React.useState(0);
      const immersive = settings?.uiMode !== 'edit';

      React.useEffect(() => {
        sizeRef.current = size;
      }, [size]);

      React.useEffect(() => {
        dataRef.current = data;
      }, [data]);

      React.useEffect(() => {
        let alive = true;
        api('/settings')
          .then((value) => alive && setSettings(normalizeSettings(value.settings)))
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

      const activeMapRef = React.useRef(null);

      const mergeViewport = React.useCallback((mapId, value, replace) => {
        const bucket = loadedRef.current;
        if (replace) {
          bucket.stars.clear();
          bucket.edges.clear();
          bucket.positions.clear();
        }
        const positionById = new Map(
          (value.positions || []).map((item) => [item.id, item]),
        );
        for (const star of value.stars || []) {
          const point = positionById.get(star.id);
          if (!point) continue;
          const previousStar = bucket.stars.get(star.id) || {};
          bucket.stars.set(star.id, {
            ...previousStar,
            ...star,
            viewportX: point.x,
            viewportY: point.y,
          });
          bucket.positions.set(star.id, point);
        }
        for (const edge of value.edges || []) {
          const key = edge.id || `${edge.from}|${edge.to}|${edge.relation}`;
          bucket.edges.set(key, edge);
        }
        setData((previous) => ({
          ...(previous || {}),
          map: value.map || previous?.map,
          publicMapId: value.publicMapId || previous?.publicMapId,
          stars: [...bucket.stars.values()],
          edges: [...bucket.edges.values()],
          total: value.total ?? previous?.total ?? 0,
          viewport: true,
          constellations: previous?.constellations || [],
          inactive: previous?.inactive || [],
        }));
      }, []);

      const fetchViewport = React.useCallback(
        async (mapId, cx, cy, replace = false) => {
          if (!mapId) return;
          const request = viewportRequestRef.current;
          if (request.inFlight) {
            request.pending = { mapId, cx, cy, replace };
            return;
          }
          request.inFlight = true;
          activeMapRef.current = mapId;
          const sequence = viewportSeqRef.current + 1;
          viewportSeqRef.current = sequence;
          setViewportLoading(true);
          try {
            const width = sizeRef.current.width;
            const height = sizeRef.current.height;
            const value = await api(
              `/maps/${encodeURIComponent(mapId)}/viewport?cx=${cx.toFixed(1)}&cy=${cy.toFixed(1)}&w=${width}&h=${height}&pad=450`,
            );
            if (sequence !== viewportSeqRef.current || activeMapRef.current !== mapId) return;
            mergeViewport(mapId, value, replace);
          } catch (cause) {
            if (sequence === viewportSeqRef.current) setError(String(cause.message || cause));
          } finally {
            request.inFlight = false;
            if (sequence === viewportSeqRef.current) setViewportLoading(false);
            const pending = request.pending;
            request.pending = null;
            if (pending && pending.mapId === activeMapRef.current) {
              window.setTimeout(
                () =>
                  fetchViewportRef.current?.(
                    pending.mapId,
                    pending.cx,
                    pending.cy,
                    pending.replace,
                  ),
                0,
              );
            }
          }
        },
        [mergeViewport],
      );
      fetchViewportRef.current = fetchViewport;

      const loadMap = React.useCallback(
        async (mapId) => {
          if (!mapId) return;
          activeMapRef.current = mapId;
          loadedRef.current.stars.clear();
          loadedRef.current.edges.clear();
          loadedRef.current.positions.clear();
          try {
            const meta = await api(`/maps/${encodeURIComponent(mapId)}/meta`);
            if (activeMapRef.current !== mapId) return;
            setData({
              ...meta,
              stars: [],
              edges: [],
              total: meta.total ?? 0,
              viewport: true,
            });
            setSelectedId(null);
            await fetchViewport(mapId, 0, 0, true);
          } catch (cause) {
            setError(String(cause.message || cause));
          }
        },
        [fetchViewport],
      );

      const refreshViewport = React.useCallback(() => {
        const mapId = activeMapRef.current;
        if (!mapId) return;
        const cx = -pan2dRef.current.x;
        const cy = -pan2dRef.current.y;
        fetchViewport(mapId, cx, cy, false);
      }, [fetchViewport]);

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
        const layer = interactionRef.current;
        if (!layer) return undefined;
        const parent = layer.parentElement;
        if (!parent) return undefined;
        const update = () => {
          const rect = parent.getBoundingClientRect();
          const next = {
            width: Math.max(320, Math.floor(rect.width)),
            height: Math.max(240, Math.floor(rect.height)),
          };
          sizeRef.current = next;
          setSize(next);
          if (activeMapRef.current) refreshViewport();
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(parent);
        return () => observer.disconnect();
      }, []);

      React.useEffect(() => {
        if (!canvasRef.current) return undefined;
        const active = (data?.stars || []).filter((star) => star.status === 'active');
        const width = size.width;
        const height = size.height;
        if (data?.viewport) {
          const viewportPositions = new Map();
          for (const star of active) {
            if (Number.isFinite(star.viewportX) && Number.isFinite(star.viewportY)) {
              viewportPositions.set(star.id, {
                x: width / 2 + star.viewportX,
                y: height / 2 + star.viewportY,
              });
            }
          }
          const state = layoutRef.current;
          state.positions = viewportPositions;
          if (state.worker) {
            state.worker.terminate();
            state.worker = null;
          }
          if (state.url) {
            URL.revokeObjectURL(state.url);
            state.url = null;
          }
          setLayoutVersion((version) => version + 1);
          return undefined;
        }
        const scatterInitial = buildScatterLayout(
          active,
          width,
          height,
          data?.total || active.length,
        );
        const scatterState = layoutRef.current;
        scatterState.positions = scatterInitial;
        if (scatterState.worker) {
          scatterState.worker.terminate();
          scatterState.worker = null;
        }
        if (scatterState.url) {
          URL.revokeObjectURL(scatterState.url);
          scatterState.url = null;
        }
        setLayoutVersion((version) => version + 1);
        return undefined;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.34;
        const initial = new Map();
        if (active.length > 20000) {
          const maxRadius = Math.min(width, height) * 0.46;
          active.forEach((star, index) => {
            const t = index / Math.max(1, active.length - 1);
            const arm = index % 3;
            const spiralRadius = Math.sqrt(t) * maxRadius;
            const angle =
              t * Math.PI * 12 +
              arm * ((Math.PI * 2) / 3) +
              (index % 29) * 0.012;
            const jitter = 0.9 + 0.1 * Math.sin(index * 1.618);
            initial.set(star.id, {
              x: centerX + Math.cos(angle) * spiralRadius * jitter,
              y: centerY + Math.sin(angle) * spiralRadius * jitter,
            });
          });
          const state = layoutRef.current;
          state.positions = initial;
          if (state.worker) {
            state.worker.terminate();
            state.worker = null;
          }
          if (state.url) {
            URL.revokeObjectURL(state.url);
            state.url = null;
          }
          setLayoutVersion((version) => version + 1);
          return undefined;
        }
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
        const layer = interactionRef.current;
        if (!layer || maps.length < 2) return undefined;
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
        layer.addEventListener('wheel', onWheel, { passive: false });
        return () => layer.removeEventListener('wheel', onWheel);
      }, [maps, activeId]);

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

        const mode = '2d';
        if (
          !glRef.current.renderer ||
          glRef.current.canvas !== canvas ||
          glRef.current.mode !== mode
        ) {
          const created =
            mode === '3d' ? createWebGLRenderer3D(canvas) : createWebGLRenderer(canvas);
          glRef.current.renderer = created || createWebGLRenderer(canvas);
          glRef.current.mode = created ? mode : '2d';
          glRef.current.canvas = canvas;
        }
        const glRenderer = glRef.current.renderer;
        if (glRenderer) {
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          const stored = layoutRef.current.positions;
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
          const centerX = width / 2;
          const centerY = height / 2;
          const radius = Math.min(width, height) * 0.34;
          const positions = stars.map((star, index) => {
            const point = stored.get(star.id);
            const z = point?.z ?? starDepth(star, width, height);
            if (point) return { x: point.x, y: point.y, z, star };
            const angle = (index / Math.max(1, stars.length)) * Math.PI * 2 - Math.PI / 2;
            const jitter = 0.82 + 0.18 * Math.sin(index * 1.7);
            return {
              x: centerX + Math.cos(angle) * radius * jitter,
              y: centerY + Math.sin(angle) * radius * jitter,
              z,
              star,
            };
          });
          const byId = new Map(positions.map((item) => [item.star.id, item]));
          const edgePairs = [];
          for (const edge of data?.edges || []) {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (from && to) edgePairs.push({ from, to });
          }
          const emptyText = stars.length
            ? ''
            : viewportLoading
              ? '正在加载附近星域…'
              : data?.viewport && Number(data?.total || 0) > 0
                ? '这附近没有星，拖动探索更远的星域。'
                : query.trim()
                  ? '没有找到相关记忆。'
                  : '这片星域还空着。去对话里让 AI 记住一件事。';
          const renderFrame = () => {
            const projected = glRenderer.draw(
              width,
              height,
              dpr,
              positions,
              edgePairs,
              0,
              0,
            );
            const displayPositions = projected || positions;
            positionsRef.current = displayPositions;
            drawLabels(
              labelRef.current,
              width,
              height,
              dpr,
              displayPositions,
              selectedId,
              hoveredIdRef.current,
              emptyText,
              data?.constellations || [],
            );
            applyPanTransform();
          };
          drawRef.current = renderFrame;
          renderFrame();
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
          const radiusStar = STAR_POINT_SIZE / 2;
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

      React.useEffect(() => {
        if (settings?.viewMode === '2d') return undefined;
        const heavy = (data?.stars?.length || 0) > 50000;
        const interval = heavy ? 50 : 33;
        let frame = 0;
        let lastDraw = 0;
        const tick = (time) => {
          const renderer = glRef.current.renderer;
          if (renderer?.kind === '3d') {
            renderer.tick(time);
            if (time - lastDraw > interval) {
              drawRef.current?.();
              lastDraw = time;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
      }, [settings?.viewMode, data?.stars?.length]);

      React.useEffect(() => {
        glRef.current.renderer?.setAutoRotate?.(autoRotate);
      }, [autoRotate, settings?.viewMode]);

      function applyPanTransform() {
        const transform = `translate3d(${pan2dRef.current.x}px, ${pan2dRef.current.y}px, 0)`;
        if (starLayerRef.current) starLayerRef.current.style.transform = transform;
      }

      React.useEffect(() => {
        applyPanTransform();
      }, [data, size]);

      React.useEffect(() => {
        pan2dRef.current = { x: 0, y: 0 };
        applyPanTransform();
      }, [activeId]);

      function handlePointerDown(event) {
        if (event.button !== 0) return;
        dragRef.current = {
          active: true,
          lastX: event.clientX,
          lastY: event.clientY,
          moved: 0,
        };
        pressedStarRef.current = event.target?.closest?.('[data-star-id]')?.dataset?.starId || null;
        if (settings?.viewMode !== '2d') {
          hoveredIdRef.current = null;
          setHovered(null);
        }
        event.currentTarget.focus?.();
        event.currentTarget.style.cursor = 'grabbing';
        document.body.classList.add('ms-dragging');
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }

      function updateHover(event) {
        if (settings?.viewMode === '2d') return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        let best = null;
        for (const item of positionsRef.current) {
          if (item.visible === false) continue;
          const distance = Math.hypot(item.x - x, item.y - y);
          if (distance <= 16 && (!best || distance < best.distance)) {
            best = { ...item, distance };
          }
        }
        if (best) {
          hoveredIdRef.current = best.star.id;
          setHovered({ star: best.star, x, y });
        } else {
          hoveredIdRef.current = null;
          setHovered(null);
        }
      }

      function handlePointerMove(event) {
        if (!dragRef.current.active) {
          updateHover(event);
          return;
        }
        const dx = event.clientX - dragRef.current.lastX;
        const dy = event.clientY - dragRef.current.lastY;
        dragRef.current.lastX = event.clientX;
        dragRef.current.lastY = event.clientY;
        dragRef.current.moved += Math.abs(dx) + Math.abs(dy);
        if (settings?.viewMode === '2d') {
          pan2dRef.current = {
            x: pan2dRef.current.x + dx,
            y: pan2dRef.current.y + dy,
          };
          applyPanTransform();
          if (!viewportTimerRef.current) {
            viewportTimerRef.current = window.setTimeout(() => {
              viewportTimerRef.current = 0;
              refreshViewport();
            }, 80);
          }
          return;
        }
        const renderer = glRef.current.renderer;
        if (renderer?.orbit) {
          renderer.orbit(dx, dy);
          drawRef.current?.();
        }
      }

      function handlePointerUp(event) {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        document.body.classList.remove('ms-dragging');
        const moved = dragRef.current.moved;
        const pressedStar = pressedStarRef.current;
        pressedStarRef.current = null;
        glRef.current.renderer?.endDrag?.();
        const layer = interactionRef.current;
        if (layer) layer.style.cursor = 'grab';
        try {
          layer?.releasePointerCapture?.(event.pointerId);
        } catch {
          // pointer capture may already be released
        }
        if (moved <= 6 && pressedStar) {
          suppressBackgroundClickRef.current = true;
          void selectStar(pressedStar);
        }
        if (settings?.viewMode === '2d' && moved > 24) {
          if (viewportTimerRef.current) {
            window.clearTimeout(viewportTimerRef.current);
            viewportTimerRef.current = 0;
          }
          window.setTimeout(() => refreshViewport(), 40);
        }
      }

      function handlePointerLeave() {
        hoveredIdRef.current = null;
        setHovered(null);
      }

      React.useEffect(() => {
        const onMove = (event) => handlePointerMove(event);
        const onUp = (event) => handlePointerUp(event);
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          document.body.classList.remove('ms-dragging');
          if (viewportTimerRef.current) {
            window.clearTimeout(viewportTimerRef.current);
            viewportTimerRef.current = 0;
          }
        };
      }, []);

      function handleDoubleClick(event) {
        if (settings?.viewMode === '2d') return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        let best = null;
        for (const item of positionsRef.current) {
          if (item.visible === false) continue;
          const distance = Math.hypot(item.x - x, item.y - y);
          if (distance <= 20 && (!best || distance < best.distance)) {
            best = { ...item, distance };
          }
        }
        if (!best) return;
        setSelectedId(best.star.id);
        setAutoRotate(false);
        glRef.current.renderer?.setAutoRotate?.(false);
        glRef.current.renderer?.focusItem?.(best, size.width, size.height);
        drawRef.current?.();
      }

      function focusSelected() {
        const item = positionsRef.current.find((entry) => entry.star.id === selected?.id);
        if (!item) return;
        setAutoRotate(false);
        glRef.current.renderer?.setAutoRotate?.(false);
        glRef.current.renderer?.focusItem?.(item, size.width, size.height);
        drawRef.current?.();
      }

      function handleKeyDown(event) {
        if (settings?.viewMode === '2d') return;
        const renderer = glRef.current.renderer;
        if (!renderer) return;
        const key = event.key;
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          event.preventDefault();
          renderer.orbit(key === 'ArrowLeft' ? -24 : 24, 0);
          renderer.endDrag?.();
          drawRef.current?.();
          return;
        }
        if (key === 'ArrowUp' || key === 'ArrowDown') {
          event.preventDefault();
          renderer.orbit(0, key === 'ArrowUp' ? -24 : 24);
          renderer.endDrag?.();
          drawRef.current?.();
          return;
        }
        if (key === '+' || key === '=') {
          event.preventDefault();
          renderer.zoom(-1);
          drawRef.current?.();
          return;
        }
        if (key === '-' || key === '_') {
          event.preventDefault();
          renderer.zoom(1);
          drawRef.current?.();
          return;
        }
        if (key === '0') {
          event.preventDefault();
          renderer.reset?.();
          setAutoRotate(true);
          drawRef.current?.();
          return;
        }
        if (key === ' ') {
          event.preventDefault();
          const next = !autoRotate;
          setAutoRotate(next);
          renderer.setAutoRotate?.(next);
          return;
        }
        if (key === 'f' || key === 'F') {
          event.preventDefault();
          focusSelected();
        }
      }

      function onCanvasClick(event) {
        if (suppressBackgroundClickRef.current) {
          suppressBackgroundClickRef.current = false;
          return;
        }
        if (dragRef.current.moved > 6) {
          dragRef.current.moved = 0;
          return;
        }
        if (event.target !== event.currentTarget && event.target !== starLayerRef.current) return;
        setSelectedId(null);
        setNebulaOpen(false);
      }

      async function selectStar(starId) {
        setSelectedId(starId);
        setNebulaOpen(false);
        try {
          const value = await api(`/stars/${encodeURIComponent(starId)}`);
          if (!value?.star) return;
          const bucket = loadedRef.current;
          const existing = bucket.stars.get(starId);
          if (!existing) return;
          bucket.stars.set(starId, {
            ...existing,
            ...value.star,
            viewportX: existing.viewportX,
            viewportY: existing.viewportY,
          });
          setData((previous) =>
            previous
              ? { ...previous, stars: [...bucket.stars.values()] }
              : previous,
          );
        } catch {
          // keep the compact star if detail fetch fails
        }
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
          void selectStar(star.id);
        }
      }

      const selected = (data?.stars || []).find((star) => star.id === selectedId) || null;
      const pending = (data?.stars || []).filter((star) => star.status === 'pending');
      const activeCount =
        data?.total ?? (data?.stars || []).filter((star) => star.status === 'active').length;
      const renderedStars = (data?.stars || [])
        .filter(
          (star) =>
            star.status === 'active' &&
            Number.isFinite(star.viewportX) &&
            Number.isFinite(star.viewportY),
        )
        .map((star) => ({
          star,
          weight: weightOf(star),
          x: size.width / 2 + star.viewportX,
          y: size.height / 2 + star.viewportY,
        }));
      const renderedById = new Map(renderedStars.map((item) => [item.star.id, item]));
      const renderedEdges = (data?.edges || [])
        .map((edge) => {
          const from = renderedById.get(edge.from);
          const to = renderedById.get(edge.to);
          return from && to ? { edge, from, to } : null;
        })
        .filter(Boolean);
      const renderedConstellations = (data?.constellations || [])
        .map((constellation) => {
          const points = (constellation.starIds || [])
            .map((id) => renderedById.get(id))
            .filter(Boolean);
          return points.length >= 3 ? { constellation, points } : null;
        })
        .filter(Boolean);
      const showLabels = renderedStars.length > 0 && renderedStars.length <= 120;
      const emptyViewportText = renderedStars.length
        ? ''
        : viewportLoading
          ? '正在加载附近星域…'
          : data?.viewport && Number(data?.total || 0) > 0
            ? '这附近没有星，拖动探索更远的星域。'
            : query.trim()
              ? '没有找到相关记忆。'
              : '这片星域还空着。去对话里让 AI 记住一件事。';
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
          setSettings(normalizeSettings(updated.settings || settings));
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
        transition: 'transform .18s ease, background .18s ease, box-shadow .18s ease',
        boxShadow:
          id === activeId ? '0 0 18px rgba(255,212,121,0.28)' : '0 0 0 rgba(0,0,0,0)',
      });

      return h(
        'div',
        {
          className: 'ms-shell',
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
          'style',
          null,
          `
.ms-nebula{position:absolute;inset:-12%;z-index:0;pointer-events:none;filter:blur(30px) saturate(1.35);opacity:.98;mix-blend-mode:screen;background:linear-gradient(118deg,transparent 30%,rgba(160,180,255,.1) 42%,rgba(118,92,230,.18) 50%,rgba(60,140,200,.1) 58%,transparent 72%),radial-gradient(ellipse at 72% 22%,var(--ms-nebula-1),transparent 52%),radial-gradient(ellipse at 18% 74%,var(--ms-nebula-2),transparent 50%),radial-gradient(ellipse at 54% 84%,var(--ms-nebula-3),transparent 46%),radial-gradient(circle at 42% 44%,rgba(220,230,255,.06),transparent 30%)}
.ms-nebula:before{content:"";position:absolute;inset:-30%;filter:blur(44px);opacity:.26;background:conic-gradient(from 0deg,transparent,var(--ms-nebula-1),transparent 30%,var(--ms-nebula-2),transparent 64%,var(--ms-nebula-3),transparent)}
.ms-nebula:after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.95) 0 1px,transparent 1.6px),radial-gradient(circle,rgba(170,210,255,.72) 0 1.2px,transparent 1.8px),radial-gradient(circle,rgba(255,220,170,.58) 0 1.4px,transparent 2px),radial-gradient(circle,rgba(200,180,255,.5) 0 1px,transparent 1.5px);background-size:67px 67px,109px 109px,173px 173px,251px 251px;background-position:0 0,37px 53px,94px 21px,141px 87px;opacity:.64;animation:ms-twinkle 9s ease-in-out infinite alternate}
.ms-vignette{position:absolute;inset:0;z-index:3;pointer-events:none;background:radial-gradient(circle at 50% 45%,transparent 38%,var(--ms-vignette) 100%)}
.ms-glass{backdrop-filter:blur(18px) saturate(1.12);-webkit-backdrop-filter:blur(18px) saturate(1.12)}
.ms-btn{transition:transform .18s ease,filter .18s ease,box-shadow .18s ease}
.ms-btn:hover{transform:translateY(-1px);filter:brightness(1.08);box-shadow:0 6px 18px rgba(0,0,0,.18)}
.ms-btn:active{transform:translateY(0) scale(.985)}
.ms-scroll{scrollbar-width:thin;scrollbar-color:var(--ms-border) transparent}
.ms-scroll::-webkit-scrollbar{width:6px;height:6px}
.ms-scroll::-webkit-scrollbar-thumb{background:var(--ms-border);border-radius:999px}
.ms-tooltip{animation:ms-fade .16s ease-out}
.ms-dragging, .ms-dragging *{cursor:grabbing !important}
.ms-shell button{border:1px solid var(--ms-border);background:var(--ms-subtle);color:var(--ms-text);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;transition:filter .18s ease,background .18s ease,box-shadow .18s ease}
.ms-shell button:hover{filter:brightness(1.08);box-shadow:0 4px 14px rgba(0,0,0,.14)}
.ms-shell button:disabled{opacity:.4;cursor:default;box-shadow:none}
.ms-shell button:focus-visible{outline:2px solid var(--ms-accent);outline-offset:2px}
.ms-shell input,.ms-shell select{background:var(--ms-subtle);color:var(--ms-text);border:1px solid var(--ms-border);border-radius:8px;padding:5px 8px;font:inherit;outline:none}
.ms-shell input:focus,.ms-shell select:focus{border-color:var(--ms-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ms-accent) 18%,transparent)}
.ms-shell ::selection{background:color-mix(in srgb,var(--ms-accent) 35%,transparent);color:var(--ms-text)}
@keyframes ms-drift{from{transform:translate3d(-2%,-1%,0) scale(1.04)}to{transform:translate3d(2%,1%,0) scale(1.12)}}
@keyframes ms-spin{to{transform:rotate(360deg)}}
@keyframes ms-twinkle{from{opacity:.32}to{opacity:.68}}
@keyframes ms-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
`,
        ),
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
              background: 'linear-gradient(180deg, var(--ms-subtle), transparent)',
              backdropFilter: 'blur(12px)',
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
              style: { ...tabStyle('__new'), background: 'rgba(127,216,255,0.16)', color: 'var(--ms-accent)' },
              onClick: () =>
                setDraft({ title: '', fact: '', reason: '', condition: '', type: 'fact', tags: '' }),
            },
            '＋ 星',
          ),
          h(
            'button',
            {
              type: 'button',
              style: { ...tabStyle('__newmap'), background: 'rgba(255,212,121,0.12)', color: 'var(--ms-warn)' },
              onClick: () => setMapDraft(''),
            },
            '＋ 图',
          ),
          h(
            'button',
            {
              type: 'button',
              style: { ...tabStyle('__constellations'), background: 'rgba(182,156,255,0.14)', color: 'var(--ms-violet)' },
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
                    color: 'var(--ms-accent)',
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
          { style: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#02030A', WebkitAppRegion: 'no-drag' } },
          h('div', { className: 'ms-nebula', 'aria-hidden': true }),
          h(
            'div',
            {
              ref: interactionRef,
              tabIndex: 0,
              onClick: onCanvasClick,
              onKeyDown: handleKeyDown,
              onPointerDownCapture: handlePointerDown,
              onPointerLeave: handlePointerLeave,
              onDoubleClick: handleDoubleClick,
              onDragStart: (event) => event.preventDefault(),
              style: {
                position: 'absolute',
                inset: 0,
                zIndex: 1,
                cursor: 'grab',
                outline: 'none',
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitAppRegion: 'no-drag',
              },
            },
            h(
              'div',
              {
                ref: starLayerRef,
                style: {
                  position: 'absolute',
                  inset: 0,
                  transform: 'translate3d(0, 0, 0)',
                  willChange: 'transform',
                },
              },
            h(
              'svg',
              {
                width: '100%',
                height: '100%',
                style: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' },
                'aria-hidden': true,
              },
              renderedConstellations.map(({ constellation, points }) =>
                h('polygon', {
                  key: `constellation-${constellation.id || points[0].star.id}`,
                  points: points.map((point) => `${point.x},${point.y}`).join(' '),
                  fill: 'none',
                  stroke: 'rgba(190,203,255,0.22)',
                  strokeWidth: 1,
                  strokeDasharray: '4 8',
                }),
              ),
              renderedEdges.map(({ edge, from, to }) =>
                h('line', {
                  key: edge.id || `${edge.from}-${edge.to}-${edge.relation}`,
                  x1: from.x,
                  y1: from.y,
                  x2: to.x,
                  y2: to.y,
                  stroke:
                    edge.relation === 'contradicts'
                      ? 'rgba(255,122,122,0.45)'
                      : 'rgba(174,196,255,0.28)',
                  strokeWidth: 1,
                  strokeDasharray: edge.relation === 'related' ? '3 7' : undefined,
                }),
              ),
            ),
            renderedStars.map(({ star, weight, x, y }) => {
              const color = TYPE_COLOR[star.type] || '#CFE3FF';
              const isSelected = selectedId === star.id;
              return h(
                'button',
                {
                  key: star.id,
                  type: 'button',
                  title: star.title,
                  draggable: false,
                  'data-star-id': star.id,
                  onClick: (event) => {
                    event.stopPropagation();
                    if (dragRef.current.moved > 6) {
                      dragRef.current.moved = 0;
                      return;
                    }
                    void selectStar(star.id);
                  },
                  style: {
                    position: 'absolute',
                    left: x,
                    top: y,
                    width: 32,
                    height: 32,
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    transform: 'translate(-50%, -50%)',
                    cursor: 'pointer',
                    opacity: 0.55 + weight * 0.45,
                    zIndex: isSelected ? 4 : 2,
                  },
                },
                h('span', {
                  'aria-hidden': true,
                  style: {
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${color}66 0%, ${color}22 34%, transparent 70%)`,
                  },
                }),
                h('span', {
                  'aria-hidden': true,
                  style: {
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 15,
                    height: 15,
                    transform: 'translate(-50%, -50%)',
                    background: color,
                    clipPath:
                      'polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%)',
                    boxShadow: `0 0 ${8 + weight * 10}px ${color}`,
                  },
                }),
                isSelected
                  ? h('span', {
                      'aria-hidden': true,
                      style: {
                        position: 'absolute',
                        inset: 2,
                        borderRadius: '50%',
                        border: `1px solid ${color}`,
                        boxShadow: `0 0 12px ${color}88`,
                      },
                    })
                  : null,
              );
            }),
            showLabels
              ? renderedStars.map(({ star, x, y }) =>
                  h(
                    'span',
                    {
                      key: `label-${star.id}`,
                      style: {
                        position: 'absolute',
                        left: x + 18,
                        top: y - 8,
                        fontSize: '11px',
                        color: 'rgba(235,240,255,0.82)',
                        textShadow: '0 1px 6px rgba(0,0,0,0.8)',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        display: 'inline-block',
                        maxWidth: 150,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    },
                    star.title,
                  ),
                )
              : null,
            ),
          ),
          emptyViewportText
            ? h(
                'div',
                {
                  style: {
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    zIndex: 3,
                    pointerEvents: 'none',
                    color: 'rgba(232,236,255,0.62)',
                    fontSize: '14px',
                    letterSpacing: '0.02em',
                  },
                },
                emptyViewportText,
              )
            : null,
          h('div', { className: 'ms-vignette', 'aria-hidden': true }),
          h(
            'div',
            {
              style: {
                position: 'absolute',
                top: '12px',
                left: '12px',
                fontSize: '10px',
                opacity: 0.45,
                pointerEvents: 'none',
                zIndex: 4,
              },
            },
            '拖动探索 · 中心密外圈疏 · 视口按需加载 · 星点固定 32px · 滚轮切图',
          ),
          settings?.viewMode !== '2d'
            ? h(
                'div',
                {
                  style: {
                    position: 'absolute',
                    left: '12px',
                    bottom: '12px',
                    display: 'flex',
                    gap: '6px',
                    zIndex: 4,
                  },
                },
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      const next = !autoRotate;
                      setAutoRotate(next);
                      glRef.current.renderer?.setAutoRotate?.(next);
                    },
                    style: {
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--ms-border)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      opacity: 0.86,
                    },
                  },
                  autoRotate ? '自动旋转：开' : '自动旋转：关',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      glRef.current.renderer?.reset?.();
                      setAutoRotate(true);
                      drawRef.current?.();
                    },
                    style: {
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--ms-border)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      opacity: 0.86,
                    },
                  },
                  '重置视角',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    disabled: !selected,
                    onClick: () => {
                      focusSelected();
                    },
                    style: {
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--ms-border)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '10px',
                      cursor: selected ? 'pointer' : 'default',
                      opacity: selected ? 0.86 : 0.35,
                    },
                  },
                  '聚焦选中',
                ),
              )
            : null,
          settings?.viewMode === '2d'
            ? h(
                'div',
                {
                  style: {
                    position: 'absolute',
                    left: '12px',
                    bottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    zIndex: 4,
                  },
                },
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      pan2dRef.current = { x: 0, y: 0 };
                      applyPanTransform();
                    },
                    style: {
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--ms-border)',
                      background: 'var(--ms-panel)',
                      color: 'var(--ms-text)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      opacity: 0.86,
                      WebkitAppRegion: 'no-drag',
                    },
                  },
                  '重置视图',
                ),
              )
            : null,
          hovered
            ? h(
                'div',
                {
                  className: 'ms-tooltip',
                  style: {
                    position: 'absolute',
                    left: Math.min(hovered.x + 14, Math.max(12, size.width - 230)),
                    top: Math.min(hovered.y + 14, Math.max(12, size.height - 76)),
                    width: '220px',
                    padding: '7px 9px',
                    borderRadius: '8px',
                    border: '1px solid var(--ms-border)',
                    background: 'var(--ms-panel)',
                    color: 'var(--ms-text)',
                    fontSize: '11px',
                    pointerEvents: 'none',
                    zIndex: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                  },
                },
                h('div', { style: { fontWeight: 600 } }, hovered.star.title),
                h(
                  'div',
                  { style: { opacity: 0.7, marginTop: '2px', wordBreak: 'break-word' } },
                  hovered.star.fact,
                ),
              )
            : null,
          mapToast
            ? h(
                'div',
                {
                  style: {
                    position: 'absolute',
                    top: '16px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 5,
                    padding: '4px 12px',
                    borderRadius: '999px',
                    background: 'var(--ms-panel-glass)',
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
                    color: 'var(--ms-warn)',
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
                  className: 'ms-glass ms-scroll',
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
                    background: 'var(--ms-panel-glass)',
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
                  className: 'ms-glass ms-scroll',
                  style: {
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '286px',
                    zIndex: 6,
                    maxHeight: 'calc(100% - 24px)',
                    overflow: 'auto',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid var(--ms-border)',
                    background: 'var(--ms-panel-glass)',
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
                  className: 'ms-glass ms-scroll',
                  style: {
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '320px',
                    zIndex: 6,
                    maxHeight: 'calc(100% - 24px)',
                    overflow: 'auto',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,212,121,0.28)',
                    background: 'var(--ms-panel-glass)',
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
                        { style: { color: 'var(--ms-warn)', marginTop: '6px' } },
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
                  className: 'ms-glass',
                  style: {
                    width: 'min(520px, 100%)',
                    padding: '24px',
                    borderRadius: '16px',
                    border: '1px solid var(--ms-border)',
                    background: 'var(--ms-panel-glass)',
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
                          color: 'var(--ms-accent)',
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
      const [settings, setSettings] = React.useState({ viewMode: '2d', theme: 'dark' });
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
            setSettings(normalizeSettings(value.settings));
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
        setSettings(normalizeSettings(next));
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
        { className: 'ms-shell', style: { padding: '20px 24px', maxWidth: '760px', minHeight: '100%', background: 'var(--ms-bg)', color: 'var(--ms-text)', colorScheme: settings?.theme === 'light' ? 'light' : 'dark' } },
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
          '视图',
          h(
            'span',
            { style: { fontSize: '12px', opacity: 0.7 } },
            '2D 平面散布',
          ),
        ),
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
                              ? 'var(--ms-warn)'
                              : label === '待确认' && value
                                ? 'var(--ms-accent)'
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
                    h('div', { key: index, style: { color: 'var(--ms-warn)', opacity: 0.8 } }, `→ ${text}`),
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

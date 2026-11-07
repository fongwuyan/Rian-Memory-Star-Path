import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const match = source.match(/const THEMES = \{([\s\S]*?)\n    \};/);
assert.ok(match, 'THEMES not found');
const themes = new Function(`return {${match[1]}}`)();

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

let failed = false;
for (const [name, theme] of Object.entries(themes)) {
  for (const background of ['bg', 'panel', 'panel2']) {
    for (const foreground of ['text', 'accent', 'warn', 'violet']) {
      const ratio = contrast(theme[foreground], theme[background]);
      const pass = ratio >= 4.5;
      if (!pass) failed = true;
      console.log(
        `${name} ${foreground}/${background} = ${ratio.toFixed(2)} ${pass ? 'PASS' : 'FAIL'}`,
      );
    }
  }
}
if (failed) {
  console.error('theme contrast below 4.5');
  process.exitCode = 1;
} else {
  console.log('THEME CONTRAST PASS');
}

'use client';

import * as THREE from 'three';
import { mulberry32 } from '@/lib/world';

const cache = new Map<string, THREE.Texture>();

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement, repeat = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}

/** 산길 흙 바닥 텍스처 */
export function trailTexture() {
  const key = 'trail';
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(512, 512);
  const rnd = mulberry32(9);
  ctx.fillStyle = '#6f5b42';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 0.5 + rnd() * 2.2;
    const shade = 90 + Math.floor(rnd() * 55);
    ctx.fillStyle = `rgba(${shade + 24}, ${shade + 8}, ${shade - 20}, ${0.18 + rnd() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 길 가장자리는 흙이 옅고, 가운데는 밟혀 어둡다
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, 'rgba(47, 55, 35, 0.55)');
  grad.addColorStop(0.18, 'rgba(80, 66, 45, 0.12)');
  grad.addColorStop(0.5, 'rgba(58, 45, 31, 0.22)');
  grad.addColorStop(0.82, 'rgba(80, 66, 45, 0.12)');
  grad.addColorStop(1, 'rgba(47, 55, 35, 0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  // 작은 자갈
  for (let i = 0; i < 130; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 1 + rnd() * 2.4;
    ctx.fillStyle = `rgba(${140 + rnd() * 40}, ${132 + rnd() * 30}, ${118 + rnd() * 24}, .55)`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = finish(canvas, 1);
  texture.repeat.set(1, 6);
  cache.set(key, texture);
  return texture;
}

/** 나무결 텍스처 */
export function woodTexture(base = '#6b4a32') {
  const key = `wood-${base}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(256, 256);
  const rnd = mulberry32(31);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 256;
    const width = 0.6 + rnd() * 3.2;
    ctx.strokeStyle = `rgba(30, 18, 10, ${0.05 + rnd() * 0.16})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let y = 0; y <= 256; y += 12) {
      const wobble = Math.sin(y * 0.04 + i) * 3 + Math.sin(y * 0.11) * 1.4;
      if (y === 0) ctx.moveTo(x + wobble, y);
      else ctx.lineTo(x + wobble, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    ctx.strokeStyle = 'rgba(35, 20, 12, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + rnd() * 4, 1.4 + rnd() * 2, rnd(), 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = finish(canvas, 1);
  cache.set(key, texture);
  return texture;
}

/** 돌 텍스처 */
export function stoneTexture() {
  const key = 'stone';
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(256, 256);
  const rnd = mulberry32(555);
  ctx.fillStyle = '#6d6a62';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 70 + Math.floor(rnd() * 70);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v - 4}, ${0.12 + rnd() * 0.25})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  const texture = finish(canvas, 1);
  cache.set(key, texture);
  return texture;
}

/** 체크무늬 담요 */
export function plaidTexture() {
  const key = 'plaid';
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(256, 256);
  ctx.fillStyle = '#a5624b';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(238, 216, 188, 0.5)';
  for (let i = 0; i < 256; i += 64) ctx.fillRect(i, 0, 18, 256);
  for (let i = 0; i < 256; i += 64) ctx.fillRect(0, i, 256, 18);
  ctx.fillStyle = 'rgba(60, 40, 30, 0.25)';
  for (let i = 32; i < 256; i += 64) ctx.fillRect(i, 0, 4, 256);
  for (let i = 32; i < 256; i += 64) ctx.fillRect(0, i, 256, 4);
  const texture = finish(canvas, 1);
  cache.set(key, texture);
  return texture;
}

/** 부드러운 원형 빛 (해/달/반딧불) */
export function glowTexture() {
  const key = 'glow';
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

/** 한글 텍스트를 그린 텍스처 (표지판) */
export function signTexture(
  lines: string[],
  options: {
    width?: number;
    height?: number;
    background?: string;
    color?: string;
    border?: string;
    font?: string;
  } = {},
) {
  const width = options.width ?? 512;
  const height = options.height ?? 256;
  const key = `sign-${lines.join('|')}-${width}-${height}-${options.background ?? ''}-${options.color ?? ''}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(width, height);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
    if (options.border) {
      ctx.strokeStyle = options.border;
      ctx.lineWidth = 10;
      ctx.strokeRect(6, 6, width - 12, height - 12);
    }
  } else {
    ctx.clearRect(0, 0, width, height);
  }
  ctx.fillStyle = options.color ?? '#f2e9d8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.floor((height / (lines.length + 0.7)) * 0.62);
  ctx.font = options.font ?? `600 ${fontSize}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  const lineHeight = height / (lines.length + 0.4);
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, lineHeight * (i + 0.75), width * 0.9);
  });
  const texture = finish(canvas, 1);
  texture.repeat.set(1, 1);
  cache.set(key, texture);
  return texture;
}

/** 나뭇잎/이끼 얼룩 텍스처 (지면 디테일) */
export function mossTexture() {
  const key = 'moss';
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(256, 256);
  const rnd = mulberry32(71);
  ctx.fillStyle = '#66754a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const g = 70 + rnd() * 60;
    ctx.fillStyle = `rgba(${g * 0.8}, ${g}, ${g * 0.55}, ${0.12 + rnd() * 0.35})`;
    ctx.beginPath();
    ctx.arc(rnd() * 256, rnd() * 256, 0.6 + rnd() * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = finish(canvas, 1);
  cache.set(key, texture);
  return texture;
}

/** 통나무 벽 (가로 줄무늬) */
export function logTexture() {
  const key = 'log-wall';
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(512, 512);
  const rnd = mulberry32(202);
  ctx.fillStyle = '#7a583c';
  ctx.fillRect(0, 0, 512, 512);
  const rows = 8;
  const rowHeight = 512 / rows;
  for (let row = 0; row < rows; row++) {
    const y = row * rowHeight;
    const grad = ctx.createLinearGradient(0, y, 0, y + rowHeight);
    grad.addColorStop(0, 'rgba(40, 25, 14, 0.55)');
    grad.addColorStop(0.18, 'rgba(120, 86, 56, 0.2)');
    grad.addColorStop(0.5, 'rgba(160, 118, 78, 0.16)');
    grad.addColorStop(0.85, 'rgba(90, 60, 38, 0.25)');
    grad.addColorStop(1, 'rgba(30, 18, 10, 0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 512, rowHeight);
    ctx.strokeStyle = 'rgba(32, 20, 11, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(512, y + 2);
    ctx.stroke();
    for (let i = 0; i < 30; i++) {
      const x = rnd() * 512;
      ctx.strokeStyle = `rgba(50, 32, 18, ${0.04 + rnd() * 0.12})`;
      ctx.lineWidth = 0.6 + rnd() * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.bezierCurveTo(x + 30, y + rowHeight * 0.3, x - 20, y + rowHeight * 0.7, x + 6, y + rowHeight - 4);
      ctx.stroke();
    }
    if (rnd() > 0.55) {
      const kx = rnd() * 512;
      const ky = y + rowHeight * (0.3 + rnd() * 0.4);
      ctx.strokeStyle = 'rgba(40, 24, 12, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(kx, ky, 5 + rnd() * 6, 3 + rnd() * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const texture = finish(canvas, 1);
  texture.repeat.set(1, 1);
  cache.set(key, texture);
  return texture;
}

/** 마루 바닥 (세로 판자) */
export function plankTexture() {
  const key = 'plank';
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(512, 512);
  const rnd = mulberry32(608);
  ctx.fillStyle = '#8a6746';
  ctx.fillRect(0, 0, 512, 512);
  const cols = 7;
  const w = 512 / cols;
  for (let c = 0; c < cols; c++) {
    const x = c * w;
    const shade = 0.85 + rnd() * 0.3;
    ctx.fillStyle = `rgba(${Math.floor(120 * shade)}, ${Math.floor(90 * shade)}, ${Math.floor(60 * shade)}, 0.5)`;
    ctx.fillRect(x, 0, w, 512);
    ctx.strokeStyle = 'rgba(35, 22, 12, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const gx = x + rnd() * w;
      ctx.strokeStyle = `rgba(48, 30, 16, ${0.05 + rnd() * 0.12})`;
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      for (let y = 0; y <= 512; y += 32) {
        ctx.lineTo(gx + Math.sin(y * 0.02 + i) * 2.5, y);
      }
      ctx.stroke();
    }
    const jointY = (rnd() * 512) | 0;
    ctx.strokeStyle = 'rgba(30, 18, 10, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, jointY);
    ctx.lineTo(x + w, jointY);
    ctx.stroke();
  }
  const texture = finish(canvas, 1);
  texture.repeat.set(2, 2);
  cache.set(key, texture);
  return texture;
}

/** 그루터기 나이테 */
export function stumpTexture() {
  const key = 'stump-rings';
  const cached = cache.get(key);
  if (cached) return cached;
  const { canvas, ctx } = canvas2d(256, 256);
  ctx.fillStyle = '#c2a274';
  ctx.fillRect(0, 0, 256, 256);
  for (let r = 120; r > 4; r -= 6 + Math.random() * 7) {
    ctx.strokeStyle = `rgba(94, 67, 42, ${0.25 + Math.random() * 0.35})`;
    ctx.lineWidth = 1 + Math.random() * 2.4;
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(70, 48, 30, 0.5)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 122, 0, Math.PI * 2);
  ctx.stroke();
  const texture = finish(canvas, 1);
  cache.set(key, texture);
  return texture;
}

export function disposeTextureCache() {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}

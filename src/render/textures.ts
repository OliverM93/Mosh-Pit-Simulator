import * as THREE from 'three';
import { Rng } from '../core/random';

/**
 * Procedurally painted, deliberately tiny textures (16–64 px) with nearest
 * filtering – the crunchy PS1 look without any external image assets.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, amount: number, alpha: number): void {
  for (let i = 0; i < w * h * amount; i++) {
    const v = rng.next() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng.next()})`;
    ctx.fillRect(Math.floor(rng.next() * w), Math.floor(rng.next() * h), 1, 1);
  }
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Light grey cloth grime, tinted per instance. */
export function clothTexture(): THREE.Texture {
  return cached('cloth', () => {
    const [c, ctx] = canvas(16, 16);
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, 16, 16);
    speckle(ctx, 16, 16, new Rng(7), 0.6, 0.25);
    return toTexture(c, true);
  });
}

/**
 * Face: the front of the head box maps the whole texture, all other faces
 * sample the plain skin pixel at (1,1).
 */
export function faceTexture(): THREE.Texture {
  return cached('face', () => {
    const [c, ctx] = canvas(16, 16);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#1a1210';
    ctx.fillRect(3, 6, 3, 2); // eyes
    ctx.fillRect(10, 6, 3, 2);
    ctx.fillStyle = '#3a2a24';
    ctx.fillRect(2, 4, 4, 1); // angry brows
    ctx.fillRect(10, 4, 4, 1);
    ctx.fillStyle = '#5a2020';
    ctx.fillRect(5, 11, 6, 2); // shouting mouth
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(7, 8, 2, 2); // nose shade
    return toTexture(c);
  });
}

/** Band-shirt front print for the player. */
export function shirtTexture(text: string, ink: string, base: string): THREE.Texture {
  return cached(`shirt:${text}:${ink}:${base}`, () => {
    const [c, ctx] = canvas(32, 32);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = ink;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 16, 13);
    ctx.fillRect(6, 17, 20, 2);
    ctx.font = 'bold 6px monospace';
    ctx.fillText('XXX', 16, 26);
    speckle(ctx, 32, 32, new Rng(3), 0.3, 0.2);
    return toTexture(c);
  });
}

export function concreteTexture(tint: string): THREE.Texture {
  return cached(`concrete:${tint}`, () => {
    const [c, ctx] = canvas(64, 64);
    const rng = new Rng(11);
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, 64, 64);
    speckle(ctx, 64, 64, rng, 0.9, 0.18);
    // Stains + cracks + tape marks.
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(20,12,8,${0.15 + rng.next() * 0.2})`;
      const x = rng.next() * 64;
      const y = rng.next() * 64;
      const r = 3 + rng.next() * 7;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, rng.next() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let x = rng.next() * 64;
      let y = rng.next() * 64;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) ctx.lineTo((x += rng.range(-8, 8)), (y += rng.range(-8, 8)));
      ctx.stroke();
    }
    return toTexture(c, true);
  });
}

export function brickTexture(tint: string): THREE.Texture {
  return cached(`brick:${tint}`, () => {
    const [c, ctx] = canvas(64, 64);
    const rng = new Rng(5);
    ctx.fillStyle = '#2a2220';
    ctx.fillRect(0, 0, 64, 64);
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 8 : 0;
      for (let col = -1; col < 4; col++) {
        const shade = 0.75 + rng.next() * 0.35;
        ctx.fillStyle = tint;
        ctx.globalAlpha = shade;
        ctx.fillRect(col * 16 + off + 1, row * 8 + 1, 14, 6);
      }
    }
    ctx.globalAlpha = 1;
    speckle(ctx, 64, 64, rng, 0.5, 0.25);
    return toTexture(c, true);
  });
}

export function woodTexture(): THREE.Texture {
  return cached('wood', () => {
    const [c, ctx] = canvas(32, 32);
    const rng = new Rng(9);
    for (let i = 0; i < 4; i++) {
      const v = 40 + Math.floor(rng.next() * 25);
      ctx.fillStyle = `rgb(${v + 20},${v + 8},${v - 5})`;
      ctx.fillRect(0, i * 8, 32, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, i * 8 + 7, 32, 1);
    }
    speckle(ctx, 32, 32, rng, 0.6, 0.3);
    return toTexture(c, true);
  });
}

export function ampTexture(brand: string): THREE.Texture {
  return cached(`amp:${brand}`, () => {
    const [c, ctx] = canvas(32, 32);
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#2b2b2b';
    for (let y = 8; y < 30; y += 2) for (let x = 2; x < 30; x += 2) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(0, 0, 32, 6);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 5px monospace';
    ctx.fillText(brand, 3, 5);
    return toTexture(c);
  });
}

export function posterTexture(text: string, seed: number): THREE.Texture {
  return cached(`poster:${text}`, () => {
    const [c, ctx] = canvas(32, 48);
    const rng = new Rng(seed);
    const bgs = ['#d8d0b8', '#e8e030', '#e84030', '#f0f0f0', '#30a0e0', '#f080c0'];
    ctx.fillStyle = rng.pick(bgs);
    ctx.fillRect(0, 0, 32, 48);
    ctx.fillStyle = '#111';
    ctx.fillRect(3, 14, 26, 18);
    ctx.fillStyle = rng.pick(bgs);
    ctx.fillRect(6, 17, 20, 12);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    // First word above the "photo", the rest below it.
    const [head = '', ...rest] = text.split(' ');
    ctx.fillText(head.slice(0, 8), 16, 9);
    ctx.fillText(rest.join(' ').slice(0, 8), 16, 41);
    ctx.font = 'bold 4px monospace';
    ctx.fillText('$5 ALL AGES', 16, 46);
    speckle(ctx, 32, 48, rng, 0.4, 0.3);
    return toTexture(c);
  });
}

export function softSpriteTexture(): THREE.Texture {
  return cached('soft', () => {
    const [c, ctx] = canvas(32, 32);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const t = toTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}

/** Vertical gradient for fake volumetric light cones (bright at the top). */
export function coneTexture(): THREE.Texture {
  return cached('cone', () => {
    const [c, ctx] = canvas(4, 32);
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 32);
    const t = toTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter;
    return t;
  });
}

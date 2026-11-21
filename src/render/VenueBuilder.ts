import * as THREE from 'three';
import { Rng } from '../core/random';
import type { VenueDefinition } from '../data/venueTypes';
import { basic, lambert } from './ps1';
import { ampTexture, brickTexture, concreteTexture, posterTexture, woodTexture } from './textures';

export interface VenueView {
  group: THREE.Group;
  /** Update the backdrop banner (band name). */
  setBanner(text: string): void;
  /** Show a band logo on the backdrop banner instead of text. */
  setBannerImage(img: HTMLImageElement): void;
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function bannerCanvas(text: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase().slice(0, 14), 64, 17);
  ctx.fillStyle = '#b01818';
  ctx.fillRect(8, 27, 112, 2);
  return c;
}

/**
 * Builds a venue from its definition: room shell, stage, backline, props and
 * posters. Static geometry only – lights live in StageLights.
 */
export function buildVenue(v: VenueDefinition): VenueView {
  const g = new THREE.Group();
  const { width: W, depth: D, height: H } = v.room;
  const rng = new Rng(v.crowd.seed + 1);

  // Floor.
  const floorTex = concreteTexture(hex(v.look.floorTint)).clone();
  floorTex.needsUpdate = true;
  floorTex.repeat.set(W / 3, D / 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 8, 8), lambert({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  // Walls (inward facing planes).
  const wallTex = brickTexture(hex(v.look.wallTint)).clone();
  wallTex.needsUpdate = true;
  wallTex.repeat.set(W / 2, H / 2);
  const wallMat = lambert({ map: wallTex });
  const walls: [number, number, number, number, number][] = [
    [0, H / 2, -D / 2, 0, W],
    [0, H / 2, D / 2, Math.PI, W],
    [-W / 2, H / 2, 0, Math.PI / 2, D],
    [W / 2, H / 2, 0, -Math.PI / 2, D],
  ];
  for (const [x, y, z, ry, len] of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H, 6, 2), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
  }

  // Ceiling + pipes.
  const ceilTex = concreteTexture('#3a3634').clone();
  ceilTex.needsUpdate = true;
  ceilTex.repeat.set(W / 4, D / 4);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 4, 4), lambert({ map: ceilTex }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  g.add(ceiling);
  const pipeMat = lambert({ color: 0x5a524a });
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, D, 6), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(-W / 2 + 1.2 + i * 0.35, H - 0.15, 0);
    g.add(pipe);
  }
  const duct = new THREE.Mesh(new THREE.BoxGeometry(W, 0.35, 0.5), lambert({ color: 0x6a6a70 }));
  duct.position.set(0, H - 0.2, D / 2 - 2);
  g.add(duct);

  // Stage.
  const st = v.stage;
  const stageTex = woodTexture().clone();
  stageTex.needsUpdate = true;
  stageTex.repeat.set(st.width / 1.5, st.depth / 1.5);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(st.width, st.height, st.depth), [
    lambert({ color: 0x1a1612 }),
    lambert({ color: 0x1a1612 }),
    lambert({ map: stageTex }),
    lambert({ color: 0x1a1612 }),
    lambert({ color: 0x241e18 }),
    lambert({ color: 0x1a1612 }),
  ]);
  const stageZ = -D / 2 + st.depth / 2;
  stage.position.set(0, st.height / 2, stageZ);
  g.add(stage);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(st.width, 0.02, 0.05), basic({ color: 0xd8c020 }));
  tape.position.set(0, st.height + 0.01, -D / 2 + st.depth - 0.03);
  g.add(tape);

  // Backdrop banner.
  const bannerTex = new THREE.CanvasTexture(bannerCanvas('MOSH PIT'));
  bannerTex.magFilter = THREE.NearestFilter;
  bannerTex.minFilter = THREE.NearestFilter;
  bannerTex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(st.width * 0.8, st.width * 0.2), lambert({ map: bannerTex }));
  banner.position.set(0, Math.min(H - 0.55, st.height + 1.9), -D / 2 + 0.02);
  g.add(banner);

  // Backline: amp stacks + drum kit + mic stand.
  const ampMat = [
    lambert({ color: 0x111111 }),
    lambert({ color: 0x111111 }),
    lambert({ color: 0x111111 }),
    lambert({ color: 0x111111 }),
    lambert({ map: ampTexture('MARSH') }),
    lambert({ color: 0x111111 }),
  ];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.4), ampMat);
      cab.position.set(side * (st.width / 2 - 0.6), st.height + 0.35 + k * 0.72, -D / 2 + 0.35);
      g.add(cab);
    }
  }
  const drumMat = lambert({ color: 0x8a1010 });
  const chrome = lambert({ color: 0xb8b8b0 });
  const brass = lambert({ color: 0xc8a040 });
  const drumZ = stageZ - st.depth * 0.25;
  const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 10), drumMat);
  kick.rotation.x = Math.PI / 2;
  kick.position.set(0, st.height + 0.28, drumZ + 0.55);
  g.add(kick);
  for (const [x, z, r] of [
    [-0.35, drumZ + 0.4, 0.15],
    [0.35, drumZ + 0.4, 0.17],
    [0.55, drumZ + 0.1, 0.2],
  ] as const) {
    const tom = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 8), drumMat);
    tom.position.set(x, st.height + 0.62, z);
    g.add(tom);
  }
  for (const [x, y, z] of [
    [-0.6, 1.25, drumZ + 0.3],
    [0.75, 1.3, drumZ + 0.35],
  ] as const) {
    const cym = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.015, 10), brass);
    cym.position.set(x, st.height + y, z);
    cym.rotation.z = x < 0 ? 0.2 : -0.2;
    g.add(cym);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, y, 4), chrome);
    stand.position.set(x, st.height + y / 2, z);
    g.add(stand);
  }
  const micZ = stageZ + st.depth * 0.3 + 0.45;
  const micStand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 4), chrome);
  micStand.position.set(0.15, st.height + 0.72, micZ);
  g.add(micStand);
  const wedgeMat = lambert({ color: 0x161616 });
  for (const x of [-1.6, 1.6]) {
    const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.4), wedgeMat);
    wedge.position.set(x, st.height + 0.15, -D / 2 + st.depth - 0.3);
    wedge.rotation.x = -0.4;
    g.add(wedge);
  }

  // Posters on the side and back walls.
  const posters = v.look.posters;
  for (let i = 0; i < posters.length; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), lambert({ map: posterTexture(posters[i]!, i * 17 + 3) }));
    const side = i % 3;
    const along = rng.range(-0.35, 0.35);
    const y = rng.range(1.3, Math.min(H - 0.6, 2.0));
    if (side === 0) {
      p.position.set(-W / 2 + 0.02, y, along * D);
      p.rotation.y = Math.PI / 2;
    } else if (side === 1) {
      p.position.set(W / 2 - 0.02, y, along * D);
      p.rotation.y = -Math.PI / 2;
    } else {
      p.position.set(along * W, y, D / 2 - 0.02);
      p.rotation.y = Math.PI;
    }
    p.rotation.z = rng.range(-0.08, 0.08);
    g.add(p);
  }

  // Merch table in the back corner + glowing exit sign.
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 0.7), lambert({ color: 0x3a2a1a }));
  table.position.set(W / 2 - 1.2, 0.375, D / 2 - 0.6);
  g.add(table);
  const shirtColors = [0x111111, 0xe8e8e8, 0x5c1a1a, 0x1b2448];
  shirtColors.forEach((c, i) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.4), lambert({ color: c }));
    s.position.set(W / 2 - 1.95 + i * 0.5, 1.4, D / 2 - 0.03);
    s.rotation.y = Math.PI;
    g.add(s);
  });
  const exit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.05), basic({ color: 0x20ff60 }));
  exit.position.set(-W / 2 + 1.5, H - 0.35, D / 2 - 0.04);
  g.add(exit);

  return {
    group: g,
    setBanner(text: string) {
      bannerTex.image = bannerCanvas(text);
      bannerTex.needsUpdate = true;
    },
    setBannerImage(img: HTMLImageElement) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(0, 0, 256, 64);
      const k = Math.min(240 / img.width, 56 / img.height);
      ctx.drawImage(img, 128 - (img.width * k) / 2, 32 - (img.height * k) / 2, img.width * k, img.height * k);
      bannerTex.image = c;
      bannerTex.needsUpdate = true;
    },
  };
}

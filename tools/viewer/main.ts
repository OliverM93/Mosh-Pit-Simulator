/**
 * Dev-only model viewer: `npm run dev` → http://localhost:5173/viewer.html?model=player&clip=spinkick (&t=0.4 freezes at phase t/1.2)
 * Shows a character GLB with its animations under concert-style lighting.
 */
import * as THREE from 'three';
import { CharacterLibrary, type SkinnedCharacter } from '../../src/render/characters';

const params = new URLSearchParams(location.search);
const model = params.get('model') ?? 'player';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15101a);
scene.fog = new THREE.Fog(0x15101a, 6, 14);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50);
const CAMS: Record<string, [number, number, number, number, number, number]> = {
  full: [1.6, 1.5, 3.6, 0, 0.95, 0],
  face: [0.25, 1.68, 0.75, 0, 1.6, 0],
  side: [3.4, 1.3, 0.4, 0, 0.95, 0],
};
const cam = CAMS[params.get('cam') ?? 'full'] ?? CAMS.full!;
camera.position.set(cam[0], cam[1], cam[2]);
camera.lookAt(cam[3], cam[4], cam[5]);

scene.add(new THREE.HemisphereLight(0x8a7aa8, 0x2a1a14, 0.9));
const key = new THREE.SpotLight(0xffe2c0, 60, 12, 0.6, 0.5, 1.2);
key.position.set(2, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0005;
scene.add(key, key.target);
const rim = new THREE.PointLight(0xff3040, 25, 8, 1.4);
rim.position.set(-2, 2.2, -1.5);
scene.add(rim);
const fill = new THREE.PointLight(0x4060ff, 8, 8, 1.4);
fill.position.set(-1.5, 1, 2.5);
scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const clock = new THREE.Clock();
const ui = document.getElementById('ui')!;
const lib = new CharacterLibrary();
let char: SkinnedCharacter | null = null;
let clipName = params.get('clip') ?? 'idle';
let time = 0;
const frozen = params.has('t');

lib.load('./models/').then(() => {
  char = lib.create(model);
  char.setShadows(true, true);
  scene.add(char.object);
  const names = ['idle', 'walk', 'run', 'two_step', 'forward_arms', 'side_arms', 'pick_up_change', 'crowd_push', 'spinkick', 'floorwork',
    'cartwheel', 'hop', 'tornado_kick', 'butterfly_kick', 'bail', 'cheer', 'headbang', 'bob', 'fist_pump', 'arms_crossed', 'band_drums'];
  for (const name of names) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => {
      clipName = name;
      time = 0;
    };
    ui.appendChild(b);
  }
  if (frozen) time = Number(params.get('t'));
  (window as unknown as { viewerReady: boolean }).viewerReady = true;
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (char) {
    if (!frozen) time += dt;
    char.play(clipName, clipName, 0.2);
    char.setPhase(time / 1.2, true);
    char.update(dt);
  }
  renderer.render(scene, camera);
});

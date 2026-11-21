/**
 * Dev-only model viewer: `npm run dev` → http://localhost:5173/viewer.html?model=proto&clip=spinkick
 * Shows a character GLB with its animations under concert-style lighting.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const params = new URLSearchParams(location.search);
const model = params.get('model') ?? 'proto';

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
camera.position.set(1.6, 1.5, 3.6);
camera.lookAt(0, 0.95, 0);

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
let mixer: THREE.AnimationMixer | null = null;
const ui = document.getElementById('ui')!;

new GLTFLoader().load(`./models/${model}.glb`, (gltf) => {
  const root = gltf.scene;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(root);
  mixer = new THREE.AnimationMixer(root);
  const actions = new Map(gltf.animations.map((c) => [c.name, mixer!.clipAction(c)]));
  const play = (name: string) => {
    mixer!.stopAllAction();
    actions.get(name)?.reset().play();
  };
  for (const name of actions.keys()) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => play(name);
    ui.appendChild(b);
  }
  const first = params.get('clip') ?? gltf.animations[0]?.name;
  if (first) play(first);
  const t = Number(params.get('t'));
  if (!Number.isNaN(t) && params.has('t')) {
    mixer.update(t);
    mixer.timeScale = 0;
  }
  (window as unknown as { viewerReady: boolean }).viewerReady = true;
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  mixer?.update(clock.getDelta());
  renderer.render(scene, camera);
});

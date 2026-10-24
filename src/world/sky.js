// Sky dome gradient, fog, sun + hemisphere light, drifting blocky clouds.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C } from './builder.js';

const SUN_DIR = new THREE.Vector3(45, 80, 30).normalize();
const SUN_OFFSET = new THREE.Vector3(45, 80, 30);

export function buildSky(world) {
  const { scene } = world.game;
  const horizon = new THREE.Color(C.horizon), top = new THREE.Color(C.skyTop);
  scene.background = horizon.clone();
  scene.fog = new THREE.Fog(horizon.clone(), 150, 340);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(470, 24, 12), new THREE.ShaderMaterial({
    uniforms: { top: { value: top }, horizon: { value: horizon }, exponent: { value: 0.65 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform float exponent; varying vec3 vW;
      void main(){ float h = normalize(vW).y; float f = pow(max(h, 0.0), exponent); gl_FragColor = vec4(mix(horizon, top, f), 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  dome.frustumCulled = false; dome.renderOrder = -10;
  world.group.add(dome);

  // sun disc, purely decorative
  const disc = new THREE.Mesh(new THREE.SphereGeometry(16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
  disc.position.copy(SUN_DIR).multiplyScalar(430);
  world.group.add(disc);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.copy(SUN_OFFSET); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -65; sc.right = 65; sc.top = 65; sc.bottom = -65; sc.near = 1; sc.far = 230;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  world.group.add(sun, sun.target);
  world.group.add(new THREE.HemisphereLight(0xcfe8ff, 0x5aa14a, 0.85));

  // clouds: one merged blocky cloud, instanced and drifting east
  const parts = [];
  const cb = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  cb(14, 4, 8, 0, 0, 0); cb(8, 5, 6, -7, 0.5, 1); cb(7, 4.5, 6, 7, 0.8, -1); cb(6, 3, 5, 2, 2.6, 0); cb(5, 2.5, 4, -3, 2.8, 1); cb(9, 2.5, 5, 1, -1.2, 2);
  const cloudGeo = mergeGeometries(parts, false);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x6d7f8c, emissiveIntensity: 0.35 });
  const N = 18, clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, N);
  clouds.frustumCulled = false;
  const rng = world.rng, cd = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    cd.push({ x: rng.range(-300, 300), y: rng.range(55, 95), z: rng.range(-300, 300), sc: rng.range(0.9, 2.1), ry: rng.range(0, Math.PI * 2), v: rng.range(1.0, 2.4) });
  }
  const placeClouds = () => {
    for (let i = 0; i < N; i++) {
      const c = cd[i]; q.setFromAxisAngle(_up, c.ry); s.set(c.sc, c.sc * 0.8, c.sc); p.set(c.x, c.y, c.z);
      clouds.setMatrixAt(i, m.compose(p, q, s));
    }
    clouds.instanceMatrix.needsUpdate = true;
  };
  placeClouds();
  world.group.add(clouds);

  world.animated.push((dt) => {
    for (const c of cd) { c.x += c.v * dt; if (c.x > 320) c.x = -320; }
    placeClouds();
    const pl = world.game.player?.position;
    if (pl) { sun.target.position.set(pl.x, 0, pl.z); sun.position.set(pl.x + SUN_OFFSET.x, SUN_OFFSET.y, pl.z + SUN_OFFSET.z); }
  });
  return sun;
}
const _up = new THREE.Vector3(0, 1, 0);

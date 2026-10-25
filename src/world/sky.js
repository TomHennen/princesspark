// Sky dome gradient, fog, sun + hemisphere light, drifting blocky clouds — and the weather system:
// 'sunny' | 'cloudy' | 'rain' | 'storm' | 'sunset' | 'night'. Everything is pre-allocated; switching weather
// only retunes colors/intensities and toggles visibility, so it is cheap to do at runtime.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C } from './builder.js';

export const WEATHERS = ['sunny', 'cloudy', 'rain', 'storm', 'sunset', 'night'];

// sunPos is the sun's offset from the player (the light follows the player so the shadow map stays tight).
const PRESETS = {
  sunny:  { top: C.skyTop, horizon: C.horizon, fog: [150, 340], sun: [0xfff1d6, 2.6], sunPos: [45, 80, 30], hemi: [0xcfe8ff, 0x5aa14a, 0.85], cloud: { color: 0xffffff, em: 0.35, scale: 1.0, dy: 0, count: 18 }, disc: [0xfff6c8, 16], rain: 0, lamps: 1.3, exposure: 1.05 },
  cloudy: { top: 0x8fa6b8, horizon: 0xd5dde3, fog: [110, 300], sun: [0xe8edf2, 1.3], sunPos: [45, 80, 30], hemi: [0xb9c6d0, 0x5a7a4a, 0.95], cloud: { color: 0xe3e8ec, em: 0.18, scale: 1.8, dy: -8, count: 36 }, disc: null, rain: 0, lamps: 1.5, exposure: 1.0 },
  rain:   { top: 0x5f7383, horizon: 0xa9b6bf, fog: [45, 220], sun: [0xcfd8e0, 0.9], sunPos: [45, 80, 30], hemi: [0x9fb0bd, 0x4a6a3e, 0.85], cloud: { color: 0x9aa6ae, em: 0.08, scale: 2.0, dy: -14, count: 36 }, disc: null, rain: 1, lamps: 2.0, exposure: 0.95 },
  storm:  { top: 0x2f3a46, horizon: 0x5c6872, fog: [30, 170], sun: [0xaab4bc, 0.8], sunPos: [45, 80, 30], hemi: [0x7f8d98, 0x3d523a, 1.0], cloud: { color: 0x59646d, em: 0.05, scale: 2.2, dy: -18, count: 36 }, disc: null, rain: 1.6, lightning: true, lamps: 2.6, exposure: 0.95 },
  sunset: { top: 0x5a3f8f, horizon: 0xffb27a, fog: [140, 330], sun: [0xffb070, 2.0], sunPos: [90, 18, 30], hemi: [0xffc4a0, 0x6a4f3a, 0.7], cloud: { color: 0xffc9b0, em: 0.4, scale: 1.0, dy: 0, count: 18 }, disc: [0xffa860, 22], rain: 0, lamps: 2.2, exposure: 1.05 },
  night:  { top: 0x071430, horizon: 0x1a2a55, fog: [90, 280], sun: [0x9fb6ff, 1.05], sunPos: [-40, 70, -30], hemi: [0x4a66a8, 0x2a3f33, 1.15], cloud: { color: 0x3a4766, em: 0.1, scale: 1.0, dy: 0, count: 12 }, disc: [0xf2f4ff, 10], rain: 0, stars: true, lamps: 3.4, exposure: 0.95 },
};

export function buildSky(world) {
  const { scene, renderer } = world.game;
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

  // sun (or moon) disc, purely decorative
  const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
  world.group.add(disc);

  const sunOffset = new THREE.Vector3(45, 80, 30);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.copy(sunOffset); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -65; sc.right = 65; sc.top = 65; sc.bottom = -65; sc.near = 1; sc.far = 230;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  world.group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5aa14a, 0.85);
  world.group.add(hemi);

  // stars: a fixed point cloud on the upper dome, only visible at night
  const starPos = new Float32Array(700 * 3), rng = world.rng;
  for (let i = 0; i < 700; i++) {
    const a = rng.range(0, Math.PI * 2), e = Math.asin(rng.range(0.08, 1)), r = 455;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r; starPos[i * 3 + 1] = Math.sin(e) * r; starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
  stars.frustumCulled = false; stars.visible = false; stars.name = 'stars';
  world.group.add(stars);

  // clouds: one merged blocky cloud, instanced and drifting east (36 slots; sunny days only show 18)
  const parts = [];
  const cb = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  cb(14, 4, 8, 0, 0, 0); cb(8, 5, 6, -7, 0.5, 1); cb(7, 4.5, 6, 7, 0.8, -1); cb(6, 3, 5, 2, 2.6, 0); cb(5, 2.5, 4, -3, 2.8, 1); cb(9, 2.5, 5, 1, -1.2, 2);
  const cloudGeo = mergeGeometries(parts, false);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x6d7f8c, emissiveIntensity: 0.35 });
  const N = 36, clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, N);
  clouds.frustumCulled = false;
  const cd = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    cd.push({ x: rng.range(-300, 300), y: rng.range(55, 95), z: rng.range(-300, 300), sc: rng.range(0.9, 2.1), ry: rng.range(0, Math.PI * 2), v: rng.range(1.0, 2.4) });
  }
  const cloudState = { scale: 1, dy: 0, count: 18 };
  const placeClouds = () => {
    for (let i = 0; i < N; i++) {
      const c = cd[i]; q.setFromAxisAngle(_up, c.ry);
      const k = i < cloudState.count ? c.sc * cloudState.scale : 0;
      s.set(k, k * 0.8, k); p.set(c.x, c.y + cloudState.dy, c.z);
      clouds.setMatrixAt(i, m.compose(p, q, s));
    }
    clouds.instanceMatrix.needsUpdate = true;
  };
  placeClouds();
  world.group.add(clouds);

  // rain: short vertical streaks in a box that rides along with the camera (world-stable: camera motion is subtracted)
  const RN = 900, RW = 36, RH = 26, rainPos = new Float32Array(RN * 6);
  for (let i = 0; i < RN; i++) {
    const x = rng.range(-RW / 2, RW / 2), y = rng.range(-6, RH), z = rng.range(-RW / 2, RW / 2);
    rainPos.set([x, y, z, x, y - 0.9, z], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe3f5, transparent: true, opacity: 0.45 }));
  rain.frustumCulled = false; rain.visible = false; rain.name = 'rain';
  world.group.add(rain);
  const lastCam = new THREE.Vector3(), camDelta = new THREE.Vector3();

  const sky = {
    sun, hemi, dome, disc, clouds, stars, rain,
    name: 'sunny', preset: PRESETS.sunny, rainRate: 0,
    flash: 0, nextBolt: 0, thunderIn: -1,
    setWeather(name) {
      const pr = PRESETS[name] || PRESETS.sunny; name = PRESETS[name] ? name : 'sunny';
      sky.name = name; sky.preset = pr;
      dome.material.uniforms.top.value.set(pr.top); dome.material.uniforms.horizon.value.set(pr.horizon);
      scene.background.set(pr.horizon); scene.fog.color.set(pr.horizon); scene.fog.near = pr.fog[0]; scene.fog.far = pr.fog[1];
      sun.color.set(pr.sun[0]); sun.intensity = pr.sun[1]; sunOffset.set(pr.sunPos[0], pr.sunPos[1], pr.sunPos[2]);
      hemi.color.set(pr.hemi[0]); hemi.groundColor.set(pr.hemi[1]); hemi.intensity = pr.hemi[2];
      cloudMat.color.set(pr.cloud.color); cloudMat.emissiveIntensity = pr.cloud.em;
      cloudState.scale = pr.cloud.scale; cloudState.dy = pr.cloud.dy; cloudState.count = pr.cloud.count; placeClouds();
      disc.visible = !!pr.disc;
      if (pr.disc) { disc.material.color.set(pr.disc[0]); disc.scale.setScalar(pr.disc[1]); disc.position.copy(sunOffset).normalize().multiplyScalar(430); }
      stars.visible = !!pr.stars;
      sky.rainRate = pr.rain; rain.visible = pr.rain > 0; rain.material.opacity = pr.rain > 1 ? 0.6 : 0.45;
      sky.flash = 0; sky.nextBolt = 2 + rng() * 5; sky.thunderIn = -1;
      if (renderer) renderer.toneMappingExposure = pr.exposure;
      // lamp posts glow brighter as it gets darker (props.js registers the glass material)
      if (world.lampGlowMat) { world.lampGlowMat.emissiveIntensity = pr.lamps; world.lampGlowMat.emissive.set(name === 'night' ? 0xffd166 : 0xffc947); }
      return name;
    },
  };

  world.animated.push((dt, t) => {
    for (const c of cd) { c.x += c.v * dt; if (c.x > 320) c.x = -320; }
    placeClouds();
    const pl = world.game.player?.position;
    if (pl) { sun.target.position.set(pl.x, 0, pl.z); sun.position.set(pl.x + sunOffset.x, sunOffset.y, pl.z + sunOffset.z); }
    const cam = world.game.camera;
    if (sky.rainRate > 0 && cam) {
      camDelta.copy(cam.position).sub(lastCam); if (camDelta.lengthSq() > 400) camDelta.set(0, 0, 0);
      lastCam.copy(cam.position);
      rain.position.copy(cam.position);
      const a = rainPos, fall = (18 + 10 * sky.rainRate) * dt, hw = RW / 2;
      for (let i = 0; i < a.length; i += 6) {
        let x = a[i] - camDelta.x, y = a[i + 1] - fall, z = a[i + 2] - camDelta.z;
        if (y < -6) y += RH + 6;
        if (x < -hw) x += RW; else if (x > hw) x -= RW;
        if (z < -hw) z += RW; else if (z > hw) z -= RW;
        a[i] = x; a[i + 1] = y; a[i + 2] = z; a[i + 3] = x; a[i + 4] = y - 0.9; a[i + 5] = z;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    if (sky.preset.lightning) {
      sky.nextBolt -= dt;
      if (sky.nextBolt <= 0) { sky.flash = 0.18; sky.nextBolt = 5 + rng() * 9; sky.thunderIn = 0.5 + rng() * 1.5; }
      if (sky.thunderIn >= 0) { sky.thunderIn -= dt; if (sky.thunderIn < 0) { world.game.audio?.play?.('thunder'); sky.thunderIn = -1; } }
      if (sky.flash > 0) {
        sky.flash -= dt;
        const k = sky.flash > 0 ? Math.min(1, sky.flash / 0.12) : 0;   // short bright pop that fades
        hemi.intensity = sky.preset.hemi[2] + 3.2 * k; sun.intensity = sky.preset.sun[1] + 2.5 * k;
        scene.background.set(sky.preset.horizon).lerp(_white, k * 0.7); scene.fog.color.copy(scene.background);
      }
    }
  });
  return sky;
}
const _up = new THREE.Vector3(0, 1, 0), _white = new THREE.Color(0xf4f8ff);

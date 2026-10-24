// Third-person player controller: walking, jumping, camera orbit, boarding rides.
import * as THREE from 'three';
import { buildAvatar } from './avatar.js';

const WALK = 6.5, RUN = 11, JUMP = 9, GRAVITY = -26, RADIUS = 0.45;
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _look = new THREE.Vector3();
const _box = new THREE.Box3(), _center = new THREE.Vector3(), _size = new THREE.Vector3(RADIUS * 2, 2, RADIUS * 2);

export class Player {
  constructor(game, config) {
    this.game = game;
    this.avatar = buildAvatar(config);
    this.group = this.avatar.group;
    this.position = this.group.position;
    this.velocity = new THREE.Vector3();
    this.onGround = true;
    this.facing = 0;            // yaw of the avatar
    this.cam = { yaw: Math.PI, pitch: 0.35, dist: 9 };
    this.ride = null;           // Ride currently riding
    this.state = 'walk';        // 'walk' | 'riding'
    this.animTime = 0;
    this.frozen = false;        // true during dialogue / menus
    this.nearest = null;        // nearest interactable in range
    this.distanceWalked = 0;
    // 'follow': the camera swings around behind you as you walk (default). 'free': only drag moves it.
    this.cameraMode = (() => { try { return localStorage.getItem('pk:cam') || 'follow'; } catch { return 'follow'; } })();
    this.lastDragTime = -10;
    this.fling = null;           // { vel: Vector3, spin } while being thrown through the air
    this.outfitOverride = null;  // e.g. 'swimsuit' inside the water park; saved config is untouched
    this.setupLook(game.renderer.domElement);
  }

  get config() { return this.avatar.config; }

  setupLook(canvas) {
    let dragging = false, last = null, lastTouch = null, touchId = null;
    canvas.addEventListener('mousedown', (e) => { dragging = true; last = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.game.input.addLook((e.clientX - last.x) * 1.3, (e.clientY - last.y) * 1.3);
      last = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', (e) => { this.cam.dist = THREE.MathUtils.clamp(this.cam.dist + e.deltaY * 0.01, 4, 13); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // keyboard zoom as a fallback for trackpads: - / = (also numpad)
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyV' && !this.frozen) { this.setCameraMode(this.cameraMode === 'follow' ? 'free' : 'follow'); this.game.ui?.toast?.(this.cameraMode === 'follow' ? 'Camera: follows you (V to change)' : 'Camera: free (drag to look, V to change)'); }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.cam.dist = Math.min(13, this.cam.dist + 1);
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.cam.dist = Math.max(4, this.cam.dist - 1);
    });
    // touch look: any touch that starts on the right 55% of the screen that isn't a UI element; two fingers pinch to zoom
    let pinchDist = null;
    const pinch = (e) => { if (e.touches.length < 2) return null; const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); };
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (touchId === null && t.clientX > window.innerWidth * 0.45) { touchId = t.identifier; lastTouch = { x: t.clientX, y: t.clientY }; }
      }
      pinchDist = pinch(e);
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      const pd = pinch(e);
      if (pd !== null && pinchDist !== null) { this.cam.dist = THREE.MathUtils.clamp(this.cam.dist - (pd - pinchDist) * 0.03, 4, 13); pinchDist = pd; return; }
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) { this.game.input.addLook((t.clientX - lastTouch.x) * 1.5, (t.clientY - lastTouch.y) * 1.5); lastTouch = { x: t.clientX, y: t.clientY }; }
      }
    }, { passive: true });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === touchId) touchId = null; if (e.touches.length < 2) pinchDist = null; };
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  }

  setCameraMode(mode) { this.cameraMode = mode; try { localStorage.setItem('pk:cam', mode); } catch {} }
  setOutfitOverride(outfit) {
    if (this.outfitOverride === outfit) return;
    this.outfitOverride = outfit;
    const saved = this.avatar.config.outfit;
    this.avatar.setConfig({ outfit: outfit || this._savedOutfit || saved });
    if (outfit) this._savedOutfit = this._savedOutfit || saved; else this._savedOutfit = null;
    this.game.events.emit('player:outfit', { outfit: this.avatar.config.outfit, override: !!outfit });
  }
  /** Throw the player through the air (used by silly ride endings). vel is world-space m/s. */
  launch(vel, spin = 6) {
    if (this.state === 'riding') this.exitRide(false);
    this.fling = { vel: vel.clone(), spin };
    this.velocity.y = vel.y; this.onGround = false; this.frozen = false;
    this.game.audio?.play('whoosh');
  }

  teleport(x, y, z, facing) {
    this.position.set(x, y, z); this.velocity.set(0, 0, 0);
    if (facing !== undefined) { this.facing = facing; this.cam.yaw = facing + Math.PI; }
  }

  update(dt) {
    const { input, camera, world } = this.game;
    this.animTime += dt;
    // camera orbit from look delta
    if (!this.frozen && (input.lookDelta.x || input.lookDelta.y)) {
      this.cam.yaw -= input.lookDelta.x * 0.005;
      this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + input.lookDelta.y * 0.004, -0.2, 1.2);
      this.lastDragTime = this.animTime;
    }
    if (this.state === 'riding') return this.updateRiding(dt);
    if (this.fling) return this.updateFling(dt);

    // --- movement ---
    const mv = this.frozen ? { x: 0, y: 0 } : input.move;
    const moving = Math.hypot(mv.x, mv.y) > 0.05;
    // follow camera: ease around behind the player while walking, unless the player dragged recently
    if (this.cameraMode === 'follow' && moving && this.animTime - this.lastDragTime > 1.2) {
      const want = this.facing + Math.PI;
      let d = want - this.cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      // only chase when walking roughly forward/sideways (ignore walking straight at the camera)
      if (Math.abs(d) < 2.4) this.cam.yaw += d * Math.min(1, dt * 2.2);
    }
    const speed = input.boost ? RUN : WALK;
    // camera-relative direction (camera looks along -yaw)
    const fwdX = -Math.sin(this.cam.yaw), fwdZ = -Math.cos(this.cam.yaw);
    const rightX = -fwdZ, rightZ = fwdX;
    let dx = (fwdX * mv.y + rightX * mv.x) * speed, dz = (fwdZ * mv.y + rightZ * mv.x) * speed;
    if (moving) {
      const target = Math.atan2(dx, dz);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 14);
    }
    // gravity & jump
    this.velocity.y += GRAVITY * dt;
    if (this.onGround && !this.frozen && input.jump && this.jumpCooldown <= 0) { this.velocity.y = JUMP; this.onGround = false; this.jumpCooldown = 0.25; this.game.audio?.play('jump'); }
    this.jumpCooldown = (this.jumpCooldown || 0) - dt;
    // integrate XZ with collision
    const nx = this.position.x + dx * dt, nz = this.position.z + dz * dt;
    const resolved = this.resolveXZ(nx, nz, world);
    if (moving) this.distanceWalked += Math.hypot(resolved.x - this.position.x, resolved.z - this.position.z);
    this.position.x = resolved.x; this.position.z = resolved.z;
    // Y / ground
    this.position.y += this.velocity.y * dt;
    const ground = world.getGroundHeight(this.position.x, this.position.z, this.position.y);
    if (this.position.y <= ground) { this.position.y = ground; this.velocity.y = 0; this.onGround = true; } else if (this.velocity.y < -1) this.onGround = false;
    // bounds
    const b = world.bounds;
    this.position.x = THREE.MathUtils.clamp(this.position.x, b.min.x, b.max.x);
    this.position.z = THREE.MathUtils.clamp(this.position.z, b.min.z, b.max.z);
    // anim
    this.group.rotation.y = this.facing;
    const anim = !this.onGround ? 'jump' : moving ? (input.boost ? 'run' : 'walk') : 'idle';
    this.avatar.setAnim(anim, this.animTime, input.boost ? 1.4 : 1);

    // --- camera ---
    const target = _v.set(this.position.x, this.position.y + 1.7, this.position.z);
    _dir.set(Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch), Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch));
    const dist = this.occludedDistance(target, _dir, this.cam.dist, world);
    const cx = target.x + _dir.x * dist, cy = target.y + _dir.y * dist, cz = target.z + _dir.z * dist;
    const minY = world.getGroundHeight(cx, cz, cy) + 0.6;
    camera.position.lerp(_p.set(cx, Math.max(cy, minY), cz), Math.min(1, dt * 12));
    camera.lookAt(target);
  }

  // Pull the camera in when a solid collider (or a world-declared camera blocker) sits between it and the player.
  occludedDistance(origin, dir, want, world) {
    _ray.set(origin, dir);
    let best = want;
    const lists = [world.colliders, world.cameraBlockers || []];
    for (const list of lists) for (const box of list) {
      if (box.containsPoint(origin)) continue;
      const hit = _ray.intersectBox(box, _hit);
      if (hit) { const d = hit.distanceTo(origin) - 0.4; if (d < best) best = d; }
    }
    return Math.max(2, best);
  }

  resolveXZ(nx, nz, world) {
    let x = nx, z = nz;
    const feetY = this.position.y;
    for (const box of world.colliders) {
      // skip boxes we're standing on top of or fully below
      if (feetY >= box.max.y - 0.05 || feetY + 1.8 <= box.min.y) continue;
      const cx = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
      const ddx = x - cx, ddz = z - cz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 < 1e-6) {
          // inside the box: push out along the smallest axis
          const toMinX = x - box.min.x, toMaxX = box.max.x - x, toMinZ = z - box.min.z, toMaxZ = box.max.z - z;
          const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (m === toMinX) x = box.min.x - RADIUS; else if (m === toMaxX) x = box.max.x + RADIUS; else if (m === toMinZ) z = box.min.z - RADIUS; else z = box.max.z + RADIUS;
        } else {
          const d = Math.sqrt(d2), push = (RADIUS - d) / d;
          x += ddx * push; z += ddz * push;
        }
      }
    }
    return { x, z };
  }

  // ---------- rides ----------
  boardRide(ride) {
    if (this.state === 'riding') return;
    this.ride = ride; this.state = 'riding';
    this.cam.yaw = Math.PI; // start the orbit camera directly behind the seat
    ride.board(this);
    this.game.events.emit('ride:board', { ride: ride.id, name: ride.name });
    this.game.audio?.play('board');
  }
  exitRide(completed = false) {
    const ride = this.ride; if (!ride) return;
    ride.unboard(this);
    this.ride = null; this.state = 'walk';
    const e = ride.exitPosition;
    this.teleport(e.x, this.game.world.getGroundHeight(e.x, e.z, e.y + 1), e.z);
    this.group.quaternion.set(0, 0, 0, 1);
    this.group.rotation.set(0, this.facing, 0);
    this.game.events.emit(completed ? 'ride:complete' : 'ride:exit', { ride: ride.id, name: ride.name, time: ride.rideTime });
  }
  updateFling(dt) {
    const { world, camera } = this.game, f = this.fling;
    this.velocity.y += GRAVITY * dt;
    this.position.x += f.vel.x * dt; this.position.z += f.vel.z * dt;
    this.position.y += this.velocity.y * dt;
    f.vel.x *= 1 - dt * 0.4; f.vel.z *= 1 - dt * 0.4;
    this.group.rotation.y += f.spin * dt; this.group.rotation.x += f.spin * 0.7 * dt;
    const b = world.bounds;
    this.position.x = THREE.MathUtils.clamp(this.position.x, b.min.x, b.max.x);
    this.position.z = THREE.MathUtils.clamp(this.position.z, b.min.z, b.max.z);
    this.avatar.setAnim('jump', this.animTime);
    const ground = world.getGroundHeight(this.position.x, this.position.z, this.position.y);
    if (this.velocity.y < 0 && this.position.y <= ground) {
      this.position.y = ground; this.velocity.y = 0; this.onGround = true; this.fling = null;
      this.group.rotation.set(0, this.facing, 0);
      this.game.events.emit('player:landed', {});
      this.game.audio?.play('crash');
    }
    const target = _v.set(this.position.x, this.position.y + 1.7, this.position.z);
    _dir.set(Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch), Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch));
    camera.position.lerp(_p.copy(target).addScaledVector(_dir, this.cam.dist + 3), Math.min(1, dt * 6));
    camera.lookAt(target);
  }

  updateRiding(dt) {
    const ride = this.ride, { camera, input } = this.game;
    if (!this.frozen) ride.handleInput(input, dt);
    ride.getSeatTransform(this.position, _q);
    this.group.quaternion.copy(_q);
    this.avatar.setAnim(ride.seatAnim, this.animTime);
    // Camera: start from the ride's suggested seat-local offset, then let the rider orbit (drag) and zoom (wheel).
    const base = ride.cameraOffset, baseLen = base.length();
    const zoom = THREE.MathUtils.clamp(this.cam.dist / 9, 0.55, 1.6);
    const camLocal = _p.copy(base).normalize();
    const yawDelta = this.cam.yaw - Math.PI;
    const pitchDelta = this.cam.pitch - 0.35;
    if (ride.kind === 'passive' || Math.abs(yawDelta) > 0.01 || Math.abs(pitchDelta) > 0.01) {
      camLocal.applyAxisAngle(_up, yawDelta);
      // tilt: rotate around the horizontal axis perpendicular to the view direction
      _axis.set(camLocal.z, 0, -camLocal.x).normalize();
      if (_axis.lengthSq() > 0.5) camLocal.applyAxisAngle(_axis, -pitchDelta * 0.9);
    }
    const head = _head.set(0, 1.5, 0).applyQuaternion(_q).add(this.position);
    camLocal.applyQuaternion(_q); // seat-local direction -> world
    let dist = baseLen * zoom;
    // occlusion: pull in if ride structure (not the vehicle we sit in) or a world collider blocks the view
    dist = Math.min(dist, this.rideOccludedDistance(head, camLocal, dist, ride));
    const want = _v.copy(head).addScaledVector(camLocal, dist);
    const minY = this.game.world.getGroundHeight(want.x, want.z, want.y) + 0.5;
    want.y = Math.max(want.y, minY);
    camera.position.lerp(want, Math.min(1, dt * (ride.kind === 'drive' ? 10 : 7)));
    // orbiting riders look at themselves; otherwise use the ride's forward look point
    const orbited = Math.abs(yawDelta) > 0.35 || Math.abs(pitchDelta) > 0.35;
    if (orbited) _look.copy(head); else _look.copy(ride.cameraLookOffset).applyQuaternion(_q).add(this.position);
    camera.lookAt(_look);
    if (!this.frozen && input.justPressed('exit')) this.exitRide(false);
    else if (ride.isComplete()) this.exitRide(true);
  }

  rideOccludedDistance(origin, dir, want, ride) {
    let best = want;
    // vehicle = the seat's ancestors; never let the car we sit in block the camera
    if (ride._occluders === undefined || ride._occludersStamp !== ride.seat.parent) {
      // the vehicle = everything from the seat up to (not including) the ride group
      const vehicle = new Set(); let o = ride.seat; while (o && o !== ride.group) { vehicle.add(o); o = o.parent; }
      ride._occluders = [];
      ride.group.traverse((obj) => {
        if (!obj.isMesh || vehicle.has(obj) || obj.userData.noOcclude) return;
        let p = obj.parent, skip = false;
        while (p && p !== ride.group) { if (vehicle.has(p)) { skip = true; break; } p = p.parent; }
        if (!skip) ride._occluders.push(obj);
      });
      ride._occludersStamp = ride.seat.parent;
    }
    _rc.set(origin, dir); _rc.far = want; _rc.near = 0.3;
    const hits = _rc.intersectObjects(ride._occluders, false);
    if (hits.length) best = Math.min(best, Math.max(1.2, hits[0].distance - 0.35));
    _ray.set(origin, dir);
    for (const box of this.game.world.colliders) {
      if (box.containsPoint(origin)) continue;
      const hit = _ray.intersectBox(box, _hit);
      if (hit) { const d = hit.distanceTo(origin) - 0.35; if (d < best) best = Math.max(1.2, d); }
    }
    return best;
  }
}
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3(), _ray = new THREE.Ray(), _hit = new THREE.Vector3();
const _axis = new THREE.Vector3(), _head = new THREE.Vector3(), _rc = new THREE.Raycaster();

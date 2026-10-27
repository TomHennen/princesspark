// Third-person player controller: walking, jumping, step-up, camera orbit, rides, seats, slides.
import * as THREE from 'three';
import { buildAvatar, saveAvatarConfig } from './avatar.js';

const WALK = 6.5, RUN = 11, JUMP = 9, GRAVITY = -26, RADIUS = 0.45;
const STEP = 0.6;            // max rise the player walks up without jumping (CONTRACT: stairs are runs of ≤0.6 rises)
const EPS = 0.02;            // tolerance so a rise of exactly STEP counts
const HEIGHT = 1.8;          // collision height of the body
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _look = new THREE.Vector3();
const _scale = new THREE.Vector3(), _e = new THREE.Euler(), _tan = new THREE.Vector3();

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
    this.state = 'walk';        // 'walk' | 'riding' | 'sit' | 'slide'
    this.animTime = 0;
    this.frozen = false;        // true during dialogue / menus
    this.nearest = null;        // nearest interactable in range
    this.distanceWalked = 0;
    // 'follow': the camera swings around behind you as you walk (default). 'free': only drag moves it.
    this.cameraMode = (() => { try { return localStorage.getItem('pk:cam') || 'follow'; } catch { return 'follow'; } })();
    this.lastDragTime = -10;
    this.fling = null;           // { vel: Vector3, spin } while being thrown through the air
    this.outfitOverride = null;  // e.g. 'swimsuit' inside the water park; saved config is untouched
    this.seat = null;            // { id, position, facing, attachTo, anim } while state === 'sit'
    this.sitHint = false;        // true while seated (UI shows the "X to stand up" hint)
    this.slide = null;           // { curve, id, duration, anim, t } while state === 'slide'
    this.boostUntil = -1;        // animTime until which running needs no held boost (sugar rush)
    this.jumpCooldown = 0;
    this._camLook = new THREE.Vector3(0, 1.7, 0);   // smoothed camera look target (seats / slides)
    this.setupLook(game.renderer.domElement);
  }

  get config() { return this.avatar.config; }
  /** True while the sugar-rush speed boost is active. */
  get boosted() { return this.animTime < this.boostUntil; }

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
      if (e.code === 'KeyV' && !this.frozen) this.toggleCameraMode();
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.cam.dist = Math.min(13, this.cam.dist + 1);
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.cam.dist = Math.max(4, this.cam.dist - 1);
    });
    // Touch look: a finger that lands on the right 55% of the screen (not on a control) orbits; two fingers pinch to zoom.
    // Listened for on window: the full-screen UI wrappers (#ui-root, .hk-hud, .hk-touch) sit over the canvas and can
    // end up as the touch target, so any touch on them counts as a touch on the canvas. Joystick/button fingers never do.
    const lookTarget = (el) => el === canvas || (el && el.nodeType === 1 && (el.id === 'ui-root' || el.classList.contains('hk-touch') || el.classList.contains('hk-hud') || el.classList.contains('hk-tbtns')));
    const touches = new Map();   // identifier -> { x, y } for fingers we own
    let pinchDist = null;
    const pinch = () => { if (touches.size < 2) return null; const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    window.addEventListener('touchstart', (e) => {
      if (!lookTarget(e.target)) return;
      e.preventDefault();   // no double-tap zoom / scroll / long-press callouts on the play area
      for (const t of e.changedTouches) {
        touches.set(t.identifier, { x: t.clientX, y: t.clientY });
        if (touchId === null && t.clientX > window.innerWidth * 0.45) { touchId = t.identifier; lastTouch = { x: t.clientX, y: t.clientY }; }
      }
      pinchDist = pinch();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      let ours = false;
      for (const t of e.changedTouches) if (touches.has(t.identifier)) { ours = true; touches.set(t.identifier, { x: t.clientX, y: t.clientY }); }
      if (!ours) return;
      if (e.cancelable) e.preventDefault();
      const pd = pinch();
      if (pd !== null && pinchDist !== null) { this.cam.dist = THREE.MathUtils.clamp(this.cam.dist - (pd - pinchDist) * 0.03, 4, 13); pinchDist = pd; return; }
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) { this.game.input.addLook((t.clientX - lastTouch.x) * 1.5, (t.clientY - lastTouch.y) * 1.5); lastTouch = { x: t.clientX, y: t.clientY }; }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) { touches.delete(t.identifier); if (t.identifier === touchId) touchId = null; }
      if (touches.size < 2) pinchDist = null;
      // after a pinch, the remaining finger takes over orbiting from where it is (no jump)
      if (touchId === null && touches.size === 1) { const [id, p] = [...touches.entries()][0]; touchId = id; lastTouch = { x: p.x, y: p.y }; }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
  }

  setCameraMode(mode) { this.cameraMode = mode; try { localStorage.setItem('pk:cam', mode); } catch {} }
  /** V key / touch camera button: flip between follow and free orbit, with a toast. */
  toggleCameraMode() {
    this.setCameraMode(this.cameraMode === 'follow' ? 'free' : 'follow');
    this.game.ui?.toast?.(this.cameraMode === 'follow' ? 'Camera: follows you (V to change)' : 'Camera: free (drag to look, V to change)');
  }
  setOutfitOverride(outfit) {
    if (this.outfitOverride === outfit) return;
    this.outfitOverride = outfit;
    const saved = this.avatar.config.outfit;
    this.avatar.setConfig({ outfit: outfit || this._savedOutfit || saved });
    if (outfit) this._savedOutfit = this._savedOutfit || saved; else this._savedOutfit = null;
    this.game.events.emit('player:outfit', { outfit: this.avatar.config.outfit, override: !!outfit });
  }
  /** Equip a hand-held item (HELD_ITEMS in avatar.js). Stored in the avatar config so it persists and syncs. */
  setHeld(item) {
    const held = item || 'none';
    try { this.avatar.setConfig({ held }); } catch (e) { console.warn('setHeld', e); if (this.avatar.config) this.avatar.config.held = held; }
    try { saveAvatarConfig(this.avatar.config); } catch {}
  }
  /** Sugar rush: run speed without holding boost for `seconds`. */
  speedBoost(seconds) { this.boostUntil = Math.max(this.boostUntil, this.animTime + (seconds || 0)); }

  /** Throw the player through the air (used by silly ride endings). vel is world-space m/s. */
  launch(vel, spin = 6) {
    if (this.state === 'riding') this.exitRide(false);
    if (this.state === 'sit') this.standUp();
    if (this.state === 'slide') this.endSlide(false);
    this.fling = { vel: vel.clone(), spin };
    this.velocity.y = vel.y; this.onGround = false; this.frozen = false;
    this.game.audio?.play('whoosh');
  }

  teleport(x, y, z, facing) {
    this.position.set(x, y, z); this.velocity.set(0, 0, 0);
    if (facing !== undefined) { this.facing = facing; this.cam.yaw = facing + Math.PI; }
    this.unstick();
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
    if (this.state === 'sit') return this.updateSit(dt);
    if (this.state === 'slide') return this.updateSlide(dt);
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
    const running = input.boost || this.boosted;
    const speed = running ? RUN : WALK;
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
    this.jumpCooldown -= dt;
    // integrate XZ with collision; on the ground, boxes whose top is within STEP of the feet don't block (step-up)
    const nx = this.position.x + dx * dt, nz = this.position.z + dz * dt;
    const resolved = this.resolveXZ(nx, nz, world, this.position.y, this.onGround ? STEP : 0.05);
    if (moving) this.distanceWalked += Math.hypot(resolved.x - this.position.x, resolved.z - this.position.z);
    this.position.x = resolved.x; this.position.z = resolved.z;
    // Y / ground (terrain, platforms and collider tops). On the ground, query with the pre-gravity height so a
    // tread exactly STEP high still counts.
    const y0 = this.position.y;
    this.position.y += this.velocity.y * dt;
    const ground = this.groundAt(this.position.x, this.position.z, this.onGround ? y0 : this.position.y);
    if (this.position.y <= ground) { this.position.y = ground; this.velocity.y = 0; this.onGround = true; }
    else if (this.onGround && this.velocity.y <= 0 && this.position.y - ground <= STEP) { this.position.y = ground; this.velocity.y = 0; } // walking down steps: stay glued
    else if (this.velocity.y < -1) this.onGround = false;
    // bounds
    const b = world.bounds;
    this.position.x = THREE.MathUtils.clamp(this.position.x, b.min.x, b.max.x);
    this.position.z = THREE.MathUtils.clamp(this.position.z, b.min.z, b.max.z);
    // anim
    this.group.rotation.y = this.facing;
    const anim = !this.onGround ? 'jump' : moving ? (running ? 'run' : 'walk') : 'idle';
    this.avatar.setAnim(anim, this.animTime, running ? 1.4 : 1);

    // --- camera ---
    this._camLook.set(this.position.x, this.position.y + 1.7, this.position.z);
    this.updateCamera(dt, this._camLook, 12);
  }

  /** Orbit camera around `target` (world), pulled in by occluders, lerped at `rate`. */
  updateCamera(dt, target, rate = 12) {
    const { camera, world } = this.game;
    _dir.set(Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch), Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch));
    const dist = this.occludedDistance(target, _dir, this.cam.dist, world);
    const cx = target.x + _dir.x * dist, cy = target.y + _dir.y * dist, cz = target.z + _dir.z * dist;
    const minY = world.getGroundHeight(cx, cz, cy) + 0.6;
    camera.position.lerp(_p.set(cx, Math.max(cy, minY), cz), Math.min(1, dt * rate));
    camera.lookAt(target);
    // squeezed against a wall / counter: go (almost) first person instead of showing the inside of the avatar's head
    this.group.visible = dist > 1.7;
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
    // let the camera come in close (indoors / against a wall) rather than poke through the wall
    return Math.max(0.35, best);
  }

  // ---------- collision ----------
  /**
   * Walkable height under (x,z): terrain + platforms (world) and the tops of collider boxes the player is on/near
   * (feet within [top-STEP, top+1.5] and inside the box footprint), so stairs built from boxes and crate tops work.
   */
  groundAt(x, z, yHint) {
    let h = this.game.world.getGroundHeight(x, z, yHint);
    for (const box of this.game.world.colliders) {
      const top = box.max.y;
      if (top <= h || top > yHint + STEP + EPS || top < yHint - 1.5) continue;
      if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) h = top;
    }
    return h;
  }

  /** True when a body standing with its feet at `feetY` at (x,z) would hit a collider (used for step-up headroom). */
  blockedAt(x, z, feetY, world, skip) {
    for (const box of world.colliders) {
      if (box === skip || box.max.y <= feetY + STEP + EPS || box.min.y >= feetY + HEIGHT) continue;   // lower boxes are the next treads, not obstacles
      const cx = THREE.MathUtils.clamp(x, box.min.x, box.max.x), cz = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
      if ((x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS * 0.9) return true;
    }
    return false;
  }

  /**
   * Slide the circle (RADIUS) at feet height `feetY` to (nx,nz) against world colliders. Boxes whose top is at most
   * `stepTol` above the feet are walked onto (if there is headroom above them) instead of blocking. Two passes so
   * corners (two touching boxes) can't be squeezed through.
   */
  resolveXZ(nx, nz, world, feetY = this.position.y, stepTol = 0.05) {
    let x = nx, z = nz;
    const colliders = world.colliders, r2 = RADIUS * RADIUS;
    for (let pass = 0; pass < 2; pass++) {
      for (const box of colliders) {
        // skip boxes fully above the head or whose top is at/below the feet
        if (box.max.y <= feetY + 0.05 || box.min.y >= feetY + HEIGHT) continue;
        const cx = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
        const cz = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
        const ddx = x - cx, ddz = z - cz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r2) continue;
        // step-up: a low box with headroom on top is a stair tread, not a wall
        if (box.max.y <= feetY + stepTol + EPS && !this.blockedAt(x, z, box.max.y, world, box)) continue;
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

  /** Push the player out of any collider they ended up inside (after teleports / standing up) and settle onto the ground. */
  unstick() {
    const world = this.game.world; if (!world || !world.colliders) return;
    const r = this.resolveXZ(this.position.x, this.position.z, world, this.position.y, STEP);
    this.position.x = r.x; this.position.z = r.z;
    const b = world.bounds;
    if (b) { this.position.x = THREE.MathUtils.clamp(this.position.x, b.min.x, b.max.x); this.position.z = THREE.MathUtils.clamp(this.position.z, b.min.z, b.max.z); }
    const ground = this.groundAt(this.position.x, this.position.z, this.position.y);
    if (this.position.y < ground) { this.position.y = ground; this.velocity.y = 0; this.onGround = true; }
  }

  // ---------- rides ----------
  boardRide(ride) {
    if (this.state === 'riding' || this.state === 'slide') return;
    if (this.state === 'sit') this.standUp();
    this.fling = null;
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
    this.group.quaternion.set(0, 0, 0, 1);
    this.group.rotation.set(0, this.facing, 0);
    this.teleport(e.x, this.game.world.getGroundHeight(e.x, e.z, e.y + 1), e.z);
    this.onGround = true;
    this.game.events.emit(completed ? 'ride:complete' : 'ride:exit', { ride: ride.id, name: ride.name, time: ride.rideTime });
  }

  // ---------- seats (benches, swings, loungers) ----------
  /** Sit down. `attachTo`: follow that Object3D's world transform (swing seat, spinner). Stand with X / jump / move. */
  sitAt({ id, position, facing = 0, attachTo = null, anim = 'sit' } = {}) {
    if (this.state === 'riding' || this.state === 'slide') return;
    if (this.state === 'sit') this.standUp(true);
    this.fling = null;
    const pos = position ? new THREE.Vector3(position.x, position.y, position.z) : this.position.clone();
    this.seat = { id, position: pos, facing, attachTo, anim: anim || 'sit', since: this.animTime };
    this.state = 'sit'; this.sitHint = true;
    this.velocity.set(0, 0, 0); this.onGround = true;
    this.group.quaternion.set(0, 0, 0, 1);
    if (attachTo) { this.syncSeat(); this._camAnchor = this.position.clone(); }
    else { this.position.copy(pos); this.facing = facing; this.group.rotation.set(0, facing, 0); }
    this.avatar.setAnim(this.seat.anim, this.animTime);
    this.game.events.emit('seat:sit', { id });
    this.game.ui?.toast?.('X / tap EXIT to stand up');
  }
  /** Copy the attachTo transform onto the avatar; derive facing from its world +Z. */
  syncSeat() {
    const a = this.seat.attachTo;
    a.updateWorldMatrix(true, false);
    a.matrixWorld.decompose(this.position, _q, _scale);
    this.group.quaternion.copy(_q);
    _tan.set(0, 0, 1).applyQuaternion(_q);
    this.facing = Math.atan2(_tan.x, _tan.z);
  }
  /** Stand up from a seat: placed 0.8 in front of the seat, on the ground. */
  standUp(silent = false) {
    if (this.state !== 'sit' || !this.seat) return;
    const seat = this.seat;
    if (seat.attachTo) this.syncSeat(); else this.facing = seat.facing;
    const x = this.position.x + Math.sin(this.facing) * 0.8, z = this.position.z + Math.cos(this.facing) * 0.8;
    this.seat = null; this.state = 'walk'; this.sitHint = false;
    this.group.quaternion.set(0, 0, 0, 1);
    this.group.rotation.set(0, this.facing, 0);
    const y = this.groundAt(x, z, this.position.y + 0.5);
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0); this.onGround = true;
    this.unstick();
    this.game.events.emit('seat:stand', { id: seat.id });
    if (!silent) this.game.audio?.play('click');
  }
  updateSit(dt) {
    const { input } = this.game, seat = this.seat;
    if (seat.attachTo) this.syncSeat(); else this.position.copy(seat.position);
    this.avatar.setAnim(seat.anim, this.animTime);
    // camera: orbit around a slowly drifting anchor so a swinging seat doesn't yank the view around
    if (seat.attachTo) this._camAnchor.lerp(this.position, Math.min(1, dt * 1.5)); else this._camAnchor = this.position;
    this._camLook.set(this._camAnchor.x, this._camAnchor.y + 1.7, this._camAnchor.z);
    this.updateCamera(dt, this._camLook, 8);
    if (this.frozen) return;
    const mv = input.move, settled = this.animTime - seat.since > 0.4;
    if (input.justPressed('exit') || input.justPressed('jump') || (settled && (input.jump || Math.hypot(mv.x, mv.y) > 0.3))) this.standUp();
  }

  // ---------- slides ----------
  /** Ride a world-space curve (flamingo slide, playground slide). Input is ignored until 'slide:end'. */
  slideAlong(curve, { id, duration = 3, anim = 'sit' } = {}) {
    if (this.state === 'riding') return;
    if (this.state === 'sit') this.standUp(true);
    this.fling = null;
    this.slide = { curve, id, duration: Math.max(0.3, duration), anim: anim || 'sit', t: 0 };
    this.state = 'slide';
    this.velocity.set(0, 0, 0);
    this.game.audio?.play('whoosh');
    this.updateSlide(0);
  }
  updateSlide(dt) {
    this.group.visible = true;
    const s = this.slide;
    s.t += dt;
    const k = Math.min(1, s.t / s.duration);
    const u = k * k * (3 - 2 * k);   // smoothstep: eases off the top, settles at the bottom
    const pt = s.curve.getPointAt(u);
    s.curve.getTangentAt(Math.min(0.999, u), _tan);
    if (_tan.lengthSq() < 1e-6) _tan.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.position.copy(pt);
    this.facing = Math.atan2(_tan.x, _tan.z);
    const tilt = -Math.asin(THREE.MathUtils.clamp(_tan.y, -1, 1)) * 0.5;   // lean back a little going down
    this.group.quaternion.setFromEuler(_e.set(tilt, this.facing, 0, 'YXZ'));
    this.avatar.setAnim(s.anim, this.animTime);
    // camera trails behind the direction of travel
    let d = this.facing + Math.PI - this.cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.cam.yaw += d * Math.min(1, dt * 4);
    this._camLook.lerp(_v.set(this.position.x, this.position.y + 1.5, this.position.z), Math.min(1, dt * 10));
    this.updateCamera(dt, this._camLook, 8);
    if (k >= 1) this.endSlide(true);
  }
  endSlide(emit = true) {
    const s = this.slide; if (!s) return;
    this.slide = null; this.state = 'walk';
    this.group.quaternion.set(0, 0, 0, 1);
    this.group.rotation.set(0, this.facing, 0);
    this.position.y = this.groundAt(this.position.x, this.position.z, this.position.y);
    this.velocity.set(0, 0, 0); this.onGround = true;
    this.unstick();
    if (emit) this.game.events.emit('slide:end', { id: s.id });
  }

  updateFling(dt) {
    this.group.visible = true;
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
    const ground = this.groundAt(this.position.x, this.position.z, this.position.y);
    if (this.velocity.y < 0 && this.position.y <= ground) {
      this.position.y = ground; this.velocity.y = 0; this.onGround = true; this.fling = null;
      this.group.rotation.set(0, this.facing, 0);
      this.unstick();
      this.game.events.emit('player:landed', {});
      this.game.audio?.play('crash');
    }
    const target = _v.set(this.position.x, this.position.y + 1.7, this.position.z);
    _dir.set(Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch), Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch));
    camera.position.lerp(_p.copy(target).addScaledVector(_dir, this.cam.dist + 3), Math.min(1, dt * 6));
    camera.lookAt(target);
  }

  updateRiding(dt) {
    this.group.visible = true;
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

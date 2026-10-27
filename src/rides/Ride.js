// Base class every ride extends. See CONTRACT.md for the full rules.
import * as THREE from 'three';

const SEATS_KEY = 'pk:seats';          // localStorage: { [rideId]: seatId } — the last seat picked per ride
const HOLD_WATCHDOG = 15;              // ticks a closed seat menu may stay unresolved before the default seat is taken
export function loadSeatPicks() { try { return JSON.parse(localStorage.getItem(SEATS_KEY) || '{}') || {}; } catch { return {}; } }
export function saveSeatPick(rideId, seatId) { try { const all = loadSeatPicks(); all[rideId] = seatId; localStorage.setItem(SEATS_KEY, JSON.stringify(all)); } catch { /* private mode */ } }

export class Ride {
  /**
   * @param {object} game  the shared game object (scene, events, player, world, audio, ui, ...)
   * @param {object} opts  { id, name, kind: 'passive'|'drive', position: Vector3, rotationY }
   */
  constructor(game, opts) {
    this.game = game;
    this.id = opts.id;                      // 'coaster', 'carousel', ... (stable key used by quests)
    this.name = opts.name;                  // display name, e.g. "Dragon's Breath Coaster"
    this.kind = opts.kind || 'passive';     // passive: player sits & watches. drive: player steers.
    this.group = new THREE.Group();
    this.group.name = `ride:${this.id}`;
    this.group.position.copy(opts.position || new THREE.Vector3());
    this.group.rotation.y = opts.rotationY || 0;
    this.station = new THREE.Vector3();     // WORLD position where the player stands to board (set in build())
    this.stationRadius = 3.5;               // interaction radius around station
    this.seat = new THREE.Object3D();       // the player avatar follows this object's world transform while riding
    this.seatAnim = 'sit';                  // avatar animation while riding: 'sit' | 'drive'
    this.cameraOffset = new THREE.Vector3(0, 3.2, -7); // camera position in seat-local space (seat +Z = forward)
    this.cameraLookOffset = new THREE.Vector3(0, 1.2, 6); // where camera looks, seat-local
    this.riding = false;
    this.rideTime = 0;
    this.duration = 30;                     // seconds; passive rides auto-complete after this
    this.colliders = [];                    // THREE.Box3 (world space) the player can't walk through
    this.tagline = '';                      // short flavor text shown in the ride prompt
    this.remoteRiders = new Set();          // peerIds of remote players currently aboard this ride (net:board / net:unboard)
    this.holding = false;                   // true while the rider is picking a seat: the vehicle waits in the station
    this.seatId = null;                     // the seat picked for this ride (informational, see seatOptions())
    this._boardToken = 0; this._holdTicks = 0;
    game.events?.on?.('net:board', (e) => { if (e?.ride === this.id && e.peerId != null) this.remoteRiders.add(e.peerId); });
    game.events?.on?.('net:unboard', (e) => { if (e?.ride === this.id) this.remoteRiders.delete(e?.peerId); });
  }
  /** True while anyone (local or remote) is aboard — rides that only animate for riders should use this. */
  get occupied() { return this.riding || this.remoteRiders.size > 0; }
  /** Populate this.group, set this.station (world space), add colliders. Called once. */
  build() {}
  /** Animate the ride every frame, whether or not someone is riding. dt is 0 while a rider is picking a seat. */
  update(dt, t) {}
  /** Drive rides: react to input while the player is riding. */
  handleInput(input, dt) {}
  /** Passive rides: return true when the cycle ends; the player is unboarded automatically. */
  isComplete() { return this.kind === 'passive' && this.rideTime >= this.duration; }
  /** World-space position the player is placed at after the ride. Defaults to the station. */
  get exitPosition() { return this.station; }

  // ---------- seat choice (see CONTRACT.md round 3) ----------
  /** `[{ id, label, sub? }]` when the rider may pick a seat, else null. */
  seatOptions() { return null; }
  /** Re-parent this.seat for seat `id` and re-home peer seats so none shares the local seat. Rides override. */
  chooseSeat(id) {}
  /** Options with the remembered pick first (marked), so a cancelled menu lands on it. */
  orderedSeatOptions() {
    const opts = this.seatOptions();
    if (!opts?.length) return null;
    const last = loadSeatPicks()[this.id];
    const i = opts.findIndex((o) => o.id === last);
    if (i < 0) return opts.slice();
    const pick = { ...opts[i], sub: opts[i].sub ? `★ last time · ${opts[i].sub}` : '★ last time' };
    return [pick, ...opts.slice(0, i), ...opts.slice(i + 1)];
  }
  /**
   * Finish the seat pick (menu callback, scripts, or the watchdog): applies the seat (an unknown / null id
   * falls back to the first ordered option), remembers it, releases the hold and starts the ride.
   */
  pickSeat(id) {
    const token = this._boardToken, ordered = this.orderedSeatOptions();
    if (!ordered?.length || !this.riding) return;
    if (!ordered.some((o) => o.id === id)) id = ordered[0].id;
    this.chooseSeat(id);
    this.seatId = id;
    saveSeatPick(this.id, id);
    if (this.holding) {
      this.holding = false;
      this.game.ui?.closeChoose?.();
      if (token === this._boardToken && this.riding) this.onBoard?.(this._pendingPlayer);
    }
    this._pendingPlayer = null;
  }

  /** Multiplayer: seat for remote rider i inside this client's ride (see CONTRACT.md). Default: beside the local seat. */
  peerSeat(i) {
    if (this.kind === 'drive') return null;
    this._peerSeats ||= [];
    if (!this._peerSeats[i]) { const s = new THREE.Object3D(); s.position.set((i % 2 ? -1 : 1) * 0.9 * Math.ceil((i + 1) / 2), 0, 0); this.seat.add(s); this._peerSeats[i] = s; }
    return this._peerSeats[i];
  }
  /** Multiplayer, drive rides: a fresh vehicle mesh for a remote rider (parented by net under the remote avatar). */
  makePeerVehicle() { return null; }

  /**
   * Boarding: stage the vehicle in the station (`onStage`), then — when the ride offers seats — hold it there
   * while the rider picks from `ui.chooseMenu`; `onBoard` runs once the seat is settled.
   */
  board(player) {
    this.riding = true; this.rideTime = 0;
    const token = ++this._boardToken;
    this.onStage?.(player);
    const ordered = this.orderedSeatOptions();
    if (!ordered) { this.onBoard?.(player); return; }
    const ui = this.game.ui;
    if (!ui?.chooseMenu) { this.pickSeat(ordered[0].id); this.onBoard?.(player); return; }
    this.holding = true; this._holdTicks = 0; this._pendingPlayer = player;
    this.chooseSeat(ordered[0].id);   // sit in the remembered seat while the menu is up
    const options = ordered.map((o) => ({ label: o.label, sub: o.sub, value: o.id }));
    ui.chooseMenu({ title: 'Pick your seat', speaker: this.name, color: this.menuColor || '#0b5d3b', options, cancel: 'Any seat is fine' })
      .then((v) => { if (token === this._boardToken && this.holding) this.pickSeat(v); })
      .catch(() => { if (token === this._boardToken && this.holding) this.pickSeat(null); });
  }
  unboard(player) {
    this._boardToken++;
    if (this.holding) { this.holding = false; this._pendingPlayer = null; this.game.ui?.closeChoose?.(); }
    this.riding = false; this.onUnboard?.(player);
  }
  /** Internal: called by main loop. While holding, the ride animates with dt = 0 (idle effects keep ticking on t). */
  _tick(dt, t) {
    if (this.holding) {
      // a seat menu that was closed without resolving (scripts, a chooser replaced by another) still has to let go
      if (this.game.ui?.chooseOpen) this._holdTicks = 0; else if (++this._holdTicks > HOLD_WATCHDOG) this.pickSeat(null);
      if (this.holding) { this.update(0, t); return; }
    }
    if (this.riding) this.rideTime += dt;
    this.update(dt, t);
  }
  /** Helper: world-space seat transform. */
  getSeatTransform(outPos, outQuat) {
    this.seat.updateWorldMatrix(true, false);
    this.seat.matrixWorld.decompose(outPos, outQuat, _scale);
    return outPos;
  }
  /** Helper: make a Box3 collider in world space from a local-space center/size. */
  addBoxCollider(localCenter, size) {
    this.group.updateMatrixWorld(true); // group may not be in the scene yet during build()
    // transform the whole box (not just its centre) so rides with a rotationY get correctly oriented colliders
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(localCenter, size).applyMatrix4(this.group.matrixWorld));
  }
}
const _scale = new THREE.Vector3();

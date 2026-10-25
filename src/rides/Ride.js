// Base class every ride extends. See CONTRACT.md for the full rules.
import * as THREE from 'three';

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
    game.events?.on?.('net:board', (e) => { if (e?.ride === this.id && e.peerId != null) this.remoteRiders.add(e.peerId); });
    game.events?.on?.('net:unboard', (e) => { if (e?.ride === this.id) this.remoteRiders.delete(e?.peerId); });
  }
  /** True while anyone (local or remote) is aboard — rides that only animate for riders should use this. */
  get occupied() { return this.riding || this.remoteRiders.size > 0; }
  /** Populate this.group, set this.station (world space), add colliders. Called once. */
  build() {}
  /** Animate the ride every frame, whether or not someone is riding. */
  update(dt, t) {}
  /** Drive rides: react to input while the player is riding. */
  handleInput(input, dt) {}
  /** Passive rides: return true when the cycle ends; the player is unboarded automatically. */
  isComplete() { return this.kind === 'passive' && this.rideTime >= this.duration; }
  /** World-space position the player is placed at after the ride. Defaults to the station. */
  get exitPosition() { return this.station; }

  /** Multiplayer: seat for remote rider i inside this client's ride (see CONTRACT.md). Default: beside the local seat. */
  peerSeat(i) {
    if (this.kind === 'drive') return null;
    this._peerSeats ||= [];
    if (!this._peerSeats[i]) { const s = new THREE.Object3D(); s.position.set((i % 2 ? -1 : 1) * 0.9 * Math.ceil((i + 1) / 2), 0, 0); this.seat.add(s); this._peerSeats[i] = s; }
    return this._peerSeats[i];
  }
  /** Multiplayer, drive rides: a fresh vehicle mesh for a remote rider (parented by net under the remote avatar). */
  makePeerVehicle() { return null; }

  board(player) { this.riding = true; this.rideTime = 0; this.onBoard?.(player); }
  unboard(player) { this.riding = false; this.onUnboard?.(player); }
  /** Internal: called by main loop. */
  _tick(dt, t) { if (this.riding) this.rideTime += dt; this.update(dt, t); }
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

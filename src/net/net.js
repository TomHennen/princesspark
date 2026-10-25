// Play-together networking: serverless WebRTC via Trystero (Nostr relays for signaling, then direct peer
// connections). Everyone who types the same 4-letter room code shares a park. No accounts, no chat, no server of
// ours: only positions, animation state and the avatar look are exchanged. If the room service can't be reached
// (offline, blocked WebSockets) the game simply stays single player.
//
// Peer protocol (Trystero actions, JSON-serialisable objects):
//   'join'  { name, config }                                  sent to each peer when they appear, and again when our look
//                                                             changes (config includes the hand-held item, `held`)
//   'state' { p:[x,y,z], ry, q?, anim, st, ride, outfit }     ~10 Hz broadcast, only when something changed (1 s heartbeat)
//           st   = player.state: 'walk' | 'riding' | 'sit' | 'slide'
//           ride = ride id while st === 'riding', else null
// Peers leaving is detected by Trystero itself (room.onPeerLeave).
//
// Remote riders: every client animates its rides on its own clock, so a rider's transmitted position is where THEIR
// train is, not ours. While a peer says `ride: <id>` we therefore ignore the transmitted transform on passive rides and
// sit the remote avatar on `ride.peerSeat(slot)` of OUR copy of that ride (same train / an extra tube), where slot is
// a stable index among the peers currently on that ride. Drive rides (bikes) have a static arena, so the transmitted
// transform is right; we parent a `ride.makePeerVehicle()` mesh under the remote avatar so they ride their own bike.
import * as THREE from 'three';
import { joinRoom, getRelaySockets } from 'trystero';
import { buildAvatar, DEFAULT_AVATAR, HAIR_STYLES, OUTFITS, ACCESSORIES, HELD_ITEMS } from '../core/avatar.js';
import { createLobby } from './lobby.js';
import { CODE_RE, normalizeCode } from './code.js';

export const APP_ID = 'princess-park-v1';
export const ROOM_KEY = 'pk:room';
// Big, long-lived public Nostr relays used only to find each other (the game data itself goes peer to peer).
// Pinning a list means every player uses the same relays, so two players always share one.
export const RELAY_URLS = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://nostr.mom', 'wss://relay.primal.net', 'wss://relay.snort.social', 'wss://nostr.wine'];

const SEND_MS = 100, HEARTBEAT_MS = 1000, CONFIG_CHECK_MS = 1000;
const RELAY_TIMEOUT_MS = 20000, STALE_MS = 30000, LERP = 10;
/** At most this many remote avatars are drawn (extra peers are tracked but hidden) — keeps a crowded room playable. */
export const MAX_RENDERED_PEERS = 8;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ANIMS = new Set(['idle', 'walk', 'run', 'jump', 'sit', 'wave', 'drive']);
const STATES = new Set(['walk', 'riding', 'sit', 'slide']);
const HELD = Array.isArray(HELD_ITEMS) && HELD_ITEMS.length ? HELD_ITEMS : ['none'];

export function createNet(game) {
  const peers = new Map(); // peerId -> remote player
  const seatSlots = new Map(); // rideId -> (peerId | null)[]  — which remote rider sits in which peerSeat
  const net = {
    update, destroy, join, leave,
    peers,
    connected: false,          // true while in a room and at least one signaling relay is reachable
    roomCode: null,
    status: 'idle',            // 'idle' | 'joining' | 'joined' | 'error'
    error: '',                 // human-readable reason when status === 'error'
    get playing() { return peers.size + (net.roomCode ? 1 : 0); },
    /** Diagnostics: signaling relay url -> WebSocket readyState (1 = open). */
    relays() { try { return Object.fromEntries(Object.entries(getRelaySockets() || {}).map(([u, s]) => [u, s?.readyState])); } catch { return {}; } },
    /** Diagnostics: remote riders per ride id -> [peer names] (slot order). */
    riders() { const o = {}; for (const [id, arr] of seatSlots) o[id] = arr.map((pid) => (pid ? peers.get(pid)?.name ?? null : null)); return o; },
  };

  let room = null, joinAct = null, stateAct = null, destroyed = false;
  let joinedAt = 0, lastRelayCheck = 0;
  let lastSendAt = -Infinity, lastSent = '', lastConfigJson = '', lastConfigCheck = 0;
  let localAnim = 'idle';
  const pendingState = new Map(); // state that arrived before the peer's join payload
  const _e = new THREE.Euler(), _pos = new THREE.Vector3(), _quat = new THREE.Quaternion(), _scl = new THREE.Vector3();

  // The avatar doesn't expose its current anim state; wrap setAnim on the local avatar to capture it.
  const av = game.player.avatar, origSetAnim = av.setAnim;
  av.setAnim = (state, t, speed) => { localAnim = state; return origSetAnim(state, t, speed); };
  const offOutfit = game.events.on('player:outfit', () => { if (room) sendJoin(); });

  const lobby = createLobby(game, net);

  // Test hooks (?netdebug=1 only): drive a fake peer through the same add/apply/remove path the room uses.
  if (game.params?.get?.('netdebug') === '1') {
    net._debugApplyState = (pid, state) => {
      pid = String(pid || 'debug-peer');
      const s = state && typeof state === 'object' ? state : {};
      const peer = peers.get(pid) || addPeer(pid, s.name ?? 'Tester', s.config, false);
      applyState(peer, s);
      emitCount();
      return peer;
    };
    net._debugRemovePeer = (pid) => { removePeer(String(pid), false); emitCount(); };
  }

  // Auto-join: ?room=KPRT in the URL wins, otherwise the room we were in last time.
  let auto = normalizeCode(game.params.get('room'));
  if (!auto) { try { auto = normalizeCode(localStorage.getItem(ROOM_KEY)); } catch {} }
  if (CODE_RE.test(auto)) join(auto);
  return net;

  // ---------- room ----------
  function join(code) {
    code = normalizeCode(code);
    if (!CODE_RE.test(code)) { setStatus('error', 'Room codes are 4 letters, like KPRT'); return false; }
    if (room) leave({ keepStatus: true });
    net.roomCode = code;
    try { localStorage.setItem(ROOM_KEY, code); } catch {}
    setStatus('joining', '');
    try {
      room = joinRoom(
        { appId: APP_ID, relayConfig: { urls: RELAY_URLS, warnOnRelayFailure: false } },
        `pp-${code}`,
        { onJoinError: (d) => { console.warn('[net] join error', d?.error); } },
      );
    } catch (e) {
      console.warn('[net] joinRoom failed', e);
      room = null; net.roomCode = null;
      setStatus('error', "Can't reach the room service here");
      return false;
    }
    joinedAt = performance.now(); lastRelayCheck = 0;
    joinAct = room.makeAction('join');
    stateAct = room.makeAction('state');
    joinAct.onMessage = (data, meta) => {
      const pid = meta?.peerId; if (!validId(pid) || !data || typeof data !== 'object') return;
      const peer = addPeer(pid, data.name, data.config, true);
      const st = pendingState.get(pid);
      if (st) { pendingState.delete(pid); applyState(peer, st); }
      emitCount();
    };
    stateAct.onMessage = (data, meta) => {
      const pid = meta?.peerId; if (!validId(pid) || !data || typeof data !== 'object') return;
      const peer = peers.get(pid);
      if (peer) applyState(peer, data); else if (pendingState.size < 64) pendingState.set(pid, data);
    };
    room.onPeerJoin = (pid) => {
      // Introduce ourselves to the newcomer only; they'll do the same for us.
      try { joinAct.send(joinPayload(), { target: pid }); stateAct.send(statePayload(), { target: pid }); } catch {}
    };
    room.onPeerLeave = (pid) => { pendingState.delete(pid); if (peers.has(pid)) { removePeer(pid, true); emitCount(); } };
    lastSent = ''; lastSendAt = -Infinity;
    lastConfigJson = JSON.stringify(game.player.config);
    return true;
  }

  function leave({ keepStatus = false } = {}) {
    if (room) { try { room.leave(); } catch {} }
    room = null; joinAct = null; stateAct = null;
    pendingState.clear();
    for (const pid of [...peers.keys()]) removePeer(pid, false);
    net.roomCode = null; net.connected = false;
    try { localStorage.removeItem(ROOM_KEY); } catch {}
    if (!keepStatus) setStatus('idle', '');
    emitCount();
  }

  function destroy() {
    destroyed = true;
    leave();
    offOutfit();
    av.setAnim = origSetAnim;
    lobby.destroy();
  }

  function setStatus(status, error) {
    if (net.status === status && net.error === error) return;
    net.status = status; net.error = error || '';
    game.events.emit('net:status', { status, error: net.error, roomCode: net.roomCode });
  }

  // ---------- outgoing ----------
  function joinPayload() {
    const cfg = { ...game.player.config };
    lastConfigJson = JSON.stringify(cfg);
    return { name: String(cfg.name || 'Explorer').slice(0, 24), config: cfg };
  }
  function sendJoin() { if (joinAct) try { joinAct.send(joinPayload()); } catch {} }
  function statePayload() {
    const pl = game.player, p = pl.position;
    const st = STATES.has(pl.state) ? pl.state : 'walk';
    const riding = st === 'riding' && pl.ride && typeof pl.ride.id === 'string';
    const msg = {
      p: [r2(p.x), r2(p.y), r2(p.z)],
      ry: r2(pl.group.rotation.y),
      anim: ANIMS.has(localAnim) ? localAnim : 'idle',
      st,
      ride: riding ? pl.ride.id : null,
      outfit: pl.config.outfit,
    };
    // On a seat, a slide or mid-fling the body is tilted: ship the full quaternion so the peer sits/flies properly.
    if (riding || pl.fling || st === 'sit' || st === 'slide') { const q = pl.group.quaternion; msg.q = [r3(q.x), r3(q.y), r3(q.z), r3(q.w)]; }
    return msg;
  }

  // ---------- per frame ----------
  function update(dt, t) {
    if (destroyed) return;
    const now = performance.now();
    if (room) {
      // Signaling health: are we connected to at least one relay? Drives `connected` and the "can't reach" message.
      if (now - lastRelayCheck > 1000) {
        lastRelayCheck = now;
        let open = false;
        try { open = Object.values(getRelaySockets() || {}).some((s) => s && s.readyState === 1); } catch {}
        net.connected = open;
        if (open) setStatus('joined', '');
        else if (now - joinedAt > RELAY_TIMEOUT_MS) setStatus('error', "Can't reach the room service here");
      }
      // Re-send the look when the local avatar config changed (dressing room, swimsuit override, held item).
      if (now - lastConfigCheck > CONFIG_CHECK_MS) {
        lastConfigCheck = now;
        if (JSON.stringify(game.player.config) !== lastConfigJson) sendJoin();
      }
      if (peers.size && now - lastSendAt >= SEND_MS) {
        const msg = statePayload(), json = JSON.stringify(msg);
        if (json !== lastSent || now - lastSendAt >= HEARTBEAT_MS) { try { stateAct.send(msg); } catch {} lastSent = json; lastSendAt = now; }
      }
    }
    // Move remote avatars: seated riders follow our copy of the ride, everyone else lerps toward the transmitted state.
    // (Runs after the rides ticked this frame, so peer seats already hold this frame's vehicle transform.)
    const k = Math.min(1, dt * LERP);
    let drawn = 0;
    for (const peer of peers.values()) {
      const g = peer.group;
      g.visible = drawn++ < MAX_RENDERED_PEERS;
      const ride = peer.rideObj;
      let seat = null;
      if (ride && ride.kind !== 'drive') { try { seat = ride.peerSeat?.(peer.slot) || null; } catch { seat = null; } }
      let anim = peer.anim;
      if (seat && seat.isObject3D) {
        // In the vehicle: copy the seat's world transform exactly, like the local rider does with ride.seat.
        seat.updateWorldMatrix(true, false);
        seat.matrixWorld.decompose(_pos, _quat, _scl);
        g.position.copy(_pos); g.quaternion.copy(_quat);
        peer.seated = true; peer.snap = false;
        anim = ANIMS.has(ride.seatAnim) ? ride.seatAnim : 'sit';
      } else {
        if (peer.seated || peer.snap) {
          // Leaving a seat (or just boarded a bike / sat down): jump straight to the transmitted spot, no glide across the park.
          g.position.copy(peer.target);
          if (peer.targetQ) g.quaternion.copy(peer.targetQ); else g.quaternion.setFromEuler(_e.set(0, peer.targetRy, 0, 'YXZ'));
          peer.seated = false; peer.snap = false;
        } else {
          if (g.position.distanceToSquared(peer.target) > 400) g.position.copy(peer.target); // teleport / ride jump
          else g.position.lerp(peer.target, k);
          if (peer.targetQ) {
            g.quaternion.slerp(peer.targetQ, k);
          } else {
            // yaw-only: unwind any leftover tilt from a ride, then turn the short way round
            _e.setFromQuaternion(g.quaternion, 'YXZ');
            let d = peer.targetRy - _e.y; d = Math.atan2(Math.sin(d), Math.cos(d));
            _e.set(_e.x * (1 - k), _e.y + d * k, _e.z * (1 - k), 'YXZ');
            g.quaternion.setFromEuler(_e);
          }
        }
        if (peer.st === 'sit' || peer.st === 'slide') anim = 'sit';
        else if (ride && ride.kind === 'drive') anim = ANIMS.has(ride.seatAnim) ? ride.seatAnim : 'drive';
      }
      peer.avatar.setAnim(anim, t + peer.phase, anim === 'run' ? 1.4 : 1);
      peer.tag.position.y = peer.tagBaseY + Math.sin(t * 2 + peer.phase) * 0.06;
      if (now - peer.lastSeen > STALE_MS) { removePeer(peer.id, true); emitCount(); }
    }
  }

  // ---------- remote players ----------
  function addPeer(pid, name, config, announce) {
    name = cleanName(name);
    config = cleanConfig(config, name);
    let peer = peers.get(pid);
    if (peer) { // re-join = the look changed
      try { peer.avatar.setConfig(config); } catch (e) { console.warn('[net] bad look from peer', e); }
      if (name !== peer.name) { peer.name = name; peer.tag.userData.redraw(name, tagColor(config.topColor)); }
      peer.tagBaseY = peer.avatar.height + 0.9;
      peer.lastSeen = performance.now();
      return peer;
    }
    let avatar;
    try { avatar = buildAvatar(config); } catch (e) { console.warn('[net] bad look from peer, using default', e); avatar = buildAvatar({ ...DEFAULT_AVATAR, name }); }
    const group = new THREE.Group();
    group.name = `net:${pid}`;
    group.add(avatar.group);
    const tag = makeNameTag(name, tagColor(config.topColor));
    const tagBaseY = avatar.height + 0.9;
    tag.position.y = tagBaseY;
    group.add(tag);
    group.position.copy(game.player.position);
    game.scene.add(group);
    peer = {
      id: pid, name, avatar, group, tag, tagBaseY,
      target: group.position.clone(), targetRy: 0, targetQ: null, anim: 'idle', st: 'walk',
      ride: null, rideObj: null, slot: -1, vehicle: null, seated: false, snap: false,
      phase: Math.random() * 10, lastSeen: performance.now(),
    };
    peers.set(pid, peer);
    if (announce) { game.ui?.toast?.(`${name} joined!`); game.audio?.play?.('board'); }
    // Make sure the newcomer gets our current state right away, not only on the next change.
    lastSent = '';
    return peer;
  }

  function applyState(peer, s) {
    peer.lastSeen = performance.now();
    if (Array.isArray(s.p) && s.p.length === 3 && s.p.every(Number.isFinite)) {
      const b = game.world.bounds;
      peer.target.set(THREE.MathUtils.clamp(s.p[0], b.min.x - 5, b.max.x + 5), THREE.MathUtils.clamp(s.p[1], -20, 200), THREE.MathUtils.clamp(s.p[2], b.min.z - 5, b.max.z + 5));
    }
    if (Number.isFinite(s.ry)) peer.targetRy = s.ry;
    if (Array.isArray(s.q) && s.q.length === 4 && s.q.every(Number.isFinite) && s.q.some((v) => v !== 0)) {
      peer.targetQ = (peer.targetQ || new THREE.Quaternion()).set(s.q[0], s.q[1], s.q[2], s.q[3]).normalize();
    } else peer.targetQ = null;
    peer.anim = ANIMS.has(s.anim) ? s.anim : 'idle';
    const rideId = typeof s.ride === 'string' ? s.ride.slice(0, 32) : null;
    // Older clients send no `st`; infer it from `ride` so mixed versions still ride together.
    peer.st = STATES.has(s.st) ? s.st : rideId ? 'riding' : 'walk';
    const rideObj = peer.st === 'riding' && rideId ? findRide(rideId) : null; // unknown ids (garbage, newer version) = not riding
    peer.ride = rideObj ? rideObj.id : null;
    setPeerRide(peer, rideObj);
    if (typeof s.outfit === 'string' && OUTFITS.includes(s.outfit) && s.outfit !== peer.avatar.config.outfit) {
      try { peer.avatar.setConfig({ outfit: s.outfit }); } catch {}
      peer.tagBaseY = peer.avatar.height + 0.9;
    }
  }

  function findRide(id) { return (Array.isArray(game.rides) ? game.rides : []).find((r) => r && r.id === id) || null; }

  /** Put the peer on a ride (seat slot or own vehicle) or take them off it. Idempotent for the same ride. */
  function setPeerRide(peer, ride) {
    if (peer.rideObj === ride) return;
    if (peer.rideObj) {
      releaseSeat(peer);
      removeVehicle(peer);
      game.events.emit('net:unboard', { ride: peer.rideObj.id, peer: peer.name, peerId: peer.id });
    }
    peer.rideObj = ride;
    peer.snap = true; // whichever way we go, don't glide between the seat and the transmitted spot
    if (!ride) return;
    if (ride.kind === 'drive') {
      let v = null;
      try { v = ride.makePeerVehicle?.() || null; } catch (e) { console.warn('[net] makePeerVehicle failed', e); }
      if (v && v.isObject3D) { peer.vehicle = v; peer.group.add(v); }
    } else {
      peer.slot = allocSeat(ride.id, peer.id);
    }
    game.events.emit('net:board', { ride: ride.id, peer: peer.name, peerId: peer.id, slot: peer.slot });
  }
  function allocSeat(rideId, pid) {
    let arr = seatSlots.get(rideId);
    if (!arr) { arr = []; seatSlots.set(rideId, arr); }
    let i = arr.indexOf(null);
    if (i < 0) { i = arr.length; arr.push(pid); } else arr[i] = pid;
    return Math.min(i, MAX_RENDERED_PEERS - 1);
  }
  function releaseSeat(peer) {
    const arr = peer.rideObj && seatSlots.get(peer.rideObj.id);
    if (arr) {
      const i = arr.indexOf(peer.id);
      if (i >= 0) arr[i] = null;
      while (arr.length && arr[arr.length - 1] === null) arr.pop();
      if (!arr.length) seatSlots.delete(peer.rideObj.id);
    }
    peer.slot = -1;
  }
  function removeVehicle(peer) {
    const v = peer.vehicle; if (!v) return;
    peer.vehicle = null;
    peer.group.remove(v);
    // The ride owns the vehicle's geometry/materials (they may be shared with its own bikes); let it clean up if it wants to.
    try { v.userData?.dispose?.(); } catch {}
  }

  function removePeer(pid, announce) {
    const peer = peers.get(pid);
    if (!peer) return;
    peers.delete(pid);
    setPeerRide(peer, null);
    game.scene.remove(peer.group);
    peer.group.traverse((o) => {
      if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); return; }
      if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose()); }
    });
    if (announce) game.ui?.toast?.(`${peer.name} left`);
  }

  function emitCount() { game.events.emit('net:peers', { count: peers.size, roomCode: net.roomCode }); }
}

// ---------- helpers ----------
const validId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(v);
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
function cleanName(n) { return String(n ?? '').replace(/[^A-Za-z0-9 '\-]/g, '').trim().slice(0, 16) || 'Friend'; }
// Only accept the avatar fields we know, with sane values — a stranger in the room shouldn't be able to break the renderer.
function cleanConfig(c, name) {
  c = c && typeof c === 'object' ? c : {};
  const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const D = DEFAULT_AVATAR;
  return {
    name,
    skin: col(c.skin, D.skin), hairStyle: pick(c.hairStyle, HAIR_STYLES, D.hairStyle), hairColor: col(c.hairColor, D.hairColor),
    outfit: pick(c.outfit, OUTFITS, D.outfit), topColor: col(c.topColor, D.topColor), bottomColor: col(c.bottomColor, D.bottomColor),
    shoeColor: col(c.shoeColor, D.shoeColor), accessory: pick(c.accessory, ACCESSORIES, D.accessory), accessoryColor: col(c.accessoryColor, D.accessoryColor),
    held: pick(c.held, HELD, D.held ?? 'none'),
  };
}
function tagColor(hex) {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (lum < 0.45) c.lerp(new THREE.Color('#ffffff'), 0.45);
  return '#' + c.getHexString();
}
// Floating name tag (same look as the NPC tags): rounded pill with the name in the player's top colour.
function makeNameTag(name, color) {
  const w = 512, h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.6, 2.6 * (h / w), 1);
  function redraw(name, color) {
    ctx.clearRect(0, 0, w, h);
    const r = 44, pad = 24;
    ctx.fillStyle = 'rgba(20, 24, 40, 0.72)';
    ctx.beginPath(); ctx.roundRect(pad, 30, w - pad * 2, h - 60, r); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.stroke();
    let size = 62;
    const font = (s) => `bold ${s}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
    ctx.font = font(size);
    const maxW = w - pad * 2 - 40;
    while (size > 30 && ctx.measureText(name).width > maxW) { size -= 4; ctx.font = font(size); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(name, w / 2, h / 2 + 2);
    ctx.fillStyle = color; ctx.fillText(name, w / 2, h / 2 + 2);
    tex.needsUpdate = true;
  }
  redraw(name, color);
  sprite.userData.redraw = redraw;
  return sprite;
}

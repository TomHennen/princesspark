// "Play together" room-code UI. Self-contained DOM under #ui-root with its own styles; talks only to `net`
// (src/net/net.js) and reads the game's CSS variables so it matches the rest of the HUD.
import { randomRoomCode, normalizeCode } from './code.js';

const CSS = `
.pk-net-btn { position: absolute; right: calc(14px + var(--sar, 0px)); top: calc(12px + var(--sat, 0px) + 54px); height: 42px; padding: 0 14px 0 10px; display: inline-flex; align-items: center; gap: 7px; border-radius: 16px; background: var(--panel, rgba(255,255,255,0.86)); color: var(--ink, #1b2430); font-size: 15px; font-weight: 900; box-shadow: var(--shadow-sm, 0 4px 12px rgba(20,40,30,0.18)), inset 0 -3px 0 rgba(0,0,0,0.08); transition: transform 0.08s ease; }
.pk-net-btn:hover { transform: translateY(-1px); }
.pk-net-btn:active { transform: translateY(2px) scale(0.98); }
.pk-net-btn .pk-ico { font-size: 19px; }
.pk-net-btn.joined { background: var(--green, #0b5d3b); color: var(--yellow, #f9d71c); box-shadow: 0 5px 0 #063f27, var(--shadow-sm, 0 4px 12px rgba(20,40,30,0.18)); }
.pk-net-btn.joined .pk-dot { width: 9px; height: 9px; border-radius: 50%; background: #39d98a; box-shadow: 0 0 8px #39d98a; }
.pk-net-btn.joined.waiting .pk-dot { background: var(--yellow, #f9d71c); box-shadow: none; animation: pk-blink 1.2s ease-in-out infinite; }
.pk-net-btn.error .pk-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--pink, #ff6fb5); }
@keyframes pk-blink { 50% { opacity: 0.3; } }
.hk-frozen .pk-net-btn { display: none; }
.pk-net-overlay[hidden] { display: none; }
.pk-net-overlay { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(11, 40, 30, 0.55); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); padding: 16px; box-sizing: border-box; z-index: 30; }
.pk-net-card { width: min(440px, 100%); max-height: 100%; overflow: auto; background: var(--panel, rgba(255,255,255,0.92)); border-radius: 24px; padding: 22px 24px 20px; box-shadow: var(--shadow, 0 8px 24px rgba(20,40,30,0.22)); position: relative; box-sizing: border-box; font-weight: 700; }
.pk-net-card h2 { margin: 0 0 8px; color: var(--green, #0b5d3b); font-size: 26px; font-weight: 900; padding-right: 44px; }
.pk-net-card p { margin: 0 0 14px; font-size: 15px; line-height: 1.4; color: var(--ink, #1b2430); }
.pk-net-card .pk-close { position: absolute; right: 12px; top: 12px; width: 44px; height: 44px; border-radius: 50%; background: #fff; color: var(--ink, #1b2430); font-size: 20px; font-weight: 900; box-shadow: var(--shadow-sm, 0 4px 12px rgba(20,40,30,0.18)); }
.pk-net-code { display: block; width: 100%; box-sizing: border-box; height: 72px; margin: 0 0 12px; border: 4px solid var(--green, #0b5d3b); border-radius: 18px; background: #fff; color: var(--green, #0b5d3b); font-size: 40px; font-weight: 900; letter-spacing: 0.45em; text-indent: 0.45em; text-align: center; text-transform: uppercase; outline: none; }
.pk-net-code:focus { border-color: var(--pink, #ff6fb5); box-shadow: 0 0 0 4px rgba(255, 111, 181, 0.3); }
.pk-net-code::placeholder { color: #b9c4bf; letter-spacing: 0.45em; }
.pk-net-row { display: flex; gap: 10px; flex-wrap: wrap; }
.pk-net-row button { flex: 1 1 140px; min-height: 52px; border-radius: 18px; font-size: 18px; font-weight: 900; padding: 0 16px; transition: transform 0.08s ease; }
.pk-net-row .green { background: var(--green, #0b5d3b); color: var(--yellow, #f9d71c); box-shadow: 0 6px 0 #063f27; }
.pk-net-row .green:active { box-shadow: 0 2px 0 #063f27; transform: translateY(4px); }
.pk-net-row .yellow { background: var(--yellow, #f9d71c); color: var(--green, #0b5d3b); box-shadow: 0 5px 0 #c9a90a; }
.pk-net-row .yellow:active { box-shadow: 0 1px 0 #c9a90a; transform: translateY(4px); }
.pk-net-row .pink { background: var(--pink, #ff6fb5); color: #fff; box-shadow: 0 5px 0 #c74b86; }
.pk-net-row .pink:active { box-shadow: 0 1px 0 #c74b86; transform: translateY(4px); }
.pk-net-row .plain { background: #fff; color: var(--ink, #1b2430); box-shadow: 0 4px 0 #cfd6dc; }
.pk-net-status { min-height: 22px; margin: 12px 0 0; font-size: 15px; color: var(--green, #0b5d3b); }
.pk-net-status.error { color: #c0392b; }
.pk-net-status.waiting::after { content: '…'; }
.pk-net-room { display: flex; align-items: center; gap: 12px; margin: 4px 0 16px; padding: 12px 16px; border-radius: 18px; background: var(--green, #0b5d3b); color: #fff; }
.pk-net-room .pk-big { font-size: 34px; font-weight: 900; letter-spacing: 0.2em; color: var(--yellow, #f9d71c); }
.pk-net-room .pk-sub { font-size: 15px; opacity: 0.95; }
.pk-net-card .pk-hint { margin: 12px 0 0; font-size: 13px; color: #556; font-weight: 600; }
@media (max-width: 480px) {
  .pk-net-btn .pk-txt { display: none; }
  .pk-net-btn { padding: 0 11px; }
  .pk-net-card { padding: 18px 16px 16px; }
  .pk-net-card h2 { font-size: 22px; }
  .pk-net-code { height: 64px; font-size: 34px; }
}
`;

export function createLobby(game, net) {
  const root = document.getElementById('ui-root') || document.body;
  const style = document.createElement('style');
  style.id = 'pk-net-style'; style.textContent = CSS;
  document.head.appendChild(style);

  const btn = el('button', 'pk-net-btn');
  btn.title = 'Play together with friends';
  btn.setAttribute('aria-label', 'Play together');
  root.appendChild(btn);

  const overlay = el('div', 'pk-net-overlay');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="pk-net-card" role="dialog" aria-label="Play together">
      <button class="pk-close" aria-label="Close">✕</button>
      <h2>👥 Play together</h2>
      <div class="pk-net-body"></div>
    </div>`;
  root.appendChild(overlay);
  const body = overlay.querySelector('.pk-net-body');

  let open = false, frozeIt = false;
  const lobby = { open: show, close: hide, destroy };

  btn.addEventListener('click', () => (open ? hide() : show()));
  overlay.querySelector('.pk-close').addEventListener('click', hide);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
  const onKey = (e) => { if (open && e.code === 'Escape') { e.stopPropagation(); hide(); } };
  window.addEventListener('keydown', onKey, true);
  const offs = [
    game.events.on('net:peers', render),
    game.events.on('net:status', render),
  ];
  render();
  return lobby;

  function show() {
    if (open) return; open = true;
    overlay.hidden = false;
    // Hold the player still while typing. Prefer the UI's lock so dialogues and this card don't fight.
    if (game.ui?.lock) game.ui.lock('net'); else if (game.player) { frozeIt = !game.player.frozen; game.player.frozen = true; }
    render();
    game.audio?.play?.('click');
  }
  function hide() {
    if (!open) return; open = false;
    overlay.hidden = true;
    if (game.ui?.unlock) game.ui.unlock('net'); else if (frozeIt && game.player) { game.player.frozen = false; frozeIt = false; }
    render();
  }
  function destroy() { hide(); offs.forEach((f) => f()); window.removeEventListener('keydown', onKey, true); btn.remove(); overlay.remove(); style.remove(); }

  function render() {
    const code = net.roomCode, others = net.peers.size;
    // pill button
    btn.className = 'pk-net-btn' + (code ? (net.status === 'error' ? ' error' : others ? ' joined' : ' joined waiting') : '');
    btn.innerHTML = code
      ? `<span class="pk-dot"></span><span class="pk-ico">👥</span><span class="pk-txt">${esc(code)} · ${others + 1}</span>`
      : `<span class="pk-ico">👥</span><span class="pk-txt">Play together</span>`;
    if (!open) return;
    // card
    if (code) {
      const playing = others + 1;
      const statusLine = net.status === 'error'
        ? `<p class="pk-net-status error">${esc(net.error || "Can't reach the room service here")}</p>`
        : others
          ? `<p class="pk-net-status">${others === 1 ? 'A friend is here!' : `${others} friends are here!`} Walk around and find them.</p>`
          : `<p class="pk-net-status waiting">${net.status === 'joined' ? 'Waiting for friends to type this code' : 'Connecting'}</p>`;
      body.innerHTML = `
        <p>Everyone types the same room code to play in the same park.</p>
        <div class="pk-net-room"><div class="pk-big">${esc(code)}</div><div class="pk-sub">Room ${esc(code)} · ${playing} playing</div></div>
        ${statusLine}
        <div class="pk-net-row" style="margin-top:14px"><button class="pink pk-leave">Leave</button><button class="plain pk-done">Close</button></div>
        <p class="pk-hint">Share the code (or this page's link with <b>?room=${esc(code)}</b>) with your friends.</p>`;
      body.querySelector('.pk-leave').addEventListener('click', () => { net.leave(); render(); });
      body.querySelector('.pk-done').addEventListener('click', hide);
      return;
    }
    const prev = body.querySelector('.pk-net-code')?.value || '';
    body.innerHTML = `
      <p>Everyone types the same room code to play in the same park. Pick a code, tell your friends, and they type it in too.</p>
      <input class="pk-net-code" type="text" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text" aria-label="Room code">
      <div class="pk-net-row"><button class="green pk-join">Join room</button><button class="yellow pk-new">New code</button></div>
      <p class="pk-net-status${net.status === 'error' ? ' error' : ''}">${net.status === 'error' ? esc(net.error) : ''}</p>
      <p class="pk-hint">No accounts and no chat: only where everyone is and what they look like is shared.</p>`;
    const input = body.querySelector('.pk-net-code');
    input.value = normalizeCode(prev);
    input.addEventListener('input', () => { const v = normalizeCode(input.value); if (input.value !== v) input.value = v; });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') tryJoin(); });
    body.querySelector('.pk-join').addEventListener('click', tryJoin);
    body.querySelector('.pk-new').addEventListener('click', () => { input.value = randomRoomCode(); input.focus(); game.audio?.play?.('click'); });
    setTimeout(() => input.focus(), 30);
    function tryJoin() {
      const code = normalizeCode(input.value);
      if (code.length !== 4) { setStatusText('Room codes are 4 letters, like KPRT', true); input.focus(); return; }
      game.audio?.play?.('click');
      net.join(code);
      render();
    }
    function setStatusText(text, error) { const s = body.querySelector('.pk-net-status'); if (s) { s.textContent = text; s.classList.toggle('error', !!error); } }
  }
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

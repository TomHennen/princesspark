// Room codes: 4 uppercase letters. Random ones use consonants only so they never spell a word.
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';
export const CODE_RE = /^[A-Z]{4}$/;
export function randomRoomCode() {
  let s = ''; for (let i = 0; i < 4; i++) s += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return s;
}
export function normalizeCode(v) { return String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }

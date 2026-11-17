// Jam Room: WorkinWithAI / Pipe Dreams Studio. A practice band built from the best parts of the bar desks.
// Real samples only: PorchBand's bundled CC0 instruments and kit, plus FluidR3 GM (MIT) from a pinned commit.
'use strict';
const APP = 'jamroom';
const SR = 48000, LOOKAHEAD_MS = 25, SCHEDULE_AHEAD = 0.12, MAX_SHIFT = 4;
const NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']; // FluidR3 sample file names use flats
const SF_SHA = '044fab8e1456bfafc5776e86dfd6bb8697149aef'; // pinned commit, never a branch
const SF = `https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@${SF_SHA}/FluidR3_GM`;
const SF_MIRROR = `https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${SF_SHA}/FluidR3_GM`;
const pc = x => ((x % 12) + 12) % 12;
const fold = (n, lo, hi) => { while (n < lo) n += 12; while (n > hi) n -= 12; return n; };

// ---------- instruments ----------
// Bundled with PorchBand (CC0, see ../samples/CREDITS.md)
const LOCAL = {
  upiano: { label: 'Upright piano', roots: [41,45,49,53,57,61,65,69,73,77], file: n => `../samples/piano_${n}.flac`, rel: 0.12 },
  porgan: { label: 'Pipe organ', roots: [54,57,60,63,66,69,72,75], file: n => `../samples/organ_${n}.flac`, rel: 0.2, sus: true },
  ubass:  { label: 'Upright bass', roots: [28,30,31,34,36,38,40,42,44,45,49,52,56], file: n => `../samples/bass_${n}.flac`, rel: 0.06 },
};
// FluidR3 GM, one sample every 4 semitones (shift at most ±2), loaded the first time a row uses it
const FLUID = {
  grand:   { label: 'Grand piano', dir: 'acoustic_grand_piano', lo: 36, hi: 88 },
  rhodes:  { label: 'Rhodes (electric piano)', dir: 'electric_piano_1', lo: 36, hi: 84 },
  b3:      { label: 'Drawbar organ (B3 style)', dir: 'drawbar_organ', lo: 36, hi: 84, sus: true },
  fbass:   { label: 'Finger bass', dir: 'electric_bass_finger', lo: 28, hi: 56 },
  nylon:   { label: 'Nylon guitar', dir: 'acoustic_guitar_nylon', lo: 40, hi: 76 },
  steel:   { label: 'Steel-string acoustic', dir: 'acoustic_guitar_steel', lo: 40, hi: 76 },
  muted:   { label: 'Muted electric guitar', dir: 'electric_guitar_muted', lo: 40, hi: 76 },
  strings: { label: 'String section', dir: 'string_ensemble_1', lo: 40, hi: 84, sus: true },
  choir:   { label: 'Choir aahs', dir: 'choir_aahs', lo: 40, hi: 84, sus: true },
  brass:   { label: 'Horn section', dir: 'brass_section', lo: 40, hi: 80 },
  trumpet: { label: 'Trumpet', dir: 'trumpet', lo: 52, hi: 82 },
  vibes:   { label: 'Vibraphone', dir: 'vibraphone', lo: 48, hi: 84 },
};
// Acoustic kit: Virtuosity Drums (CC0)
const KIT = {
  kick:  { file: '../samples/kick.flac', gm: 36, len: 0.8, gain: 1 },
  snare: { file: '../samples/snare.flac', gm: 38, len: 0.8, gain: 0.85 },
  ghost: { file: '../samples/drums/ghost.flac', gm: 40, len: 0.4, gain: 0.45 },
  rim:   { file: '../samples/drums/rim.flac', gm: 37, len: 0.4, gain: 0.6 },
  hat:   { file: '../samples/hat.flac', gm: 42, len: 0.25, gain: 0.45 },
  ohat:  { file: '../samples/drums/ohat.flac', gm: 46, len: 0.9, gain: 0.35 },
  ride:  { file: '../samples/ride.flac', gm: 51, len: 2.0, gain: 0.45 },
};
function sampleList(inst){
  if (inst === 'kit') return Object.entries(KIT).map(([k, v]) => ({ root: k, url: v.file }));
  if (LOCAL[inst]) return LOCAL[inst].roots.map(r => ({ root: r, url: LOCAL[inst].file(r) }));
  const d = FLUID[inst], out = [];
  for (let n = d.lo; n <= d.hi; n += 4) {
    const name = FLAT[pc(n)] + (Math.floor(n / 12) - 1);
    out.push({ root: n, url: `${SF}/${d.dir}-mp3/${name}.mp3`, alt: `${SF_MIRROR}/${d.dir}-mp3/${name}.mp3` });
  }
  return out;
}
const instLabel = i => i === 'kit' ? 'Acoustic drum kit' : (LOCAL[i] || FLUID[i]).label;
const instInfo = i => LOCAL[i] || FLUID[i] || {};

// ---------- theory ----------
const QUAL = { '': [0,4,7], M: [0,4,7], m: [0,3,7], min: [0,3,7], '7': [0,4,7,10], m7: [0,3,7,10], maj7: [0,4,7,11], m7b5: [0,3,6,10],
  dim: [0,3,6], dim7: [0,3,6,9], aug: [0,4,8], sus2: [0,2,7], sus4: [0,5,7], '6': [0,4,7,9], m6: [0,3,7,9], add9: [0,4,7,14], '9': [0,4,7,10,14] };
const ROOT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parseChord(s){
  const m = /^([A-G])(#|b)?(maj7|m7b5|min|m7|m6|m|dim7|dim|aug|sus2|sus4|add9|7|6|9|M)?$/.exec(s.trim()); if (!m) return null;
  const r = ROOT[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root: pc(r), ivs: QUAL[m[3] || ''], suffix: m[3] || '', minor: /^m(?!aj)|min|dim/.test(m[3] || '') };
}
function parseProg(str){ const t = String(str).trim().split(/[\s,|]+/).filter(Boolean); if (t.length < 1 || t.length > 8) return null; const c = t.map(parseChord); return c.includes(null) ? null : c; }

// ---------- band: rows, parts, styles ----------
const ROWS = [
  { id: 'drums',  label: 'Drums',  sounds: ['kit'] },
  { id: 'bass',   label: 'Bass',   sounds: ['ubass', 'fbass'] },
  { id: 'keys',   label: 'Keys',   sounds: ['upiano', 'grand', 'rhodes', 'b3', 'porgan'] },
  { id: 'guitar', label: 'Guitar', sounds: ['nylon', 'steel', 'muted'] },
  { id: 'color',  label: 'Color',  sounds: ['strings', 'choir', 'brass', 'trumpet', 'vibes'] },
];
const PART_LABELS = {
  drums:  { pocket: 'Straight pocket', folk: 'Folk', ballad: 'Ballad (cross-stick, ride)', motown: 'Motown (snare on every beat)', ghost: 'Funk ghost notes',
            halftime: 'Half-time', clave: 'Clave 3-2', boomchick: 'Boom-chick', shuffle: 'Shuffle', off: 'Off' },
  bass:   { root8: 'Roots (8ths)', rootfive: 'Root and fifth', octave: 'Octave bounce', walk: 'Walking', pedal: 'Pedal point', push: 'Push (anticipate the change)',
            motown: 'Motown line', off: 'Off' },
  keys:   { hold: 'Held chords', quarters: 'Quarter-note chords', offbeat: 'Offbeat stabs', comp: 'Syncopated comp', arp: 'Arpeggio (8ths)', off: 'Off' },
  guitar: { strum: 'Strum (8ths)', finger: 'Fingerstyle', chicka: 'Chicka (muted offbeats)', boomchick: 'Boom-chick', off: 'Off' },
  color:  { pad: 'Pad', stabs: 'Stabs (and of 2 and 4)', answer: 'Answer line', bell: 'Bell tones', off: 'Off' },
};
const STYLES = {
  porch:    { label: 'Porch (PorchBand band)', bpm: 92,  swing: 0,    rows: { drums: ['kit','folk'], bass: ['ubass','rootfive'], keys: ['upiano','quarters'], guitar: ['nylon','off'], color: ['strings','off'] } },
  motown:   { label: 'Motown',                 bpm: 104, swing: 0,    rows: { drums: ['kit','motown'], bass: ['fbass','motown'], keys: ['rhodes','comp'], guitar: ['muted','chicka'], color: ['brass','stabs'] } },
  folk:     { label: 'Folk strum',             bpm: 96,  swing: 0,    rows: { drums: ['kit','folk'], bass: ['ubass','rootfive'], keys: ['upiano','hold'], guitar: ['steel','strum'], color: ['strings','off'] } },
  country:  { label: 'Country boom-chick',     bpm: 112, swing: 0,    rows: { drums: ['kit','boomchick'], bass: ['ubass','rootfive'], keys: ['upiano','offbeat'], guitar: ['steel','boomchick'], color: ['strings','off'] } },
  blues:    { label: 'Blues shuffle',          bpm: 84,  swing: 0.66, rows: { drums: ['kit','shuffle'], bass: ['ubass','walk'], keys: ['b3','hold'], guitar: ['muted','chicka'], color: ['brass','off'] } },
  latin:    { label: 'Latin clave',            bpm: 98,  swing: 0,    rows: { drums: ['kit','clave'], bass: ['fbass','push'], keys: ['grand','comp'], guitar: ['nylon','finger'], color: ['vibes','bell'] } },
  ballad:   { label: 'Half-time ballad',       bpm: 68,  swing: 0,    rows: { drums: ['kit','ballad'], bass: ['ubass','rootfive'], keys: ['grand','hold'], guitar: ['nylon','finger'], color: ['strings','pad'] } },
  church:   { label: 'Church',                 bpm: 72,  swing: 0,    rows: { drums: ['kit','ballad'], bass: ['ubass','pedal'], keys: ['porgan','hold'], guitar: ['nylon','off'], color: ['choir','pad'] } },
  funk:     { label: 'Funk ghost-note',        bpm: 100, swing: 0,    rows: { drums: ['kit','ghost'], bass: ['fbass','octave'], keys: ['rhodes','offbeat'], guitar: ['muted','chicka'], color: ['brass','stabs'] } },
  halftime: { label: 'Half-time groove',       bpm: 140, swing: 0,    rows: { drums: ['kit','halftime'], bass: ['fbass','root8'], keys: ['rhodes','hold'], guitar: ['steel','off'], color: ['strings','pad'] } },
};

// One bar is 16 steps. Each part returns the notes it plays on step s. Drums return kit piece names as notes.
const D = (note, vel, dur = 1) => ({ note, vel, dur });
const DRUMS = {
  pocket: s => [...([0,8,10].includes(s) ? [D('kick', s === 0 ? 1 : 0.8)] : []), ...(s === 4 || s === 12 ? [D('snare', 0.9)] : []), ...(s % 2 === 0 ? [D('hat', s % 4 === 0 ? 0.7 : 0.45)] : [])],
  folk: s => [...([0,6,8].includes(s) ? [D('kick', s === 0 ? 1 : 0.75)] : []), ...(s === 4 || s === 12 ? [D('snare', 0.7)] : []), ...(s % 2 === 0 ? [D('hat', s % 4 === 0 ? 0.6 : 0.4)] : [])],
  ballad: s => [...(s === 0 || s === 8 ? [D('kick', 0.85)] : []), ...(s === 4 || s === 12 ? [D('rim', 0.8)] : []), ...(s % 4 === 0 ? [D('ride', 0.5)] : [])],
  motown: s => [...([0,8,10].includes(s) ? [D('kick', 0.9)] : []), ...(s % 4 === 0 ? [D('snare', s === 4 || s === 12 ? 0.9 : 0.45)] : []), ...(s % 2 === 0 ? [D('hat', 0.4)] : [])],
  ghost: s => [...([0,3,10].includes(s) ? [D('kick', 0.95)] : []), ...(s === 4 || s === 12 ? [D('snare', 0.95)] : []), ...([2,7,9,14,15].includes(s) ? [D('ghost', 0.5)] : []), D('hat', s % 2 === 0 ? 0.5 : 0.28)],
  halftime: s => [...(s === 0 || s === 11 ? [D('kick', 1)] : []), ...(s === 8 ? [D('snare', 1)] : []), ...(s % 2 === 0 ? [D('hat', s % 4 === 0 ? 0.6 : 0.4)] : []), ...(s === 14 ? [D('ohat', 0.5)] : [])],
  clave: (s, cx) => { const hits = cx.bar % 2 === 0 ? [0,6,12] : [4,8];
    return [...(hits.includes(s) ? [D('rim', 0.85)] : []), ...(s === 0 || s === 8 ? [D('kick', 0.7)] : []), ...(s % 2 === 0 ? [D('hat', 0.3)] : [])]; },
  boomchick: s => [...(s === 0 || s === 8 ? [D('kick', 0.95)] : []), ...(s === 4 || s === 12 ? [D('snare', 0.8)] : []), ...(s % 2 === 0 ? [D('hat', 0.35)] : [])],
  shuffle: s => [...(s === 0 || s === 8 ? [D('kick', 0.9)] : []), ...(s === 4 || s === 12 ? [D('snare', 0.85)] : []), ...(s % 2 === 0 && s % 4 !== 0 ? [D('ride', 0.35)] : []), ...(s % 4 === 0 ? [D('ride', 0.5)] : [])],
  off: () => [],
};
// cx: { root (bass pitch class), ivs, next (next chord root pc), keyRoot, bar }
const tones = (cx, lo, hi) => cx.ivs.slice(0, 4).map(iv => fold(lo + pc(cx.root + iv - lo), lo, hi)).sort((a, b) => a - b);
const bassNote = (cx, p = cx.root) => fold(28 + pc(p - 28), 28, 39);
const N = (note, vel, dur) => ({ note, vel, dur });
const BASS = {
  root8: (s, cx) => s % 2 === 0 ? [N(bassNote(cx), s % 4 === 0 ? 1 : 0.8, 2)] : [],
  rootfive: (s, cx) => s === 0 ? [N(bassNote(cx), 1, 7)] : s === 8 ? [N(bassNote(cx) + 7, 0.85, 7)] : [],
  octave: (s, cx) => s % 2 === 0 ? [N(bassNote(cx) + ((s / 2) % 2 ? 12 : 0), 0.9, 2)] : [],
  walk: (s, cx) => { if (s % 4) return []; const b = bassNote(cx), q = s / 4, nx = bassNote(cx, cx.next);
    return [N(q === 0 ? b : q === 1 ? b + cx.ivs[1] : q === 2 ? b + cx.ivs[2] : (nx > b ? nx - 1 : nx + 1), q === 0 ? 1 : 0.85, 4)]; },
  pedal: (s, cx) => s === 0 ? [N(fold(28 + pc(cx.keyRoot - 28), 28, 39), 0.95, 15)] : s === 8 ? [N(fold(28 + pc(cx.keyRoot - 28), 28, 39), 0.7, 8)] : [],
  push: (s, cx) => s === 0 ? [N(bassNote(cx), 1, 6)] : s === 6 ? [N(bassNote(cx) + 7, 0.8, 4)] : s === 14 ? [N(bassNote(cx, cx.next), 0.95, 2)] : [],
  motown: (s, cx) => { const b = bassNote(cx); const m = { 0: [b, 1, 3], 3: [b + 12, 0.75, 2], 6: [b + 7, 0.8, 2], 8: [b, 0.9, 2], 10: [b + 12, 0.75, 2], 14: [(n => n > b ? n - 1 : n + 1)(bassNote(cx, cx.next)), 0.7, 2] }[s];
    return m ? [N(m[0], m[1], m[2])] : []; },
  off: () => [],
};
const chord = (cx, lo, hi, vel, dur) => tones(cx, lo, hi).map(n => N(n, vel, dur));
const KEYS = {
  hold: (s, cx) => s === 0 ? [N(fold(43 + pc(cx.root - 43), 43, 54), 0.7, 16), ...chord(cx, 55, 70, 0.6, 16)] : [],
  quarters: (s, cx) => s % 4 === 0 ? chord(cx, 55, 70, s === 0 ? 0.7 : 0.55, 3) : [],
  offbeat: (s, cx) => s % 4 === 2 ? chord(cx, 57, 72, 0.6, 1) : [],
  comp: (s, cx) => s === 0 ? chord(cx, 55, 70, 0.7, 3) : s === 6 ? chord(cx, 55, 70, 0.6, 2) : s === 12 ? chord(cx, 55, 70, 0.55, 2) : [],
  arp: (s, cx) => { if (s % 2) return []; const t = tones(cx, 55, 72); const seq = [...t, ...t.slice(1, -1).reverse()]; return [N(seq[(s / 2) % seq.length], 0.6, 2)]; },
  off: () => [],
};
const GUITAR = {
  strum: (s, cx) => s % 2 === 0 ? chord(cx, 52, 71, s % 4 === 0 ? 0.65 : 0.45, 2) : [],
  finger: (s, cx) => { const t = tones(cx, 55, 72), b = fold(40 + pc(cx.root - 40), 40, 51);
    const pat = { 0: b, 2: t[1], 4: t[2], 6: t[t.length - 1], 8: b + 7 > 52 ? b : b + 7, 10: t[1], 12: t[2], 14: t[0] }[s];
    return pat !== undefined ? [N(pat, s % 8 === 0 ? 0.75 : 0.55, 4)] : []; },
  chicka: (s, cx) => s === 4 || s === 12 ? chord(cx, 55, 70, 0.7, 1) : s % 4 === 2 ? chord(cx, 55, 70, 0.4, 1) : [],
  boomchick: (s, cx) => { const b = fold(40 + pc(cx.root - 40), 40, 51);
    return s === 0 ? [N(b, 0.8, 4)] : s === 8 ? [N(fold(b + 7, 40, 55), 0.75, 4)] : (s === 4 || s === 12) ? chord(cx, 55, 70, 0.55, 2) : []; },
  off: () => [],
};
const COLOR = {
  pad: (s, cx) => s === 0 ? chord(cx, 60, 76, 0.45, 16) : [],
  stabs: (s, cx) => s === 6 || s === 14 ? chord(cx, 60, 76, 0.7, 1) : [],
  answer: (s, cx) => { const t = tones(cx, 64, 79); return s === 8 ? [N(t[1], 0.6, 3)] : s === 12 ? [N(t[2] || t[0] + 7, 0.6, 4)] : []; },
  bell: (s, cx) => { if (s % 4) return []; const t = tones(cx, 67, 84); return [N(t[(s / 4) % t.length], 0.5, 4)]; },
  off: () => [],
};
const PARTS = { drums: DRUMS, bass: BASS, keys: KEYS, guitar: GUITAR, color: COLOR };

// ---------- state ----------
const DEFAULT = { style: 'porch', bpm: 92, keyRoot: 0, chords: 'C G Am F', loopLen: 4, loopFrom: 1, loopTo: 4, myPart: '', countIn: true,
  rows: {}, mutes: {}, gains: { drums: 0.9, bass: 0.9, keys: 0.7, guitar: 0.6, color: 0.45 },
  trainer: false, trainStart: 70, trainTarget: 92, trainStep: 2 };
function loadState(){ try { return JSON.parse(localStorage.getItem(APP + '-settings') || '{}') || {}; } catch (e) { return {}; } }
const state = Object.assign({}, DEFAULT, loadState());
state.gains = Object.assign({}, DEFAULT.gains, state.gains); state.mutes = Object.assign({}, state.mutes);
function applyStyleRows(id){ const st = STYLES[id] || STYLES.porch; state.rows = {}; for (const r of ROWS) state.rows[r.id] = { sound: st.rows[r.id][0], part: st.rows[r.id][1] }; }
if (!state.rows || !ROWS.every(r => state.rows[r.id] && PARTS[r.id][state.rows[r.id].part] && r.sounds.includes(state.rows[r.id].sound))) applyStyleRows(state.style);
function save(){ try { localStorage.setItem(APP + '-settings', JSON.stringify(state)); } catch (e) {} }
let prog = parseProg(state.chords) || parseProg(DEFAULT.chords);
let moveShift = 0;                       // half steps added by "Key up"
const swing = () => (STYLES[state.style] || {}).swing || 0;
const shiftT = () => pc(state.keyRoot - prog[0].root) + moveShift; // chord 1 lands on the chosen key
const chordAt = bar => prog[bar % prog.length];
function chordName(bar, extra = 0){ const c = chordAt(bar); return NAMES[pc(c.root + shiftT() + extra)] + c.suffix; }
function ctxFor(bar){ const c = chordAt(bar), n = chordAt(bar + 1), t = shiftT();
  return { root: pc(c.root + t), ivs: c.ivs, next: pc(n.root + t), keyRoot: pc(state.keyRoot + moveShift), bar }; }
function rowSilent(id){ return !!state.mutes[id] || state.myPart === id; }

// stepEvents: what the whole band plays on step s of a bar, given the live move for that bar.
function stepEvents(s, bar, move){
  const cx = ctxFor(bar), out = [];
  for (const r of ROWS) {
    if (rowSilent(r.id)) continue;
    const cfg = state.rows[r.id]; let evs;
    if (move === 'stop') { evs = s === 0 ? PARTS[r.id][cfg.part](0, cx).map(e => Object.assign({}, e, { dur: Math.min(e.dur, 2) })) : []; }
    else if (move === 'break' && (r.id === 'keys' || r.id === 'guitar' || r.id === 'color')) evs = [];
    else if (r.id === 'drums' && move === 'break') evs = [...(s === 0 || s === 8 ? [D('kick', 0.9)] : []), ...(s % 2 === 0 ? [D('hat', 0.4)] : [])];
    else if (r.id === 'drums' && move === 'fill' && s >= 8) evs = [D('snare', 0.35 + 0.65 * (s - 8) / 7), ...(s === 8 ? [D('kick', 0.9)] : [])];
    else if (r.id === 'drums' && move === 'build') evs = [...(s % 4 === 0 ? [D('kick', 0.95)] : []), D('hat', 0.3 + 0.3 * s / 15),
      ...((s < 8 ? s % 2 === 0 : true) ? [D('snare', 0.3 + 0.7 * s / 15)] : [])];
    else evs = PARTS[r.id][cfg.part](s, cx);
    for (const e of evs) out.push(Object.assign({ row: r.id, inst: cfg.sound }, e));
  }
  return out;
}

// ---------- sample loading ----------
let ctx = null, master = null, chairs = {};
const bufs = {}, instStatus = {}, instMissing = {}, instLoads = {};
async function fetchBuf(u){
  for (const url of [u.url, u.alt].filter(Boolean)) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const ab = await r.arrayBuffer(); return await ctx.decodeAudioData(ab); } catch (e) {}
  }
  throw new Error('missing ' + u.url.split('/').pop());
}
function ensureInst(inst){
  if (instLoads[inst]) return instLoads[inst];
  instStatus[inst] = 'loading'; instMissing[inst] = []; bufs[inst] = {}; showLoad();
  instLoads[inst] = Promise.all(sampleList(inst).map(async u => {
    try { bufs[inst][u.root] = await fetchBuf(u); } catch (e) { instMissing[inst].push(String(u.root)); }
  })).then(() => { instStatus[inst] = instMissing[inst].length ? 'missing' : 'ready'; showLoad(); renderBand(); });
  return instLoads[inst];
}
const neededInsts = () => [...new Set(ROWS.filter(r => state.rows[r.id].part !== 'off').map(r => state.rows[r.id].sound))];
function loadNeeded(){ if (!ctx) return Promise.resolve(); return Promise.all(neededInsts().map(ensureInst)); }
function showLoad(){
  const el = document.getElementById('loadStatus'); if (!el) return;
  const need = neededInsts(), loading = need.filter(i => instStatus[i] === 'loading'), miss = need.filter(i => instStatus[i] === 'missing');
  if (!ctx) { el.className = 'load'; el.textContent = 'Tap to start audio and load the band.'; }
  else if (loading.length) { el.className = 'load'; el.textContent = 'Loading ' + loading.map(instLabel).join(', ') + '…'; }
  else if (miss.length) { el.className = 'miss'; el.textContent = 'Some samples did not load, so these stay silent: ' + miss.map(i => instLabel(i) + ' (' + instMissing[i].length + ' notes)').join(', '); }
  else { el.className = 'load'; el.textContent = 'Band ready.'; }
  const b = document.getElementById('play'); if (b) b.disabled = !ctx || instStatus.kit !== 'ready';
}

// ---------- sampler voice ----------
const active = new Set();
// Nearest sample within MAX_SHIFT. A note outside an instrument's range is moved by octaves into it, never stretched.
function resolveNote(inst, note, roots = sampleList(inst).map(u => u.root)){
  if (!roots.length) return null;
  const n = fold(note, Math.min(...roots) - 2, Math.max(...roots) + 2);
  let best = null; for (const r of roots) if (best === null || Math.abs(r - n) < Math.abs(best - n)) best = r;
  return Math.abs(best - n) <= MAX_SHIFT ? { root: best, note: n } : null;
}
function voice(ev, t, stepDur){
  if (!ctx || !bufs[ev.inst]) return;
  const g = ctx.createGain(); g.connect(chairs[ev.row]);
  let buf, rate = 1, end, rel, peak = ev.vel;
  if (ev.inst === 'kit') {
    const k = KIT[ev.note]; buf = bufs.kit[ev.note]; if (!buf) return;
    end = t + Math.min(buf.duration, k.len); rel = 0.03; peak = ev.vel * k.gain; g.gain.setValueAtTime(peak, t);
  } else {
    const hit = resolveNote(ev.inst, ev.note); if (!hit || !bufs[ev.inst][hit.root]) return;
    buf = bufs[ev.inst][hit.root]; rate = Math.pow(2, (hit.note - hit.root) / 12);
    const info = instInfo(ev.inst); rel = info.rel || (info.sus ? 0.25 : 0.12);
    end = Math.min(t + ev.dur * stepDur, t + buf.duration / rate - rel - 0.02);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel, t + (info.sus ? 0.06 : 0.004));
  }
  end = Math.max(end, t + 0.02);
  g.gain.setValueAtTime(peak, end); g.gain.linearRampToValueAtTime(0, end + rel);
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.connect(g); s.start(t); s.stop(end + rel + 0.01);
  active.add(s); s.onended = () => active.delete(s);
}
function buildBus(){
  master = ctx.createDynamicsCompressor(); master.threshold.value = -8; master.knee.value = 6; master.ratio.value = 8; master.attack.value = 0.003; master.release.value = 0.15;
  master.connect(ctx.destination);
  for (const r of ROWS) { const g = ctx.createGain(); g.gain.value = state.gains[r.id]; g.connect(master); chairs[r.id] = g; }
  chairs.live = ctx.createGain(); chairs.live.connect(master);
}

// ---------- transport ----------
let shownBar = 0, timerId = null, nextStepTime = 0, step = 0, bar = 0, countLeft = 0, playing = false, pendingMove = null, curMove = null, pass = 0;
const stepLog = [];
const regionLen = () => state.loopTo - state.loopFrom + 1;
function start(){
  if (!ctx || ctx.state !== 'running' || instStatus.kit !== 'ready') return;
  if (state.trainer) setBpm(state.trainStart);
  step = 0; bar = state.loopFrom - 1; shownBar = bar; pass = 0; curMove = null; pendingMove = null; countLeft = state.countIn ? 16 : 0; stepLog.length = 0;
  nextStepTime = ctx.currentTime + 0.1; playing = true;
  timerId = setInterval(scheduler, LOOKAHEAD_MS); scheduler();
  ui.play.textContent = '■ Stop'; requestAnimationFrame(draw); setStatus(state.countIn ? 'Count-in…' : '');
}
function stop(){
  clearInterval(timerId); timerId = null; playing = false; pendingMove = null; curMove = null; markMoves();
  for (const s of active) { try { s.stop(); } catch (e) {} } active.clear();
  if (ui.play) ui.play.textContent = '▶ Play';
  document.querySelectorAll('.bar').forEach(b => b.classList.remove('on'));
}
function scheduler(){
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    const sd = 60 / state.bpm / 4;
    if (countLeft > 0) {
      const s = 16 - countLeft; if (s % 4 === 0) voice({ row: 'drums', inst: 'kit', note: 'rim', vel: s === 0 ? 1 : 0.7, dur: 1 }, nextStepTime, sd);
      stepLog.push({ time: nextStepTime, bar: -1, step: s }); countLeft--; nextStepTime += sd; continue;
    }
    if (step === 0) {
      curMove = null;
      if (pendingMove === 'keyup') { moveShift++; pendingMove = null; renderGrid(); }
      else if (pendingMove) { curMove = pendingMove; pendingMove = null; }
      markMoves();
    }
    const sw = (step % 4 === 2) ? (swing() - 0.5) * 4 * sd : 0;
    const t = nextStepTime + Math.max(0, sw);
    for (const ev of stepEvents(step, bar, curMove)) voice(ev, t, sd);
    stepLog.push({ time: nextStepTime, bar, step }); if (stepLog.length > 256) stepLog.shift();
    window.__jamLog.push({ bar, step, move: curMove, bpm: state.bpm, n: 0 }); if (window.__jamLog.length > 2000) window.__jamLog.shift();
    nextStepTime += sd; step++;
    if (step === 16) { step = 0; bar++; if (bar > state.loopTo - 1) { bar = state.loopFrom - 1; pass++; onPass(); } }
  }
}
window.__jamLog = [];
function onPass(){
  if (state.trainer && state.bpm < state.trainTarget) { setBpm(Math.min(state.trainTarget, state.bpm + state.trainStep)); setStatus(`Tempo trainer: ${state.bpm} BPM`); }
}
function setBpm(v){ state.bpm = Math.max(40, Math.min(200, Math.round(v))); if (ui.bpm) ui.bpm.value = state.bpm; save(); }
function draw(){
  if (!playing) return; const now = ctx.currentTime; let cur = null;
  for (const e of stepLog) { if (e.time <= now) cur = e; else break; }
  if (cur) {
    if (cur.bar < 0) { ui.chordNow.textContent = String(Math.floor(cur.step / 4) + 1); ui.chordNext.textContent = chordName(state.loopFrom - 1); ui.barNow.textContent = '–'; }
    else {
      const sd = 60 / state.bpm / 4, frac = (cur.step + Math.min(1, (now - cur.time) / sd)) / 16;
      const nb = cur.bar + 1 > state.loopTo - 1 ? state.loopFrom - 1 : cur.bar + 1;
      ui.chordNow.textContent = chordName(cur.bar); ui.chordNext.textContent = chordName(nb, pendingMove === 'keyup' ? 1 : 0); ui.barNow.textContent = cur.bar + 1; shownBar = cur.bar;
      if (status.textContent === 'Count-in…') setStatus('');
      document.querySelectorAll('.bar').forEach((b, i) => { b.classList.toggle('on', i === cur.bar); if (i === cur.bar) b.querySelector('.ph').style.left = (frac * 100) + '%'; });
    }
  }
  requestAnimationFrame(draw);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && playing) { stop(); setStatus('Stopped (tab hidden).'); } });

// ---------- UI ----------
const $ = id => document.getElementById(id);
const ui = {}; for (const id of ['tap','tapBtn','style','bpm','key','chords','chordErr','loopLen','loopFrom','loopTo','myPart','play','countIn','keyReset','status','chordNow','chordNext','barNow','grid','band','trainer','trainStart','trainTarget','trainStep','keysPanel','rigPanel']) ui[id] = $(id);
const status = ui.status;
function setStatus(t){ if (status) status.textContent = t; }
function fillSelect(sel, items, val){ sel.innerHTML = items.map(([v, l]) => `<option value="${v}">${l}</option>`).join(''); sel.value = String(val); }
function renderLoopSelects(){
  const opts = Array.from({ length: state.loopLen }, (_, i) => [i + 1, i + 1]);
  state.loopFrom = Math.min(state.loopFrom, state.loopLen); state.loopTo = Math.max(state.loopFrom, Math.min(state.loopTo, state.loopLen));
  fillSelect(ui.loopFrom, opts, state.loopFrom); fillSelect(ui.loopTo, opts, state.loopTo);
}
let gridClick = null;
function renderGrid(){
  ui.grid.innerHTML = '';
  for (let i = 0; i < state.loopLen; i++) {
    const d = document.createElement('div'); d.className = 'bar' + (i + 1 < state.loopFrom || i + 1 > state.loopTo ? ' out' : '');
    d.innerHTML = `<div class="ph"></div><i>${i + 1}</i><b>${chordName(i)}</b>`;
    d.title = 'Tap a bar to loop just that bar, then tap another bar to loop the bars between them';
    d.addEventListener('click', () => {
      if (gridClick === null) { state.loopFrom = state.loopTo = i + 1; gridClick = i + 1; }
      else { state.loopFrom = Math.min(gridClick, i + 1); state.loopTo = Math.max(gridClick, i + 1); gridClick = null; }
      clampBar(); save(); renderLoopSelects(); renderGrid();
    });
    ui.grid.appendChild(d);
  }
}
function clampBar(){ if (bar < state.loopFrom - 1 || bar > state.loopTo - 1) { bar = state.loopFrom - 1; step = 0; } }
function renderBand(){
  ui.band.innerHTML = '';
  for (const r of ROWS) {
    const cfg = state.rows[r.id], el = document.createElement('div');
    const silent = rowSilent(r.id), miss = instStatus[cfg.sound] === 'missing' && cfg.part !== 'off';
    el.className = 'player' + (silent ? ' muted' : '') + (miss ? ' miss' : '');
    el.innerHTML = `<h4>${r.label}</h4>
      <select class="snd" aria-label="${r.label} sound">${r.sounds.map(s => `<option value="${s}">${instLabel(s)}</option>`).join('')}</select>
      <select class="prt" aria-label="${r.label} part">${Object.entries(PART_LABELS[r.id]).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <button class="mute${state.mutes[r.id] ? ' on' : ''}">${state.mutes[r.id] ? 'Muted' : 'Mute'}</button>
      <input class="vol" type="range" min="0" max="1" step="0.01" aria-label="${r.label} volume" value="${state.gains[r.id]}">
      ${state.myPart === r.id ? '<small style="color:#ffd9b0">You\'re playing this part, so the band leaves it out.</small>' : ''}
      ${miss ? `<small>${instMissing[cfg.sound].length} ${instLabel(cfg.sound)} samples did not load, so some notes are silent.</small>` : ''}`;
    const snd = el.querySelector('.snd'), prt = el.querySelector('.prt');
    snd.value = cfg.sound; prt.value = cfg.part;
    snd.addEventListener('change', () => { cfg.sound = snd.value; save(); loadNeeded(); showLoad(); renderBand(); });
    prt.addEventListener('change', () => { cfg.part = prt.value; save(); loadNeeded(); showLoad(); });
    el.querySelector('.mute').addEventListener('click', () => { state.mutes[r.id] = !state.mutes[r.id]; save(); renderBand(); });
    el.querySelector('.vol').addEventListener('input', e => { state.gains[r.id] = +e.target.value; if (chairs[r.id]) chairs[r.id].gain.value = state.gains[r.id]; save(); });
    ui.band.appendChild(el);
  }
}
function markMoves(){ document.querySelectorAll('[data-move]').forEach(b => b.classList.toggle('queued', b.dataset.move === pendingMove)); }
function initUI(){
  fillSelect(ui.style, Object.entries(STYLES).map(([k, v]) => [k, v.label]), state.style);
  fillSelect(ui.key, NAMES.map((n, i) => [i, n]), state.keyRoot);
  ui.bpm.value = state.bpm; ui.chords.value = state.chords; ui.loopLen.value = String(state.loopLen); ui.myPart.value = state.myPart; ui.countIn.checked = !!state.countIn;
  ui.trainer.checked = !!state.trainer; ui.trainStart.value = state.trainStart; ui.trainTarget.value = state.trainTarget; ui.trainStep.value = state.trainStep;
  renderLoopSelects(); renderGrid(); renderBand(); showLoad();
  ui.style.addEventListener('change', () => { state.style = ui.style.value; applyStyleRows(state.style); setBpm(STYLES[state.style].bpm); save(); loadNeeded(); showLoad(); renderBand(); });
  ui.bpm.addEventListener('change', () => setBpm(+ui.bpm.value || 92));
  ui.key.addEventListener('change', () => { state.keyRoot = +ui.key.value; moveShift = 0; save(); renderGrid(); });
  ui.chords.addEventListener('input', () => { const p = parseProg(ui.chords.value);
    if (!p) { ui.chordErr.textContent = 'Use 1 to 8 chords like C G Am F (m, 7, m7, maj7, dim, sus2, sus4, 6, 9, add9).'; return; }
    ui.chordErr.textContent = ''; prog = p; state.chords = ui.chords.value.trim(); save(); renderGrid(); });
  ui.loopLen.addEventListener('change', () => { state.loopLen = +ui.loopLen.value; state.loopFrom = 1; state.loopTo = state.loopLen; clampBar(); save(); renderLoopSelects(); renderGrid(); });
  ui.loopFrom.addEventListener('change', () => { state.loopFrom = +ui.loopFrom.value; if (state.loopTo < state.loopFrom) state.loopTo = state.loopFrom; clampBar(); save(); renderLoopSelects(); renderGrid(); });
  ui.loopTo.addEventListener('change', () => { state.loopTo = Math.max(state.loopFrom, +ui.loopTo.value); clampBar(); save(); renderLoopSelects(); renderGrid(); });
  ui.myPart.addEventListener('change', () => { state.myPart = ui.myPart.value; save(); renderBand(); });
  ui.countIn.addEventListener('change', () => { state.countIn = ui.countIn.checked; save(); });
  for (const k of ['trainStart', 'trainTarget', 'trainStep']) ui[k].addEventListener('change', () => { state[k] = Math.max(1, +ui[k].value || DEFAULT[k]); save(); });
  ui.trainer.addEventListener('change', () => { state.trainer = ui.trainer.checked; save(); });
  ui.play.addEventListener('click', () => playing ? stop() : start());
  document.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => {
    if (!playing) { setStatus('Press Play first, then use the moves.'); return; }
    pendingMove = pendingMove === b.dataset.move ? null : b.dataset.move; markMoves(); }));
  ui.keyReset.addEventListener('click', () => { moveShift = 0; renderGrid(); });
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); ui.play.click(); } });
  ui.tapBtn.addEventListener('click', async () => {
    try {
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR }); buildBus(); }
      await ctx.resume(); ui.tap.classList.add('hide'); ensureInst('kit'); loadNeeded(); showLoad(); if (keys) keys.ensure();
    } catch (e) { setStatus('Audio could not start: ' + e.message); }
  });
}
initUI();
const player = window.WWInstruments ? WWInstruments.create(() => ctx, '../samples/') : null;
const keys = player && window.WWKeys ? WWKeys.mount(ui.keysPanel, { player, getDest: () => chairs.live, storeKey: APP + '-keys',
  getChordTones: () => { const cx = ctxFor(playing ? shownBar : state.loopFrom - 1); return cx.ivs.map(iv => pc(cx.root + iv)); } }) : null;
const rig = window.WWRig ? WWRig.mount(ui.rigPanel, { getCtx: () => ctx, getBpm: () => state.bpm, onRecordStart: () => { if (!playing) start(); },
  storeKey: APP + '-rig', filePrefix: APP }) : null;
window.__jam = { player, get keys(){ return keys; }, get rig(){ return rig; }, state, stepEvents, sampleList, resolveNote, MAX_SHIFT, STYLES, ROWS, PARTS, parseProg, get prog(){ return prog; }, start, stop, get playing(){ return playing; },
  get ctx(){ return ctx; }, ensureInst, instStatus, setCtx(c){ ctx = c; buildBus(); } };

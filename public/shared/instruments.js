// WorkinWithAI shared playable instruments (PorchBand + Jam Room).
// Real samples only: PorchBand's bundled CC0 instruments and FluidR3 GM (MIT) from a pinned commit.
// A live player: noteOn/noteOff at ctx.currentTime with velocity and sustain-pedal support.
(function(){
  'use strict';
  const SF_SHA = '044fab8e1456bfafc5776e86dfd6bb8697149aef'; // pinned commit, never a branch
  const SF = `https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@${SF_SHA}/FluidR3_GM`;
  const SF_MIRROR = `https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${SF_SHA}/FluidR3_GM`;
  const FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const MAX_SHIFT = 4;
  const pc = x => ((x % 12) + 12) % 12;
  const fold = (n, lo, hi) => { while (n < lo) n += 12; while (n > hi) n -= 12; return n; };

  // base: path from the page to /samples/ (PorchBand: 'samples/', Jam Room: '../samples/')
  const LOCAL = base => ({
    upiano: { label: 'Upright piano', roots: [41,45,49,53,57,61,65,69,73,77], file: n => `${base}piano_${n}.flac`, rel: 0.12 },
    porgan: { label: 'Pipe organ', roots: [54,57,60,63,66,69,72,75], file: n => `${base}organ_${n}.flac`, rel: 0.2, sus: true },
    ubass:  { label: 'Upright bass', roots: [28,30,31,34,36,38,40,42,44,45,49,52,56], file: n => `${base}bass_${n}.flac`, rel: 0.06 },
  });
  const FLUID = {
    grand:   { label: 'Grand piano', dir: 'acoustic_grand_piano', lo: 36, hi: 88 },
    rhodes:  { label: 'Rhodes (electric piano)', dir: 'electric_piano_1', lo: 36, hi: 84 },
    b3:      { label: 'Drawbar organ (B3 style)', dir: 'drawbar_organ', lo: 36, hi: 84, sus: true },
    fbass:   { label: 'Finger bass', dir: 'electric_bass_finger', lo: 28, hi: 56 },
    nylon:   { label: 'Nylon guitar', dir: 'acoustic_guitar_nylon', lo: 40, hi: 76 },
    steel:   { label: 'Steel-string acoustic', dir: 'acoustic_guitar_steel', lo: 40, hi: 76 },
    clean:   { label: 'Clean electric guitar', dir: 'electric_guitar_clean', lo: 40, hi: 76 },
    muted:   { label: 'Muted electric guitar', dir: 'electric_guitar_muted', lo: 40, hi: 76 },
    strings: { label: 'String section', dir: 'string_ensemble_1', lo: 40, hi: 84, sus: true },
    choir:   { label: 'Choir aahs', dir: 'choir_aahs', lo: 40, hi: 84, sus: true },
    brass:   { label: 'Horn section', dir: 'brass_section', lo: 40, hi: 80 },
    trumpet: { label: 'Trumpet', dir: 'trumpet', lo: 52, hi: 82 },
    tenor:   { label: 'Tenor sax', dir: 'tenor_sax', lo: 44, hi: 76 },
    harmonica:{ label: 'Harmonica', dir: 'harmonica', lo: 52, hi: 84 },
    vibes:   { label: 'Vibraphone', dir: 'vibraphone', lo: 48, hi: 84 },
    marimba: { label: 'Marimba', dir: 'marimba', lo: 48, hi: 84 },
    flute:   { label: 'Flute', dir: 'flute', lo: 60, hi: 92, sus: true },
    cello:   { label: 'Cello', dir: 'cello', lo: 36, hi: 76, sus: true },
  };
  // Order shown in pickers
  const PLAYABLE = ['upiano','grand','rhodes','b3','porgan','nylon','steel','clean','muted','ubass','fbass','strings','cello','choir','brass','trumpet','tenor','harmonica','flute','vibes','marimba'];

  function create(getCtx, base){
    const local = LOCAL(base), bufs = {}, status = {}, missing = {}, loads = {}, voices = new Map();
    let sustain = false, listeners = [];
    const info = id => local[id] || FLUID[id];
    const label = id => (info(id) || {}).label || id;
    function list(id){
      if (local[id]) return local[id].roots.map(r => ({ root: r, url: local[id].file(r) }));
      const d = FLUID[id], out = [];
      for (let n = d.lo; n <= d.hi; n += 4) { const nm = FLAT[pc(n)] + (Math.floor(n / 12) - 1);
        out.push({ root: n, url: `${SF}/${d.dir}-mp3/${nm}.mp3`, alt: `${SF_MIRROR}/${d.dir}-mp3/${nm}.mp3` }); }
      return out;
    }
    async function fetchBuf(ctx, u){
      for (const url of [u.url, u.alt].filter(Boolean)) {
        try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return await ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) {}
      }
      throw new Error('missing');
    }
    function emit(){ for (const f of listeners) try { f(); } catch (e) {} }
    function ensure(id){
      const ctx = getCtx(); if (!ctx || !info(id)) return Promise.resolve(false);
      if (loads[id]) return loads[id];
      status[id] = 'loading'; missing[id] = []; bufs[id] = {}; emit();
      loads[id] = Promise.all(list(id).map(async u => { try { bufs[id][u.root] = await fetchBuf(ctx, u); } catch (e) { missing[id].push(u.root); } }))
        .then(() => { status[id] = missing[id].length === list(id).length ? 'missing' : missing[id].length ? 'partial' : 'ready'; emit(); return status[id] !== 'missing'; });
      return loads[id];
    }
    function resolve(id, note){
      const roots = Object.keys(bufs[id] || {}).map(Number); if (!roots.length) return null;
      const all = list(id).map(u => u.root), n = fold(note, Math.min(...all) - 2, Math.max(...all) + 2);
      let best = null; for (const r of roots) if (best === null || Math.abs(r - n) < Math.abs(best - n)) best = r;
      return Math.abs(best - n) <= MAX_SHIFT ? { root: best, note: n } : null;
    }
    function release(vo, t){
      if (vo.done) return; vo.done = true; const g = vo.g.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + vo.rel);
      try { vo.s.stop(t + vo.rel + 0.02); } catch (e) {}
    }
    // key: any string that identifies this press, e.g. 'midi:60'
    function noteOn(id, note, vel, dest, key){
      const ctx = getCtx(); if (!ctx || !bufs[id]) { ensure(id); return false; }
      const hit = resolve(id, note); if (!hit) return false;
      if (voices.has(key)) release(voices.get(key), ctx.currentTime);
      const d = info(id), buf = bufs[id][hit.root], rate = Math.pow(2, (hit.note - hit.root) / 12), t = ctx.currentTime;
      const g = ctx.createGain(), vg = Math.max(0.05, Math.pow(vel, 1.5)); g.connect(dest);
      const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
      if (d.sus && buf.duration > 0.6) { s.loop = true; s.loopStart = Math.min(buf.duration * 0.4, 1.0); s.loopEnd = buf.duration - 0.05; }
      s.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vg, t + (d.sus ? 0.03 : 0.003));
      s.start(t); if (!s.loop) s.stop(t + buf.duration / rate);
      const vo = { s, g, rel: d.rel || (d.sus ? 0.25 : 0.15), done: false, held: true };
      s.onended = () => { vo.done = true; if (voices.get(key) === vo) voices.delete(key); };
      voices.set(key, vo); return true;
    }
    function noteOff(key){
      const vo = voices.get(key), ctx = getCtx(); if (!vo || !ctx) return;
      vo.held = false; if (sustain) return; voices.delete(key); release(vo, ctx.currentTime);
    }
    function setSustain(on){
      sustain = on; const ctx = getCtx(); if (on || !ctx) return;
      for (const [k, vo] of voices) if (!vo.held) { voices.delete(k); release(vo, ctx.currentTime); }
    }
    function allOff(){ const ctx = getCtx(); if (!ctx) return; for (const vo of voices.values()) release(vo, ctx.currentTime); voices.clear(); }
    return { PLAYABLE, label, ensure, noteOn, noteOff, setSustain, allOff, status, missing, has: id => !!info(id), isFluid: id => !!FLUID[id],
      onChange: f => listeners.push(f), resolve, list };
  }
  window.WWInstruments = { create, FLUID, PLAYABLE };
})();

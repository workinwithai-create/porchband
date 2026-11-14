// WorkinWithAI shared "play an instrument" panel: on-screen keys, computer keys and a MIDI keyboard
// play WWInstruments live. Mount it with WWKeys.mount(container, { player, getDest, storeKey, getChordTones }).
(function(){
  'use strict';
  const NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const KEYMAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14 };
  const CSS = `.wwk-keys{display:flex;height:96px;position:relative;touch-action:none;user-select:none;-webkit-user-select:none;margin:6px 0}
.wwk-k{flex:1;min-width:0;border-radius:0 0 6px 6px;display:flex;align-items:flex-end;justify-content:center;font-size:10px;padding-bottom:4px;touch-action:none}
.wwk-w{background:#eee;color:#333;border:1px solid #999}.wwk-b{background:#222;color:#bbb;border:1px solid #000;height:62%;margin:0 -1.5%;z-index:1;flex:.7}
.wwk-k.tone.wwk-w{background:#ffd9a8}.wwk-k.tone.wwk-b{background:#8a4f14;color:#fff}.wwk-k.down{background:#d9822b!important;color:#fff}
.wwk-row{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.wwk-st{font-size:12px;color:#aab}`;
  function load(k, d){ try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return Object.assign({}, d); } }
  function mount(root, opt){
    if (!document.getElementById('wwk-css')) { const s = document.createElement('style'); s.id = 'wwk-css'; s.textContent = CSS; document.head.appendChild(s); }
    const P = opt.player, key = opt.storeKey || 'wwkeys';
    const st = load(key, { inst: 'rhodes', oct: 4, gain: 0.85, midiIn: '' });
    const save = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) {} };
    root.innerHTML = `<div class="wwk-row">
      <label>Instrument <select class="wwk-inst">${P.PLAYABLE.map(i => `<option value="${i}">${P.label(i)}</option>`).join('')}</select></label>
      <label>MIDI keyboard <select class="wwk-midi"><option value="">(none)</option></select></label>
      <label>Level <input class="wwk-gain" type="range" min="0" max="1" step="0.01"></label>
      <span class="wwk-st"></span></div>
      <div class="wwk-row" style="align-items:stretch;flex-wrap:nowrap"><button class="wwk-dn" aria-label="Octave down">◀</button><div class="wwk-keys" style="flex:1"></div><button class="wwk-up" aria-label="Octave up">▶</button></div>
      <small class="note">Computer keys A W S E D F T G Y H U J K O L play two octaves from C. Z and X change octave. A MIDI keyboard's velocity and sustain pedal work. Highlighted keys are the notes of the chord playing now.</small>`;
    const $ = c => root.querySelector(c), inst = $('.wwk-inst'), midiSel = $('.wwk-midi'), gain = $('.wwk-gain'), stEl = $('.wwk-st'), kb = $('.wwk-keys');
    inst.value = P.PLAYABLE.includes(st.inst) ? st.inst : 'rhodes'; gain.value = st.gain;
    let out = null;
    function dest(){ const base = opt.getDest(); if (!base) return null; if (!out || out.context !== base.context) { out = base.context.createGain(); out.connect(base); } out.gain.value = st.gain; return out; }
    function status(){ const s = P.status[inst.value]; stEl.textContent = !opt.player || s === undefined ? '' : s === 'loading' ? 'Loading ' + P.label(inst.value) + '…' : s === 'missing' ? P.label(inst.value) + ' did not load.' : s === 'partial' ? 'Some ' + P.label(inst.value) + ' notes did not load.' : ''; }
    P.onChange(status);
    function on(note, vel, src){ const d = dest(); if (!d) { stEl.textContent = 'Tap to start audio first.'; return; } P.noteOn(inst.value, note, vel, d, src + ':' + note); vis(note, true); if (opt.onNote) opt.onNote(true, note, vel); }
    function off(note, src){ P.noteOff(src + ':' + note); vis(note, false); if (opt.onNote) opt.onNote(false, note); }
    // on-screen keys: 2 octaves from C(oct)
    function base(){ return 12 * (st.oct + 1); }
    function draw(){
      kb.innerHTML = ''; for (let i = 0; i < 25; i++) { const n = base() + i, black = [1,3,6,8,10].includes(i % 12);
        const k = document.createElement('div'); k.className = 'wwk-k ' + (black ? 'wwk-b' : 'wwk-w'); k.dataset.n = n; k.textContent = i % 12 === 0 ? 'C' + (st.oct + Math.floor(i / 12)) : '';
        const down = e => { e.preventDefault(); k.setPointerCapture && k.setPointerCapture(e.pointerId); on(n, 0.8, 'ptr' + e.pointerId); k._p = e.pointerId; };
        const up = () => { if (k._p !== undefined) { off(n, 'ptr' + k._p); k._p = undefined; } };
        k.addEventListener('pointerdown', down); k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up); k.addEventListener('pointerleave', up);
        kb.appendChild(k); } tones(); }
    function vis(n, d){ const k = kb.querySelector(`[data-n="${n}"]`); if (k) k.classList.toggle('down', d); }
    let lastTones = '';
    function tones(){ const t = opt.getChordTones ? opt.getChordTones() : []; const sig = t.join(','); if (sig === lastTones && kb.dataset.drawn) return; lastTones = sig; kb.dataset.drawn = 1;
      kb.querySelectorAll('.wwk-k').forEach(k => k.classList.toggle('tone', t.includes(((+k.dataset.n % 12) + 12) % 12))); }
    setInterval(tones, 150);
    inst.addEventListener('change', () => { P.allOff(); st.inst = inst.value; save(); P.ensure(st.inst); status(); });
    gain.addEventListener('input', () => { st.gain = +gain.value; if (out) out.gain.value = st.gain; save(); });
    $('.wwk-dn').addEventListener('click', () => { st.oct = Math.max(1, st.oct - 1); save(); draw(); });
    $('.wwk-up').addEventListener('click', () => { st.oct = Math.min(6, st.oct + 1); save(); draw(); });
    const typing = e => /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    const held = new Set();
    document.addEventListener('keydown', e => { if (typing(e) || e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.code === 'KeyZ') { st.oct = Math.max(1, st.oct - 1); save(); draw(); return; } if (e.code === 'KeyX') { st.oct = Math.min(6, st.oct + 1); save(); draw(); return; }
      if (e.code in KEYMAP) { const n = base() + KEYMAP[e.code]; held.add(e.code + n); on(n, 0.8, 'kb'); e.preventDefault(); } });
    document.addEventListener('keyup', e => { if (e.code in KEYMAP) { for (const h of [...held]) if (h.startsWith(e.code)) { held.delete(h); off(+h.slice(e.code.length), 'kb'); } } });
    // MIDI
    let access = null, port = null;
    function onMsg(e){ const [s, n, v] = e.data, cmd = s & 0xF0;
      if (cmd === 0xB0 && n === 64) { P.setSustain(v >= 64); return; }
      if (cmd === 0xB0 && (n === 120 || n === 123)) { P.allOff(); return; }
      if (cmd === 0x90 && v > 0) on(n, v / 127, 'midi'); else if (cmd === 0x80 || (cmd === 0x90 && v === 0)) off(n, 'midi'); }
    function fillMidi(){ if (!access) return; const cur = st.midiIn; midiSel.innerHTML = '<option value="">(none)</option>' + [...access.inputs.values()].map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      midiSel.value = [...access.inputs.keys()].includes(cur) ? cur : ''; connect(); }
    function connect(){ if (port) port.onmidimessage = null; port = access && midiSel.value ? access.inputs.get(midiSel.value) : null; if (port) port.onmidimessage = onMsg; }
    midiSel.addEventListener('change', () => { st.midiIn = midiSel.value; save(); connect(); });
    if (navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(a => { access = a; a.onstatechange = fillMidi; fillMidi(); }).catch(() => { midiSel.disabled = true; });
    else midiSel.disabled = true;
    draw();
    return { ensure: () => P.ensure(inst.value), get inst(){ return inst.value; }, on, off };
  }
  window.WWKeys = { mount };
})();

// WorkinWithAI shared input rig: plug in a guitar or a mic, play it through a guitar amp or a vocal chain,
// hear yourself over the band, and record the processed take. Built from Web Audio nodes (filters, waveshaper,
// compressor, delay). The amp cabinet and the reverb are modelled with filters and a computed room, not recorded impulses.
// Mount: WWRig.mount(container, { getCtx, getBpm, onRecordStart, storeKey, filePrefix })
(function(){
  'use strict';
  const AMPS = {
    clean:    { label: 'Clean (glassy combo)',      drive: 0.05, bass: 2,  mid: -1, treble: 3,  reverb: 0.3,  vol: 0.8, cab: 'open' },
    crunch:   { label: 'Crunch (British-style)',    drive: 0.4,  bass: 1,  mid: 2,  treble: 2,  reverb: 0.2,  vol: 0.7, cab: 'closed' },
    blues:    { label: 'Blues (tweed-style break-up)', drive: 0.55, bass: 0, mid: 4, treble: 1, reverb: 0.25, vol: 0.7, cab: 'open' },
    lead:     { label: 'High-gain lead',            drive: 0.85, bass: 3,  mid: -2, treble: 3,  reverb: 0.3,  vol: 0.6, cab: 'closed' },
    acoustic: { label: 'Acoustic DI (no cab)',      drive: 0,    bass: -1, mid: -2, treble: 2,  reverb: 0.2,  vol: 0.8, cab: 'none' },
  };
  const VOCALS = {
    natural: { label: 'Natural',             comp: 0.4, warmth: 0,  presence: 2, air: 2, reverb: 0.2,  echo: 0,    vol: 0.8, hp: 80 },
    pop:     { label: 'Pop (bright, tight)',  comp: 0.7, warmth: -3, presence: 4, air: 4, reverb: 0.25, echo: 0.15, vol: 0.75, hp: 100 },
    ballad:  { label: 'Ballad (warm, roomy)', comp: 0.5, warmth: 2,  presence: 1, air: 2, reverb: 0.45, echo: 0.2,  vol: 0.8, hp: 80 },
    radio:   { label: 'Old radio',            comp: 0.9, warmth: -6, presence: 5, air: -8, reverb: 0.05, echo: 0,   vol: 0.75, hp: 400 },
  };
  const CTRL = {
    amp:   [['drive', 'Gain', 0, 1, 0.01], ['bass', 'Bass', -12, 12, 0.5], ['mid', 'Mid', -12, 12, 0.5], ['treble', 'Treble', -12, 12, 0.5], ['reverb', 'Reverb', 0, 1, 0.01], ['vol', 'Volume', 0, 1, 0.01]],
    vocal: [['comp', 'Compression', 0, 1, 0.01], ['warmth', 'Warmth', -12, 12, 0.5], ['presence', 'Presence', -12, 12, 0.5], ['air', 'Air', -12, 12, 0.5], ['reverb', 'Reverb', 0, 1, 0.01], ['echo', 'Echo', 0, 1, 0.01], ['vol', 'Volume', 0, 1, 0.01]],
    clean: [['vol', 'Volume', 0, 1, 0.01]],
  };
  const CSS = `.wwr-row{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:6px 0}.wwr-meter{width:140px;height:8px;background:#11131a;border-radius:4px;overflow:hidden}
.wwr-meter i{display:block;height:100%;width:0;background:#4caf50}.wwr-meter i.hot{background:#e05555}.wwr-ctrl label{min-width:90px}
.wwr-takes{display:flex;flex-direction:column;gap:6px;margin-top:8px}.wwr-take{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#11131a;border:1px solid #2a2f3c;border-radius:8px;padding:6px 8px}
.wwr-take audio{height:32px}.wwr-msg{font-size:12px;color:#ffd9b0}`;
  function load(k, d){ try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return Object.assign({}, d); } }
  function driveCurve(amount){ const k = amount * 120, n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
  function roomIR(ctx, secs){ // computed room: decaying stereo noise, used only as the reverb tail
    const len = Math.round(ctx.sampleRate * secs), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let seed = 12345 + ch * 777;
      for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, 3); } }
    return b; }

  function mount(root, opt){
    if (!document.getElementById('wwr-css')) { const s = document.createElement('style'); s.id = 'wwr-css'; s.textContent = CSS; document.head.appendChild(s); }
    const key = opt.storeKey || 'wwrig';
    const st = load(key, { chain: 'amp', amp: 'clean', vocal: 'natural', device: '', monitor: false, ampVals: {}, vocalVals: {} });
    const save = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) {} };
    const vals = () => st.chain === 'amp' ? Object.assign({}, AMPS[st.amp], st.ampVals[st.amp] || {}) : st.chain === 'vocal' ? Object.assign({}, VOCALS[st.vocal], st.vocalVals[st.vocal] || {}) : { vol: (st.cleanVol ?? 0.8) };
    root.innerHTML = `<div class="wwr-row">
      <button class="wwr-connect">Connect my mic or guitar</button>
      <label>Input <select class="wwr-dev"><option value="">Default input</option></select></label>
      <label>Chain <select class="wwr-chain"><option value="amp">Guitar amp</option><option value="vocal">Vocal chain</option><option value="clean">Clean (no effects)</option></select></label>
      <label>Preset <select class="wwr-preset"></select></label>
      <label class="chk"><span><input type="checkbox" class="wwr-mon"> Hear myself (use headphones)</span></label>
      <label>Input level <span class="wwr-meter"><i></i></span></label></div>
      <div class="wwr-row wwr-ctrl"></div>
      <div class="wwr-row"><button class="wwr-rec" disabled>● Record take</button><span class="wwr-msg"></span></div>
      <div class="wwr-takes"></div>`;
    const $ = c => root.querySelector(c), msg = $('.wwr-msg'), dev = $('.wwr-dev'), chainSel = $('.wwr-chain'), preset = $('.wwr-preset'), mon = $('.wwr-mon'), ctrl = $('.wwr-ctrl'), recBtn = $('.wwr-rec'), meterI = $('.wwr-meter i');
    chainSel.value = st.chain; mon.checked = !!st.monitor;
    let ctx = null, stream = null, src = null, N = null, rec = null, chunks = [], takeNo = 0;

    function build(){
      ctx = opt.getCtx(); if (!ctx) return;
      N = {};
      N.in = ctx.createGain(); N.meter = ctx.createAnalyser(); N.meter.fftSize = 1024; N.in.connect(N.meter);
      N.out = ctx.createGain(); N.mon = ctx.createGain(); N.out.connect(N.mon); N.mon.connect(ctx.destination);
      N.rec = ctx.createMediaStreamDestination(); N.out.connect(N.rec);
      // guitar amp
      N.hp = ctx.createBiquadFilter(); N.hp.type = 'highpass'; N.hp.frequency.value = 80;
      N.pre = ctx.createGain(); N.shape = ctx.createWaveShaper(); N.shape.oversample = '4x';
      N.low = ctx.createBiquadFilter(); N.low.type = 'lowshelf'; N.low.frequency.value = 120;
      N.mid = ctx.createBiquadFilter(); N.mid.type = 'peaking'; N.mid.frequency.value = 700; N.mid.Q.value = 0.8;
      N.high = ctx.createBiquadFilter(); N.high.type = 'highshelf'; N.high.frequency.value = 3200;
      N.cabBump = ctx.createBiquadFilter(); N.cabBump.type = 'peaking'; N.cabBump.frequency.value = 110; N.cabBump.Q.value = 1;
      N.cabLp = ctx.createBiquadFilter(); N.cabLp.type = 'lowpass'; N.cabLp.Q.value = 0.9;
      N.post = ctx.createGain();
      // vocal chain
      N.vhp = ctx.createBiquadFilter(); N.vhp.type = 'highpass';
      N.comp = ctx.createDynamicsCompressor(); N.comp.knee.value = 8; N.comp.attack.value = 0.005; N.comp.release.value = 0.12;
      N.makeup = ctx.createGain();
      N.warm = ctx.createBiquadFilter(); N.warm.type = 'peaking'; N.warm.frequency.value = 250; N.warm.Q.value = 0.9;
      N.pres = ctx.createBiquadFilter(); N.pres.type = 'peaking'; N.pres.frequency.value = 3500; N.pres.Q.value = 0.9;
      N.air = ctx.createBiquadFilter(); N.air.type = 'highshelf'; N.air.frequency.value = 11000;
      N.radioLp = ctx.createBiquadFilter(); N.radioLp.type = 'lowpass';
      // shared reverb and echo sends
      N.dry = ctx.createGain(); N.verbSend = ctx.createGain(); N.verb = ctx.createConvolver(); N.verb.buffer = roomIR(ctx, 2.2);
      N.echoSend = ctx.createGain(); N.delay = ctx.createDelay(2); N.fb = ctx.createGain(); N.fb.gain.value = 0.32; N.fbLp = ctx.createBiquadFilter(); N.fbLp.type = 'lowpass'; N.fbLp.frequency.value = 3500;
      N.dry.connect(N.out); N.verbSend.connect(N.verb); N.verb.connect(N.out);
      N.echoSend.connect(N.delay); N.delay.connect(N.fbLp); N.fbLp.connect(N.fb); N.fb.connect(N.delay); N.fbLp.connect(N.out);
      route(); apply();
    }
    function route(){
      if (!N) return;
      for (const k of ['in','hp','pre','shape','low','mid','high','cabBump','cabLp','post','vhp','comp','makeup','warm','pres','air','radioLp']) { try { N[k].disconnect(); } catch (e) {} }
      N.in.connect(N.meter);
      let last;
      if (st.chain === 'amp') { N.in.connect(N.hp); N.hp.connect(N.pre); N.pre.connect(N.shape); N.shape.connect(N.low); N.low.connect(N.mid); N.mid.connect(N.high);
        N.high.connect(N.cabBump); N.cabBump.connect(N.cabLp); N.cabLp.connect(N.post); last = N.post; }
      else if (st.chain === 'vocal') { N.in.connect(N.vhp); N.vhp.connect(N.comp); N.comp.connect(N.makeup); N.makeup.connect(N.warm); N.warm.connect(N.pres); N.pres.connect(N.air); N.air.connect(N.radioLp); last = N.radioLp; }
      else last = N.in;
      for (const d of [N.dry, N.verbSend, N.echoSend]) last.connect(d);
    }
    function apply(){
      if (!N) return; const v = vals(), t = ctx.currentTime, set = (p, x) => p.setTargetAtTime(x, t, 0.02);
      set(N.mon.gain, st.monitor ? 1 : 0);
      if (st.chain === 'amp') {
        N.shape.curve = driveCurve(v.drive); set(N.pre.gain, 1 + v.drive * 8); set(N.post.gain, 1 / (1 + v.drive * 3));
        set(N.low.gain, v.bass); set(N.mid.gain, v.mid); set(N.high.gain, v.treble);
        const cab = AMPS[st.amp].cab; set(N.cabBump.gain, cab === 'none' ? 0 : 3); set(N.cabLp.frequency, cab === 'none' ? 18000 : cab === 'open' ? 5500 : 4600);
        set(N.verbSend.gain, v.reverb * 0.6); set(N.echoSend.gain, 0); set(N.dry.gain, v.vol);
      } else if (st.chain === 'vocal') {
        set(N.vhp.frequency, v.hp); N.comp.threshold.setTargetAtTime(-10 - v.comp * 22, t, 0.02); N.comp.ratio.setTargetAtTime(1.5 + v.comp * 6, t, 0.02);
        set(N.makeup.gain, 1 + v.comp * 1.5); set(N.warm.gain, v.warmth); set(N.pres.gain, v.presence); set(N.air.gain, v.air);
        set(N.radioLp.frequency, st.vocal === 'radio' ? 3500 : 20000);
        const bpm = (opt.getBpm && opt.getBpm()) || 92; set(N.delay.delayTime, Math.min(1.9, 60 / bpm * 0.75));
        set(N.verbSend.gain, v.reverb * 0.6); set(N.echoSend.gain, v.echo * 0.7); set(N.dry.gain, v.vol);
      } else { set(N.verbSend.gain, 0); set(N.echoSend.gain, 0); set(N.dry.gain, v.vol); }
    }
    function renderPresets(){
      const list = st.chain === 'amp' ? AMPS : st.chain === 'vocal' ? VOCALS : null;
      preset.innerHTML = list ? Object.entries(list).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('') : '<option value="">(none)</option>';
      preset.disabled = !list; if (list) preset.value = st.chain === 'amp' ? st.amp : st.vocal;
      const v = vals();
      ctrl.innerHTML = CTRL[st.chain].map(([k, l, lo, hi, step]) => `<label>${l} <input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${step}" value="${v[k]}"></label>`).join('') + '<button class="wwr-reset">Reset preset</button>';
      ctrl.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
        const k = inp.dataset.k, x = +inp.value;
        if (st.chain === 'amp') (st.ampVals[st.amp] = st.ampVals[st.amp] || {})[k] = x;
        else if (st.chain === 'vocal') (st.vocalVals[st.vocal] = st.vocalVals[st.vocal] || {})[k] = x; else st.cleanVol = x;
        save(); apply(); }));
      ctrl.querySelector('.wwr-reset').addEventListener('click', () => { if (st.chain === 'amp') delete st.ampVals[st.amp]; else if (st.chain === 'vocal') delete st.vocalVals[st.vocal]; else st.cleanVol = 0.8; save(); renderPresets(); apply(); });
    }
    async function connectInput(){
      ctx = opt.getCtx(); if (!ctx) { msg.textContent = 'Tap to start audio first, then connect.'; return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'This browser cannot use a mic or audio interface.'; return; }
      try {
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: st.device ? { exact: st.device } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (!N || N.ctx !== ctx) { build(); N.ctx = ctx; }
        if (src) try { src.disconnect(); } catch (e) {}
        src = ctx.createMediaStreamSource(stream); src.connect(N.in);
        recBtn.disabled = false; $('.wwr-connect').textContent = 'Reconnect input';
        msg.textContent = st.monitor ? 'Connected. Use headphones so the speakers do not feed back.' : 'Connected. Tick "Hear myself" to hear the chain (headphones please).';
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
        dev.innerHTML = '<option value="">Default input</option>' + devs.map(d => `<option value="${d.deviceId}">${d.label || 'Input ' + d.deviceId.slice(0, 6)}</option>`).join('');
        dev.value = devs.some(d => d.deviceId === st.device) ? st.device : '';
        meter();
      } catch (e) { msg.textContent = 'Could not open the input: ' + e.message; }
    }
    let metering = false;
    function meter(){ if (metering) return; metering = true; const buf = new Float32Array(1024);
      const tick = () => { if (!N) { metering = false; return; } N.meter.getFloatTimeDomainData(buf); let p = 0; for (const x of buf) p = Math.max(p, Math.abs(x));
        meterI.style.width = Math.min(100, p * 100) + '%'; meterI.classList.toggle('hot', p > 0.9); requestAnimationFrame(tick); }; tick(); }
    function startRec(){
      if (!N || !window.MediaRecorder) { msg.textContent = 'This browser cannot record audio.'; return; }
      chunks = []; rec = new MediaRecorder(N.rec.stream);
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => { addTake(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); rec = null; recBtn.textContent = '● Record take'; };
      rec.start(); recBtn.textContent = '■ Stop recording'; msg.textContent = 'Recording through the ' + (st.chain === 'amp' ? 'amp' : st.chain === 'vocal' ? 'vocal chain' : 'clean input') + '…';
      if (opt.onRecordStart) opt.onRecordStart();
    }
    function stopRec(){ if (rec && rec.state !== 'inactive') rec.stop(); }
    function addTake(blob){
      takeNo++; const url = URL.createObjectURL(blob), ext = /ogg/.test(blob.type) ? 'ogg' : /mp4|aac/.test(blob.type) ? 'm4a' : 'webm';
      const what = st.chain === 'amp' ? 'amp-' + st.amp : st.chain === 'vocal' ? 'vocal-' + st.vocal : 'clean';
      const name = `${opt.filePrefix || 'take'}-${takeNo}-${what}.${ext}`, row = document.createElement('div'); row.className = 'wwr-take';
      row.innerHTML = `<b>Take ${takeNo}</b><small>${what}</small><audio controls src="${url}"></audio><a download="${name}" href="${url}" style="color:#ffd9b0">Download</a>`;
      root.querySelector('.wwr-takes').prepend(row); msg.textContent = 'Saved take ' + takeNo + '. It stays in this browser until you download it.';
    }
    $('.wwr-connect').addEventListener('click', connectInput);
    dev.addEventListener('change', () => { st.device = dev.value; save(); connectInput(); });
    chainSel.addEventListener('change', () => { st.chain = chainSel.value; save(); renderPresets(); route(); apply(); });
    preset.addEventListener('change', () => { if (st.chain === 'amp') st.amp = preset.value; else st.vocal = preset.value; save(); renderPresets(); apply(); });
    mon.addEventListener('change', () => { st.monitor = mon.checked; save(); apply(); if (st.monitor && stream) msg.textContent = 'Use headphones so the speakers do not feed back.'; });
    recBtn.addEventListener('click', () => rec ? stopRec() : startRec());
    renderPresets();
    return { stopRec, get recording(){ return !!rec; }, apply, _nodes: () => N, _state: st, _build: () => { build(); N.ctx = opt.getCtx(); } };
  }
  window.WWRig = { mount, AMPS, VOCALS };
})();

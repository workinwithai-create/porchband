// PorchBand: WorkinWithAI. Static app. Real CC0 instrument samples bundled in /samples/.
'use strict';
const APP = 'porchband';
const SR = 48000;
const LOOKAHEAD_MS = 25, SCHEDULE_AHEAD = 0.12;
const MAX_SHIFT = 4; // never pitch-shift a sample more than ±4 semitones
const NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const PARTS = [
  {id:'drums', label:'Acoustic Drum Kit', ch:9},
  {id:'bass',  label:'Upright Bass (pizz)', ch:0},
  {id:'piano', label:'Upright Piano', ch:1},
  {id:'organ', label:'Pipe Organ (hold)', ch:2},
];
// Sample map: instrument -> {name, notes:[root midi], file(n)}; drums keyed by GM note.
const INSTR = {
  piano: {name:'Upright Piano', roots:[41,45,49,53,57,61,65,69,73,77], file:n=>`samples/piano_${n}.flac`},
  organ: {name:'Pipe Organ',    roots:[54,57,60,63,66,69,72,75],       file:n=>`samples/organ_${n}.flac`},
  bass:  {name:'Upright Bass',  roots:[28,30,31,34,36,38,40,42,44,45,49,52,56], file:n=>`samples/bass_${n}.flac`},
  drums: {name:'Acoustic Drum Kit', roots:[36,38,42,51], file:n=>`samples/${{36:'kick',38:'snare',42:'hat',51:'ride'}[n]}.flac`},
};
const QUAL = {'':[0,4,7], m:[0,3,7], min:[0,3,7], '7':[0,4,7,10], m7:[0,3,7,10], maj7:[0,4,7,11], dim:[0,3,6], sus2:[0,2,7], sus4:[0,5,7]};
const ROOT = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};

// ---------- state ----------
const DEFAULT = {bpm:92, keyRoot:0, chords:'C G Am F', recipe:'folk', bassStyle:'feel', bars:8,
  mutes:{drums:false,bass:false,piano:false,organ:false}, gains:{drums:0.9,bass:0.9,piano:0.75,organ:0.28},
  midiIn:'', midiOut:'', midiInMode:'chords'};
const state = Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(APP+'-settings')||'{}'));
state.mutes = Object.assign({}, DEFAULT.mutes, state.mutes); state.gains = Object.assign({}, DEFAULT.gains, state.gains);
function save(){ localStorage.setItem(APP+'-settings', JSON.stringify(state)); }

function parseChord(s){
  const m = /^([A-G])(#|b)?(maj7|min|m7|m|7|dim|sus2|sus4)?$/.exec(s.trim()); if(!m) return null;
  const r = ROOT[m[1]] + (m[2]==='#'?1:m[2]==='b'?-1:0);
  return {root:(r+12)%12, ivs:QUAL[m[3]||''], minor:/^m(?!aj)|min|dim/.test(m[3]||''), name:s.trim()};
}
function parseProg(str){ const t=str.trim().split(/[\s,|]+/).filter(Boolean); if(t.length!==4) return null; const c=t.map(parseChord); return c.includes(null)?null:c; }
let prog = parseProg(state.chords) || parseProg(DEFAULT.chords);
const pc = x => ((x%12)+12)%12;
function transpose(){ return pc(state.keyRoot - prog[0].root); }
function keyLabel(){ return NAMES[state.keyRoot].replace('#','s') + (prog[0].minor?'m':''); }
function chordName(i){ const c=prog[i]; return NAMES[pc(c.root+transpose())] + c.name.replace(/^[A-G](#|b)?/,''); }
const inRange = (n, lo, hi) => { while(n<lo) n+=12; while(n>hi) n-=12; return n; }; // revoice by octaves, never stretch

// ---------- arrangement: shared by live scheduler, WAV export and MIDI export (deterministic) ----------
function stepEvents(step, st, pr){
  const out=[], bar=Math.floor(step/16), s=step%16, t=pc(st.keyRoot-pr[0].root);
  const c=pr[bar%4], nx=pr[(bar+1)%4], root=pc(c.root+t), R=st.recipe, BS=st.bassStyle||'feel';
  if(!st.mutes.drums){
    const kicks = R==='ballad'?[0,8]:R==='folk'?[0,6,8]:R==='groove'?(BS==='walk'?[0,8,10]:[0,8]):[0,7,8,10];
    if(kicks.includes(s)) out.push({part:'drums',note:36,dur:4,vel:s===0?1:0.8});
    if(s===4||s===12) out.push({part:'drums',note:38,dur:4,vel:R==='ballad'?0.55:0.85});
    if(R==='ballad'){ if(s%4===0) out.push({part:'drums',note:51,dur:4,vel:0.5}); }
    else if(s%2===0) out.push({part:'drums',note:42,dur:2,vel:s%4===0?0.7:0.45});
  }
  if(!st.mutes.bass){
    const b=inRange(33+pc(root-33), 33, 44), f=b+7; // root A1..G#2, fifth up to D#3
    if(BS==='roots'){ if(s%2===0) out.push({part:'bass',note:b,dur:2,vel:s%4===0?1:0.8}); }
    else if(BS==='octave'){ if(s%2===0) out.push({part:'bass',note:b+((s/2)%2?12:0),dur:2,vel:0.9}); } // up to G#3 (56)
    else if(BS==='walk'){ if(s%4===0){ const q=s/4, nr=inRange(33+pc(nx.root+t-33),33,44);
        const n = q===0?b : q===1?b+c.ivs[1] : q===2?b+c.ivs[2] : (nr>b?nr-1:nr+1); // root, 3rd, 5th, chromatic approach
        out.push({part:'bass',note:n,dur:4,vel:q===0?1:0.85}); } }
    else if(R==='ballad'){ if(s===0) out.push({part:'bass',note:b,dur:8,vel:0.95}); if(s===8) out.push({part:'bass',note:f,dur:8,vel:0.8}); }
    else if(R==='folk'){ if(s%4===0) out.push({part:'bass',note:(s/4)%2?f:b,dur:4,vel:s===0?1:0.85}); }
    else { if(s%2===0) out.push({part:'bass',note:b,dur:2,vel:s%4===0?0.95:0.75}); }
  }
  const voicing = (lo,hi) => c.ivs.slice(0,4).map(iv=>inRange(lo+pc(root+iv-lo),lo,hi)).sort((a,b)=>a-b);
  if(!st.mutes.piano){
    const v=voicing(55,67), lh=inRange(43+pc(root-43),43,54);
    const hit=(dur,vel)=>{ out.push({part:'piano',note:lh,dur,vel}); for(const n of v) out.push({part:'piano',note:n,dur,vel:vel*0.85}); };
    if(R==='ballad'||R==='groove'){ if(s===0) hit(16,R==='groove'?0.7:0.8); }
    else if(R==='folk'){ if(s%2===0) hit(2, s%4===0?0.75:0.55); }
    else { if(s===0) hit(2,0.8); if(s%4===2) hit(2,0.65); }
  }
  if(!st.mutes.organ && s===0) for(const n of voicing(57,70)) out.push({part:'organ',note:n,dur:16,vel:0.6});
  return out;
}

// ---------- sample loading: keep raw ArrayBuffers, decode per context ----------
const raw = {};   // url -> ArrayBuffer (never re-downloaded)
const missing = new Set(); let loaded = 0, total = 0, loadDone = false;
const urls = []; for(const [id,ins] of Object.entries(INSTR)) for(const r of ins.roots) urls.push({id, root:r, url:ins.file(r)});
total = urls.length;
const loadAll = Promise.all(urls.map(async u=>{
  try{ const r=await fetch(u.url); if(!r.ok) throw new Error(r.status); raw[u.url]=await r.arrayBuffer(); }
  catch(e){ missing.add(INSTR[u.id].name+' ('+u.url.split('/').pop()+')'); }
  loaded++; showLoad();
})).then(()=>{ loadDone=true; showLoad(); });
function showLoad(){
  const el=document.getElementById('loadStatus'); if(!el) return;
  if(missing.size){ el.className='miss'; el.textContent=`Missing samples, playback disabled: ${[...missing].join(', ')}`; }
  else el.textContent = loadDone ? `Samples loaded: ${loaded}/${total}` : `Loading samples… ${loaded}/${total}`;
  const ok = loadDone && !missing.size;
  ['play','exportWav'].forEach(id=>{ const b=document.getElementById(id); if(b) b.disabled=!ok; });
}
async function decodeAll(c){ // -> {id:{root:AudioBuffer}}
  const out={}; for(const u of urls){ (out[u.id]=out[u.id]||{})[u.root] = await c.decodeAudioData(raw[u.url].slice(0)); } return out;
}
function pickSample(id, note){
  const roots=INSTR[id].roots; let best=roots[0]; for(const r of roots) if(Math.abs(r-note)<Math.abs(best-note)) best=r;
  if(Math.abs(best-note)>MAX_SHIFT) throw new Error(`${id} note ${note} out of sampled range`); return best;
}

// ---------- sampler voice ----------
const REL = {drums:0.03, bass:0.06, piano:0.12, organ:0.2};
function voice(c, bufs, dest, ev, t, stepDur, track){
  const end = t + ev.dur*stepDur, g=c.createGain(); g.connect(dest);
  const r = ev.part==='drums' ? ev.note : pickSample(ev.part, ev.note);
  const buf = bufs[ev.part][r], rate = ev.part==='drums' ? 1 : Math.pow(2,(ev.note-r)/12);
  const rel = REL[ev.part]; let off = end;
  if(ev.part==='drums') off = t + Math.min(buf.duration, ev.note===51?2.0:ev.note===42?0.25:0.8); // let hits ring naturally
  const vel = ev.vel;
  if(ev.part==='drums') g.gain.setValueAtTime(vel,t); // drum hits keep their recorded attack
  else { g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vel, t+(ev.part==='organ'?0.06:0.001)); }
  g.gain.setValueAtTime(vel, off); g.gain.linearRampToValueAtTime(0, off+rel);
  const srcs=[]; const usable = buf.duration/rate - 0.05;
  if(ev.part!=='organ') off = Math.min(off, t + usable - rel); // one-shots: never past the recorded sample
  // held notes: if a note outlasts the sample, crossfade into a retrigger from the sustain section
  const XF=0.15; let segStart=t, segOff=0, first=true;
  while(true){
    const s=c.createBufferSource(); s.buffer=buf; s.playbackRate.value=rate; const sg=c.createGain(); s.connect(sg); sg.connect(g);
    const segEnd = segStart + (usable - segOff/rate);
    if(!first){ sg.gain.setValueAtTime(0,segStart); sg.gain.linearRampToValueAtTime(1,segStart+XF); }
    s.start(segStart, segOff);
    if(ev.part==='organ' && segEnd < off+rel){ sg.gain.setValueAtTime(1,segEnd-XF); sg.gain.linearRampToValueAtTime(0,segEnd); s.stop(segEnd+0.01); srcs.push(s);
      segStart=segEnd-XF; segOff=Math.min(1.0,buf.duration*0.3); first=false; }
    else { s.stop(off+rel+0.01); srcs.push(s); break; }
  }
  if(track) for(const s of srcs){ active.add(s); s.onended=()=>active.delete(s); }
}
function makeComp(c){ const k=c.createDynamicsCompressor(); k.threshold.value=-6; k.knee.value=6; k.ratio.value=12; k.attack.value=0.003; k.release.value=0.15; return k; }
function buildBus(c, gains){ const comp=makeComp(c); comp.connect(c.destination); const chairs={};
  for(const p of PARTS){ const g=c.createGain(); g.gain.value=gains[p.id]; g.connect(comp); chairs[p.id]=g; } return {comp,chairs}; }

// ---------- live engine ----------
let ctx=null, bus=null, liveBufs=null, timerId=null, nextStepTime=0, step=0, playing=false;
const active=new Set(), stepLog=[]; window.__schedLog=[];
async function ensureCtx(){
  if(!ctx){ ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:SR}); bus=buildBus(ctx,state.gains); }
  await ctx.resume();
  if(!liveBufs){ await loadAll; if(!missing.size) liveBufs=await decodeAll(ctx); }
}
function start(){
  if(!ctx||ctx.state!=='running'||!liveBufs||missing.size) return;
  nextStepTime=ctx.currentTime+0.1; step=0; stepLog.length=0; playing=true;
  timerId=setInterval(scheduler,LOOKAHEAD_MS); scheduler(); ui.play.textContent='■ Stop'; requestAnimationFrame(draw);
}
function scheduler(){ while(nextStepTime < ctx.currentTime+SCHEDULE_AHEAD){ scheduleStep(step,nextStepTime); nextStepTime += 60/state.bpm/4; step=(step+1)%64; } }
function scheduleStep(st, time){
  const sd=60/state.bpm/4, evs=stepEvents(st,state,prog);
  for(const ev of evs){ voice(ctx,liveBufs,bus.chairs[ev.part],ev,time,sd,true); midiSend(ev,time,sd); }
  stepLog.push({step:st,time}); if(stepLog.length>256) stepLog.shift();
  window.__schedLog.push({step:st,time,bpm:state.bpm,recipe:state.recipe,bassStyle:state.bassStyle,mutes:Object.assign({},state.mutes),notes:evs.map(e=>e.part+':'+e.note)});
  if(window.__schedLog.length>2000) window.__schedLog.shift();
}
function stop(){
  clearInterval(timerId); timerId=null; playing=false;
  for(const s of active){ try{s.stop();}catch(e){} } active.clear();
  if(midiOut) for(const p of PARTS) midiOut.send([0xB0|p.ch,123,0]);
  ui.play.textContent='▶ Play'; document.querySelectorAll('.bar').forEach(b=>b.classList.remove('on'));
}
function draw(){
  if(!playing) return; const now=ctx.currentTime; let cur=null;
  for(const e of stepLog){ if(e.time<=now) cur=e; else break; }
  if(cur){ const bar=Math.floor(cur.step/16), frac=(cur.step%16+Math.min(1,(now-cur.time)/(60/state.bpm/4)))/16;
    document.querySelectorAll('.bar').forEach((b,i)=>{ b.classList.toggle('on',i===bar); if(i===bar) b.querySelector('.ph').style.left=(frac*100)+'%'; }); }
  requestAnimationFrame(draw);
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'&&playing){ stop(); setStatus('Stopped (tab hidden).'); } });

// ---------- export ----------
let compLatency=null;
async function measureCompLatency(){ // cross-correlate a 60 Hz burst through the compressor to find its look-ahead delay
  if(compLatency!==null) return compLatency;
  const oc=new OfflineAudioContext(1,4096,SR), b=oc.createBuffer(1,600,SR), x=b.getChannelData(0);
  for(let i=0;i<600;i++) x[i]=0.3*Math.sin(2*Math.PI*60*i/SR);
  const s=oc.createBufferSource(); s.buffer=b; const k=makeComp(oc); s.connect(k); k.connect(oc.destination); s.start(0);
  const d=(await oc.startRendering()).getChannelData(0); let best=0,bv=-Infinity;
  for(let L=0;L<1024;L++){ let c=0; for(let i=0;i<600;i++) c+=x[i]*d[i+L]; if(c>bv){bv=c;best=L;} }
  return compLatency=best;
}
function mergeOpts(o){ const st=Object.assign({},state,o||{}); st.mutes=Object.assign({},state.mutes,(o||{}).mutes); st.gains=Object.assign({},state.gains,(o||{}).gains); return st; }
async function renderLoop(opts){
  await loadAll; if(missing.size) throw new Error('Missing samples');
  const st=mergeOpts(opts), pr=prog;
  const N=Math.round(st.bars*4*60/st.bpm*SR), TAIL=Math.round(3*SR), D=await measureCompLatency();
  const oc=new OfflineAudioContext(2, D+N+TAIL, SR);
  const bufs=await decodeAll(oc); // decode the kept raw ArrayBuffers, no re-download
  const b=buildBus(oc, st.gains), sd=60/st.bpm/4;
  for(let s=0;s<st.bars*16;s++) for(const ev of stepEvents(s,st,pr)) voice(oc,bufs,b.chairs[ev.part],ev,s*sd,sd,false);
  const buf=await oc.startRendering();
  const ch=[0,1].map(i=>{ const d=buf.getChannelData(i), o=new Float32Array(N); o.set(d.subarray(D,D+N)); for(let j=0;j<TAIL;j++) o[j]+=d[D+N+j]; return o; });
  let peak=0; for(const d of ch) for(let i=0;i<N;i++){ const a=Math.abs(d[i]); if(a>peak) peak=a; }
  const k=peak>0?Math.pow(10,-1.1/20)/peak:1; for(const d of ch) for(let i=0;i<N;i++) d[i]*=k;
  return {ch,N,st};
}
function wav24(ch,N){
  const nc=2,bps=3,len=N*nc*bps,b=new ArrayBuffer(44+len),v=new DataView(b); let p=0;
  const str=s=>{for(const c of s) v.setUint8(p++,c.charCodeAt(0));}, u32=x=>{v.setUint32(p,x,true);p+=4}, u16=x=>{v.setUint16(p,x,true);p+=2};
  str('RIFF');u32(36+len);str('WAVE');str('fmt ');u32(16);u16(1);u16(nc);u32(SR);u32(SR*nc*bps);u16(nc*bps);u16(24);str('data');u32(len);
  for(let i=0;i<N;i++) for(let c=0;c<nc;c++){ let x=Math.round(Math.max(-1,Math.min(1,ch[c][i]))*8388607); if(x<0)x+=16777216; v.setUint8(p++,x&255);v.setUint8(p++,(x>>8)&255);v.setUint8(p++,(x>>16)&255); }
  return new Uint8Array(b);
}
function midiFile(st,pr){
  const PPQ=480,T=PPQ/4, vlq=n=>{const a=[n&127]; while(n>>=7) a.unshift((n&127)|128); return a;};
  const trk=evs=>{ evs.sort((a,b)=>a.t-b.t||a.o-b.o); let last=0; const d=[]; for(const e of evs){ d.push(...vlq(e.t-last),...e.b); last=e.t; }
    d.push(...vlq(st.bars*16*T-last),0xFF,0x2F,0); return [0x4D,0x54,0x72,0x6B,(d.length>>>24)&255,(d.length>>16)&255,(d.length>>8)&255,d.length&255,...d]; };
  const name=s=>{const c=[...s].map(x=>x.charCodeAt(0)); return [0xFF,0x03,c.length,...c];}, us=Math.round(60000000/st.bpm);
  const tracks=[trk([{t:0,o:0,b:name(APP+' '+keyLabel())},{t:0,o:1,b:[0xFF,0x51,3,(us>>16)&255,(us>>8)&255,us&255]},{t:0,o:2,b:[0xFF,0x58,4,4,2,24,8]}])];
  for(const p of PARTS){ const evs=[{t:0,o:0,b:name(p.label)}];
    for(let s=0;s<st.bars*16;s++) for(const ev of stepEvents(s,st,pr)) if(ev.part===p.id){ const v=Math.max(1,Math.round(ev.vel*110));
      evs.push({t:s*T,o:2,b:[0x90|p.ch,ev.note,v]}); evs.push({t:(s+ev.dur)*T,o:1,b:[0x80|p.ch,ev.note,0]}); }
    tracks.push(trk(evs)); }
  return new Uint8Array([].concat([0x4D,0x54,0x68,0x64,0,0,0,6,0,1,0,tracks.length,PPQ>>8,PPQ&255],...tracks));
}
const fileBase=st=>`${APP}-${st.recipe}-${(st.bassStyle&&st.bassStyle!=='feel')?st.bassStyle:'feelbass'}-${st.bpm}bpm-${keyLabel()}`;
function download(bytes,name,type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bytes],{type})); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
async function exportWavBytes(o){ const r=await renderLoop(o); return {bytes:wav24(r.ch,r.N),name:fileBase(r.st)+'.wav'}; }
function exportMidBytes(o){ const st=mergeOpts(o); return {bytes:midiFile(st,prog),name:fileBase(st)+'.mid'}; }
window.__porchband={state,exportWavBytes,exportMidBytes,stepEvents,start,stop,loadAll,get missing(){return [...missing];},get playing(){return playing;},get ctx(){return ctx;},fetchCount:()=>Object.keys(raw).length};

// ---------- license gate (Lemon Squeezy License API) ----------
// ONE place to configure checkout. Mark: paste the values from your Lemon Squeezy product (license keys enabled).
const LEMON = { checkoutUrl: "", storeId: null, productId: null, price: "$12 once" };
window.__lemon=LEMON; // test hook (config only, no secrets)
const LS_API='https://api.lemonsqueezy.com/v1/licenses/';
const lic=JSON.parse(localStorage.getItem(APP+'-license')||'{"valid":false}');
const configured=()=>!!(LEMON.storeId&&LEMON.productId);
async function lsCall(action,params){ const r=await fetch(LS_API+action,{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString()}); return r.json(); }
const ours=j=>!!j&&!!j.meta&&+j.meta.store_id===+LEMON.storeId&&+j.meta.product_id===+LEMON.productId;
async function activateKey(key){ // -> {ok, instance, reason}
  if(!configured()) return {ok:false,reason:'Checkout is not live yet. License keys cannot be checked until the store is set up.'};
  const j=await lsCall('activate',{license_key:key,instance_name:'PorchBand '+(navigator.platform||'web')});
  if(!j.activated) return {ok:false,reason:j.error||'That key could not be activated.'};
  if(!ours(j)){ if(j.instance) lsCall('deactivate',{license_key:key,instance_id:j.instance.id}).catch(()=>{}); return {ok:false,reason:'That key is for a different product.'}; }
  return {ok:true,instance:j.instance.id}; }
async function validateKey(key,instance){ if(!configured()) return false; const j=await lsCall('validate',instance?{license_key:key,instance_id:instance}:{license_key:key}); return !!j.valid&&ours(j); }
function saveLic(){ localStorage.setItem(APP+'-license',JSON.stringify(lic)); }
function licUI(){ ui.licOff.hidden=!lic.valid; ui.licState.textContent = lic.valid ? 'Licensed: 8 and 16-bar WAV export unlocked. Thank you!' : 'Free demo: play along with every feel, MIDI export, MIDI in/out, and 4-bar WAV export. A license key unlocks 8 and 16-bar WAV export.'; }

// ---------- Web MIDI ----------
let midiAccess=null, midiOut=null, midiInPort=null; const held=new Set(); let slot=0, chordNotes=null;
function midiSend(ev,time,sd){ if(!midiOut||!ctx) return; const p=PARTS.find(x=>x.id===ev.part), at=performance.now()+(time-ctx.currentTime)*1000, v=Math.max(1,Math.round(ev.vel*110));
  midiOut.send([0x90|p.ch,ev.note,v],at); midiOut.send([0x80|p.ch,ev.note,0],at+ev.dur*sd*1000-5); }
function chordFromNotes(notes){ const pcs=[...new Set([...notes].map(n=>n%12))], bass=Math.min(...notes)%12;
  for(const r of [bass,...pcs]) for(const [q,ivs] of Object.entries({'':[0,4,7],m:[0,3,7],'7':[0,4,7,10],m7:[0,3,7,10],maj7:[0,4,7,11],dim:[0,3,6]})){
    const set=ivs.map(i=>(r+i)%12); if(set.length===pcs.length&&set.every(x=>pcs.includes(x))) return NAMES[r]+q; } return null; }
function onMidiMsg(e){ const [s,n,v]=e.data, cmd=s&0xF0;
  if(cmd===0x90&&v>0){ if(state.midiInMode==='transport'){ togglePlay(); return; } held.add(n); chordNotes=new Set(held); }
  else if(cmd===0x80||(cmd===0x90&&v===0)){ held.delete(n);
    if(state.midiInMode==='chords'&&held.size===0&&chordNotes&&chordNotes.size>=3){ const c=chordFromNotes(chordNotes); chordNotes=null;
      if(c){ const t=ui.chords.value.trim().split(/\s+/); while(t.length<4) t.push('C'); t[slot]=c; slot=(slot+1)%4; ui.chords.value=t.join(' '); onChords(); } } } }
function refreshMidi(){ if(!midiAccess) return;
  const fill=(sel,ports,cur)=>{ sel.innerHTML='<option value="">(none)</option>'+[...ports.values()].map(p=>`<option value="${p.id}">${p.name}</option>`).join(''); sel.value=[...ports.keys()].includes(cur)?cur:''; };
  fill(ui.midiIn,midiAccess.inputs,state.midiIn); fill(ui.midiOut,midiAccess.outputs,state.midiOut);
  if(midiInPort) midiInPort.onmidimessage=null; midiInPort=midiAccess.inputs.get(ui.midiIn.value)||null; if(midiInPort) midiInPort.onmidimessage=onMidiMsg;
  midiOut=midiAccess.outputs.get(ui.midiOut.value)||null; }

// ---------- UI ----------
const ui={}; ['bassStyle','tap','tapBtn','bpm','key','chords','chordErr','recipe','preset','bars','parts','play','exportWav','exportMid','status','grid','midiIn','midiInMode','midiOut','midiNote','licState','licKey','licBtn','licOff','buy'].forEach(id=>ui[id]=document.getElementById(id));
function setStatus(s){ ui.status.textContent=s; }
ui.key.innerHTML=NAMES.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
ui.bpm.value=state.bpm; ui.key.value=state.keyRoot; ui.chords.value=state.chords; ui.recipe.value=state.recipe; ui.bassStyle.value=state.bassStyle; ui.bars.value=state.bars; ui.midiInMode.value=state.midiInMode;
ui.parts.innerHTML=PARTS.map(p=>`<div class="part" id="part-${p.id}"><label><span><input type="checkbox" data-mute="${p.id}"> Mute</span>${p.label}</label><input type="range" min="0" max="1" step="0.01" data-gain="${p.id}" value="${state.gains[p.id]}"></div>`).join('');
function renderGrid(){ ui.grid.innerHTML=[0,1,2,3].map(i=>`<div class="bar"><div class="ph"></div><small>Bar ${i+1}</small><br><b>${chordName(i)}</b></div>`).join('');
  PARTS.forEach(p=>{ document.querySelector(`[data-mute="${p.id}"]`).checked=state.mutes[p.id]; document.getElementById('part-'+p.id).classList.toggle('muted',state.mutes[p.id]); }); }
function onChords(){ const p=parseProg(ui.chords.value); if(!p){ ui.chordErr.textContent='Enter exactly 4 chords, e.g. C G Am F (m, 7, m7, maj7, dim, sus2, sus4)'; return; }
  ui.chordErr.textContent=''; const t=transpose(); prog=p; state.chords=ui.chords.value.trim(); state.keyRoot=pc(p[0].root+t); ui.key.value=state.keyRoot; save(); renderGrid(); }
ui.bpm.addEventListener('change',()=>{ const v=Math.round(+ui.bpm.value); if(!(v>=60&&v<=180)){ ui.bpm.value=state.bpm; setStatus('BPM must be 60–180'); return; } state.bpm=v; save(); });
ui.key.addEventListener('change',()=>{ state.keyRoot=+ui.key.value; save(); renderGrid(); });
ui.chords.addEventListener('change',onChords);
ui.recipe.addEventListener('change',()=>{ state.recipe=ui.recipe.value; save(); });
ui.bassStyle.addEventListener('change',()=>{ state.bassStyle=ui.bassStyle.value; save(); });
ui.bars.addEventListener('change',()=>{ state.bars=+ui.bars.value; save(); });
ui.preset.addEventListener('change',()=>{ if(ui.preset.value){ ui.chords.value=ui.preset.value; state.keyRoot=parseProg(ui.preset.value)[0].root; ui.key.value=state.keyRoot; prog=parseProg(ui.preset.value); onChords(); } });
ui.midiInMode.addEventListener('change',()=>{ state.midiInMode=ui.midiInMode.value; save(); });
ui.midiIn.addEventListener('change',()=>{ state.midiIn=ui.midiIn.value; save(); refreshMidi(); });
ui.midiOut.addEventListener('change',()=>{ state.midiOut=ui.midiOut.value; save(); refreshMidi(); });
ui.parts.addEventListener('input',e=>{ const m=e.target.dataset.mute, g=e.target.dataset.gain;
  if(m){ state.mutes[m]=e.target.checked; renderGrid(); }
  if(g){ state.gains[g]=+e.target.value; if(bus) bus.chairs[g].gain.setTargetAtTime(state.gains[g],ctx.currentTime,0.01); }
  save(); });
async function togglePlay(){ await ensureCtx(); playing?stop():start(); }
ui.play.addEventListener('click',togglePlay);
ui.tapBtn.addEventListener('click',async()=>{ ui.tapBtn.textContent='Starting…'; await ensureCtx(); if(ctx.state==='running') ui.tap.classList.add('hide'); showLoad(); });
ui.exportWav.addEventListener('click',async()=>{ if(!lic.valid&&state.bars>4){ setStatus('Demo: 4-bar WAV export. Unlock below for 8/16 bars.'); return; }
  setStatus('Rendering…'); try{ const r=await exportWavBytes(); download(r.bytes,r.name,'audio/wav'); setStatus('Saved '+r.name); }catch(e){ setStatus('Export failed: '+e.message); } });
ui.exportMid.addEventListener('click',()=>{ const r=exportMidBytes(); download(r.bytes,r.name,'audio/midi'); setStatus('Saved '+r.name); });
ui.licBtn.addEventListener('click',async()=>{ const k=ui.licKey.value.trim(); if(!k) return; ui.licState.textContent='Checking…';
  try{ const r=await activateKey(k); if(r.ok){ Object.assign(lic,{valid:true,key:k,instance:r.instance,checked:Date.now()}); saveLic(); licUI(); ui.licKey.value=''; } else ui.licState.textContent=r.reason; }
  catch(e){ ui.licState.textContent='Could not reach Lemon Squeezy. Check your connection and try again.'; } });
ui.licOff.addEventListener('click',async()=>{ if(lic.key&&lic.instance&&configured()) await lsCall('deactivate',{license_key:lic.key,instance_id:lic.instance}).catch(()=>{});
  for(const k of Object.keys(lic)) delete lic[k]; lic.valid=false; saveLic(); licUI(); });
if(LEMON.checkoutUrl){ ui.buy.href=LEMON.checkoutUrl; ui.buy.textContent='Buy PorchBand · '+LEMON.price; }
else { ui.buy.removeAttribute('href'); ui.buy.setAttribute('aria-disabled','true'); ui.buy.textContent='Checkout opening soon · '+LEMON.price; }
// re-check on load: a refunded/disabled key relocks; offline keeps the last good state
if(lic.valid&&lic.key) validateKey(lic.key,lic.instance).then(v=>{ lic.valid=v; lic.checked=Date.now(); if(!v) delete lic.instance; saveLic(); licUI(); }).catch(()=>{});
if(navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(a=>{ midiAccess=a; a.onstatechange=refreshMidi; refreshMidi(); }).catch(()=>{ ui.midiNote.textContent='Web MIDI unavailable or blocked in this browser.'; });
else ui.midiNote.textContent='Web MIDI not supported in this browser (try Chrome/Edge).';
renderGrid(); licUI(); showLoad();

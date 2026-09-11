/* Original WebAudio sampler adapter. FluidR3 samples: CC BY 3.0. */
import {clamp,endTime,wavBytes} from './core.js';
const ROOT='https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiName(n){return names[n%12]+(Math.floor(n/12)-1)}
function decodeName(name){const m=/^([A-G])([#b]?)(-?\d+)$/.exec(name);if(!m)return NaN;let p={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]];return (+m[3]+1)*12+p+(m[2]==='#'?1:m[2]==='b'?-1:0)}
const cache=new Map();
function createImpulse(ctx,seconds=1.55){const len=Math.round(ctx.sampleRate*seconds),b=ctx.createBuffer(2,len,ctx.sampleRate);let seed=12345;for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++){seed=(seed*1664525+1013904223)>>>0;d[i]=((seed/4294967296)*2-1)*Math.pow(1-i/len,2.6)*.28}}return b}
async function getSamples(name,ctx){if(cache.has(name))return cache.get(name);const promise=(async()=>{
 const response=await fetch(ROOT+encodeURIComponent(name)+'-mp3.js',{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('音色來源暫時無法連線');const text=await response.text();const match=/MIDI\.Soundfont\.[a-zA-Z0-9_]+\s*=\s*\{/.exec(text);const start=match?text.indexOf('{',match.index):-1,end=text.lastIndexOf('}');if(start<0||end<start)throw Error('採樣資料格式無效');const data=JSON.parse(text.slice(start,end+1).replace(/,\s*}$/, '}'));const result=[];
 for(const [key,value] of Object.entries(data)){
  const pitch=decodeName(key);if(!Number.isFinite(pitch)||!/^data:audio\//.test(value))continue;
  const base64=value.split(',')[1],binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  try{const buffer=await ctx.decodeAudioData(bytes.buffer);result.push({pitch,buffer})}catch{}
 }
 if(!result.length)throw Error('沒有可解碼的小提琴採樣');result.sort((a,b)=>a.pitch-b.pitch);return result;
 })();cache.set(name,promise);try{return await promise}catch(e){cache.delete(name);throw e}}
export class ViolinSampler{
 constructor(){this.ctx=null;this.samples=null;this.instrument='violin';this.active=[];this.master=null;this.playing=false;this.startedAt=0;this.offset=0;this.speed=1;this.duration=0;this.notes=[];this.timer=0;this.settings={vibrato:16,reverb:18};this.onTime=()=>{};this.onStop=()=>{};this.onEnd=()=>{};this.playToken=0;this.graph=null}
 async context(){if(!this.ctx||this.ctx.state==='closed'){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw Error('此瀏覽器不支援音訊播放，請使用新版 Chrome、Edge 或 Safari');this.ctx=new Audio()}if(this.ctx.state==='suspended')await this.ctx.resume();return this.ctx}
 async load(name='violin',onStatus=()=>{}){
  const ctx=await this.context();
  if(this.samples&&this.instrument===name)return this.samples;
  if(!['violin','viola','cello','string_ensemble_1'].includes(name))throw Error('不支援的音色');
  onStatus('正在載入樂器採樣…');
  const samples=await getSamples(name,ctx);
  this.samples=samples;this.instrument=name;
  onStatus(`${samples.length} 個採樣已載入 · FluidR3 / CC BY 3.0`);
  return samples;
 }
 static schedule(ctx,samples,notes,{speed=1,vibrato=16,reverb=18,offset=0,output=null,volume=80}={}){
  speed=clamp(Number(speed)||1,.25,2);const nodes=[];const master=ctx.createGain();master.gain.value=clamp(Number(volume)/100,0,1)*.82;nodes.push(master);const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=12;limiter.ratio.value=3;limiter.attack.value=.003;limiter.release.value=.15;master.connect(limiter);limiter.connect(output||ctx.destination);nodes.push(limiter);
  const wet=clamp(reverb/100,0,1);if(wet>0){const convolver=ctx.createConvolver();convolver.buffer=createImpulse(ctx);const wetGain=ctx.createGain();wetGain.gain.value=wet*.42;master.connect(convolver);convolver.connect(wetGain);wetGain.connect(limiter);nodes.push(convolver,wetGain)}
  const startAt=ctx.currentTime+.06,active=[];for(const note of notes){const relative=(note.start-offset)/speed;if(relative+note.duration/speed<0)continue;const at=startAt+Math.max(0,relative),end=startAt+Math.max(0,relative+note.duration/speed);if(end<=at+.001)continue;
   let sample=samples[0];for(const s of samples)if(Math.abs(s.pitch-note.pitch)<Math.abs(sample.pitch-note.pitch))sample=s;
   const src=ctx.createBufferSource();src.buffer=sample.buffer;const base=Math.pow(2,(note.pitch-sample.pitch)/12);src.playbackRate.value=base;
   if(sample.buffer.duration>.45){src.loop=true;src.loopStart=Math.min(.18,sample.buffer.duration*.17);src.loopEnd=Math.max(src.loopStart+.1,sample.buffer.duration*.83)}
   const gain=ctx.createGain(),level=clamp(note.velocity,0.05,1)*.44;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.025);gain.gain.setValueAtTime(level,Math.max(at+.025,end-.08));gain.gain.linearRampToValueAtTime(0,end+.09);src.connect(gain);gain.connect(master);nodes.push(src,gain);
   if(vibrato>0){const lfo=ctx.createOscillator(),amount=ctx.createGain();lfo.frequency.value=5.5;amount.gain.setValueAtTime(0,at);amount.gain.linearRampToValueAtTime(base*(Math.pow(2,vibrato/1200)-1),at+.25);lfo.connect(amount);amount.connect(src.playbackRate);lfo.start(at);lfo.stop(end+.1);active.push(lfo);nodes.push(lfo,amount)}
   src.start(at);src.stop(end+.12);active.push(src);
  }return {active,master,limiter,startAt,dispose(){for(const n of active)try{n.stop()}catch{}for(const n of nodes)try{n.disconnect()}catch{}}};
 }
 stop({reset=true}={}){
  ++this.playToken;
  if(this.playing)this.offset=this.position();
  this.playing=false;
  this.graph?.dispose();this.graph=null;this.active=[];this.master=null;
  if(this.timer)cancelAnimationFrame(this.timer);this.timer=0;
  if(reset)this.offset=0;
  this.onTime(this.offset,this.duration);this.onStop();
 }
 position(){return this.playing?clamp(this.offset+Math.max(0,this.ctx.currentTime-this.startedAt)*this.speed,0,this.duration):this.offset}
 async play(notes,settings={}){
  if(!notes?.length)throw Error('尚無可播放的音符');
  this.stop({reset:false});const token=this.playToken;
  this.notes=notes;this.duration=endTime(notes);this.speed=clamp(Number(settings.speed)||1,.25,2);
  if(this.offset>=this.duration)this.offset=0;
  this.settings={vibrato:Number(settings.vibrato)||0,reverb:Number(settings.reverb)||0,volume:settings.volume??80};
  const samples=await this.load(settings.instrument||this.instrument,settings.onStatus);
  if(token!==this.playToken)return false;
  const ctx=await this.context();if(token!==this.playToken)return false;
  const run=ViolinSampler.schedule(ctx,samples,notes,{...this.settings,speed:this.speed,offset:this.offset});
  this.graph=run;this.active=run.active;this.master=run.master;this.startedAt=run.startAt;this.playing=true;
  const tick=()=>{
   if(!this.playing||token!==this.playToken)return;
   const p=this.position();this.onTime(p,this.duration);
   if(ctx.currentTime>=this.startedAt+(this.duration-this.offset)/this.speed+.2){this.stop();this.onEnd();return}
   this.timer=requestAnimationFrame(tick);
  };tick();return true;
 }
 pause(){this.stop({reset:false})}
 seek(seconds){const was=this.playing;this.stop({reset:false});this.offset=clamp(seconds,0,this.duration);this.onTime(this.offset,this.duration);return was}
 async render(notes,settings={},onStatus=()=>{}){
  if(!notes.length)throw Error('尚無可輸出的音符');
  const speed=clamp(Number(settings.speed)||1,.25,2),duration=endTime(notes)/speed+1.8;
  if(duration>601.8)throw Error('依目前速度，WAV 超過 10 分鐘，請分段或提高速度');
  const sr=44100,len=Math.ceil(duration*sr);
  const samples=await this.load(settings.instrument||this.instrument,onStatus);
  settings.signal?.throwIfAborted();
  onStatus('正在離線合成 WAV…');
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error('此瀏覽器不支援 WAV 合成');
  const ctx=new Offline(2,len,sr);
  const run=ViolinSampler.schedule(ctx,samples,notes,{...settings,speed,offset:0});
  let buffer;try{buffer=await ctx.startRendering()}finally{run.dispose()}
  settings.signal?.throwIfAborted();
  return wavBytes([buffer.getChannelData(0),buffer.getChannelData(1)],sr);
 }
}

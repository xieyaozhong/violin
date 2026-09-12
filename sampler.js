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
 static schedule(ctx,samples,notes,{speed=1,vibrato=16,reverb=18,offset=0,end=endTime(notes),output=null,volume=80,realtime=false,bpm=120,beats=4,beatType=4,metronome=false,countIn=0,clickVolume=35}={}){
  speed=clamp(Number(speed)||1,.25,2);bpm=clamp(Number(bpm)||120,20,300);
  beats=clamp(Math.round(Number(beats)||4),1,12);beatType=[2,4,8,16].includes(Number(beatType))?Number(beatType):4;
  countIn=[1,2].includes(Number(countIn))?Number(countIn):0;
  const nodes=new Set(),active=new Set(),master=ctx.createGain();
  master.gain.value=clamp(Number(volume)/100,0,1)*.82;nodes.add(master);
  const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=12;limiter.ratio.value=3;limiter.attack.value=.003;limiter.release.value=.15;
  master.connect(limiter);limiter.connect(output||ctx.destination);nodes.add(limiter);
  const wet=clamp(reverb/100,0,1);
  if(wet>0){const convolver=ctx.createConvolver();convolver.buffer=createImpulse(ctx);const wetGain=ctx.createGain();wetGain.gain.value=wet*.42;master.connect(convolver);convolver.connect(wetGain);wetGain.connect(limiter);nodes.add(convolver);nodes.add(wetGain)}
  const beatSeconds=60/bpm*4/beatType,beatDuration=beatSeconds/speed,cueAt=ctx.currentTime+.06,startAt=cueAt+countIn*beats*beatDuration;
  const sorted=[...notes].sort((a,b)=>a.start-b.start);let cursor=0,cue=0,beatIndex=Math.ceil(offset/beatSeconds-1e-8),disposed=false;
  function retain(source,owned,oscillators=[]){
   owned.forEach(n=>nodes.add(n));active.add(source);oscillators.forEach(n=>active.add(n));
   source.onended=()=>{
    source.onended=null;active.delete(source);oscillators.forEach(n=>active.delete(n));
    for(const n of owned){try{n.disconnect()}catch{}nodes.delete(n)}
   };
  }
  function click(at,accent){
   if(at<ctx.currentTime-.02)return;
   at=Math.max(at,ctx.currentTime);const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.frequency.value=accent?1320:880;gain.gain.setValueAtTime(clamp(clickVolume/100,0,1)*.35,at);gain.gain.linearRampToValueAtTime(0,at+.045);
   osc.connect(gain);gain.connect(master);retain(osc,[osc,gain]);osc.start(at);osc.stop(at+.05);
  }
  function noteOn(note){
   const until=startAt+(Math.min(end,note.start+note.duration)-offset)/speed;
   const at=Math.max(ctx.currentTime,startAt+Math.max(0,(note.start-offset)/speed));
   if(note.start>=end||until<=at+.001)return;
   let sample=samples[0];for(const s of samples)if(Math.abs(s.pitch-note.pitch)<Math.abs(sample.pitch-note.pitch))sample=s;
   const src=ctx.createBufferSource();src.buffer=sample.buffer;const base=Math.pow(2,(note.pitch-sample.pitch)/12);src.playbackRate.value=base;
   if(sample.buffer.duration>.45){src.loop=true;src.loopStart=Math.min(.18,sample.buffer.duration*.17);src.loopEnd=Math.max(src.loopStart+.1,sample.buffer.duration*.83)}
   const gain=ctx.createGain(),owned=[src,gain],oscillators=[],level=clamp(note.velocity,0.05,1)*.44;
   const attack=Math.min(.025,(until-at)/3);
   gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+attack);gain.gain.setValueAtTime(level,Math.max(at+attack,until-.08));gain.gain.linearRampToValueAtTime(0,until+.09);
   src.connect(gain);gain.connect(master);
   if(vibrato>0){const lfo=ctx.createOscillator(),amount=ctx.createGain();lfo.frequency.value=5.5;amount.gain.setValueAtTime(0,at);amount.gain.linearRampToValueAtTime(base*(Math.pow(2,vibrato/1200)-1),at+.25);lfo.connect(amount);amount.connect(src.playbackRate);lfo.start(at);lfo.stop(until+.1);owned.push(lfo,amount);oscillators.push(lfo)}
   retain(src,owned,oscillators);src.start(at);src.stop(until+.12);
  }
  function pump(horizon=ctx.currentTime+1.2){
   if(disposed)return;
   while(cue<countIn*beats&&cueAt+cue*beatDuration<=horizon){click(cueAt+cue*beatDuration,cue%beats===0);cue++}
   while(cursor<sorted.length&&startAt+(sorted[cursor].start-offset)/speed<=horizon)noteOn(sorted[cursor++]);
   if(metronome){
    // Skip missed beats after a throttled/background timer instead of bursting clicks.
    beatIndex=Math.max(beatIndex,Math.ceil((offset+(ctx.currentTime-startAt)*speed)/beatSeconds-1e-8));
    while(beatIndex*beatSeconds<end-1e-8&&startAt+(beatIndex*beatSeconds-offset)/speed<=horizon){click(startAt+(beatIndex*beatSeconds-offset)/speed,beatIndex%beats===0);beatIndex++}
   }
  }
  pump(realtime?ctx.currentTime+1.2:Infinity);
  return {active,master,limiter,startAt,beatDuration,pump,get nodeCount(){return nodes.size},dispose(){
   disposed=true;for(const n of active){n.onended=null;try{n.stop()}catch{}}
   for(const n of nodes)try{n.disconnect()}catch{}active.clear();nodes.clear();
  }};
 }
 stop({reset=true}={}){
  ++this.playToken;
  if(this.playing)this.offset=this.position();
  this.playing=false;
  this.graph?.dispose();this.graph=null;this.active=[];this.master=null;
  if(this.timer)clearInterval(this.timer);this.timer=0;
  if(reset)this.offset=0;
  this.onTime(this.offset,this.duration);this.onStop();
 }
 position(){return this.playing?clamp(this.offset+Math.max(0,this.ctx.currentTime-this.startedAt)*this.speed,0,this.playEnd??this.duration):this.offset}
 async play(notes,settings={}){
  if(!notes?.length)throw Error('尚無可播放的音符');
  this.stop({reset:false});const token=this.playToken;
  this.notes=notes;this.duration=endTime(notes);this.speed=clamp(Number(settings.speed)||1,.25,2);
  const start=clamp(Number(settings.start)||0,0,this.duration);
  this.playEnd=clamp(Number(settings.end)||this.duration,start,this.duration);
  if(this.playEnd-start<.001)throw Error('播放區段沒有長度');
  if(this.offset<start||this.offset>=this.playEnd)this.offset=start;
  this.settings={vibrato:Number(settings.vibrato)||0,reverb:Number(settings.reverb)||0,volume:settings.volume??80};
  const samples=await this.load(settings.instrument||this.instrument,settings.onStatus);
  if(token!==this.playToken)return false;
  const ctx=await this.context();if(token!==this.playToken)return false;
  const run=ViolinSampler.schedule(ctx,samples,notes,{...settings,...this.settings,speed:this.speed,offset:this.offset,end:this.playEnd,realtime:true});
  this.graph=run;this.active=run.active;this.master=run.master;this.startedAt=run.startAt;this.playing=true;
  const tick=()=>{
   if(!this.playing||token!==this.playToken)return;
   run.pump();const p=this.position();this.onTime(p,this.duration,Math.max(0,Math.ceil((this.startedAt-ctx.currentTime-.06)/run.beatDuration)));
   if(ctx.currentTime>=this.startedAt+(this.playEnd-this.offset)/this.speed+.12){this.stop();this.onEnd();return}
  };this.timer=setInterval(tick,50);tick();return true;
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
  const run=ViolinSampler.schedule(ctx,samples,notes,{...settings,speed,offset:0,end:endTime(notes),metronome:false,countIn:0,realtime:false});
  let buffer;try{buffer=await ctx.startRendering()}finally{run.dispose()}
  settings.signal?.throwIfAborted();
  return wavBytes([buffer.getChannelData(0),buffer.getChannelData(1)],sr);
 }
}

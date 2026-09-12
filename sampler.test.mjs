import test from 'node:test';
import assert from 'node:assert/strict';
import {ViolinSampler} from './sampler.js';
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
function context(){
 const nodes=[];
 const node=(kind='effect')=>{const n={kind,gain:param(),frequency:param(),playbackRate:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){this.disconnected=true},start(at){this.at=at},stop(at){this.stopped=true;this.until=at}};nodes.push(n);return n};
 return {nodes,currentTime:0,sampleRate:44100,state:'running',destination:{},createGain:()=>node(),createDynamicsCompressor:()=>node(),createBufferSource:()=>node('sample'),createOscillator:()=>node('oscillator'),createConvolver:()=>node(),
 createBuffer:(_c,len)=>({getChannelData:()=>new Float32Array(len)}),
 decodeAudioData:async()=>({duration:1})};
}
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
test('soundfont wrapper parses without executing JavaScript',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,text:async()=>'if(typeof MIDI==="undefined")var MIDI={}; MIDI.Soundfont={}; MIDI.Soundfont.violin = {"A4":"data:audio/mp3;base64,AAAA",\n};'});
 try{const s=new ViolinSampler();s.ctx=context();const samples=await s.load();assert.equal(samples.length,1);assert.equal(samples[0].pitch,69)}
 finally{globalThis.fetch=previous}
});
test('live scheduling allocates only upcoming notes and frees ended voices',()=>{
 const ctx=context(),notes=Array.from({length:20000},(_,i)=>({pitch:69,start:i*.3,duration:.2,velocity:.8}));
 const run=ViolinSampler.schedule(ctx,[{pitch:69,buffer:{duration:1}}],notes,{realtime:true,vibrato:0,reverb:0});
 assert.ok(ctx.nodes.length<20,'must not allocate an entire long piece');
 const sources=ctx.nodes.filter(n=>n.kind==='sample');assert.equal(sources.length,4);
 for(const source of sources)source.onended();
 assert.equal(run.nodeCount,2);assert.equal(run.active.size,0);
 ctx.currentTime=10;run.pump();
 const newer=ctx.nodes.filter(n=>n.kind==='sample'&&!n.disconnected);
 assert.ok(newer.length<7);assert.ok(newer.every(n=>n.at>=10));
 run.dispose();assert.equal(run.nodeCount,0);assert.ok(ctx.nodes.every(n=>n.disconnected));
});
test('count-in follows meter and speed, region playback clips sustains at B',()=>{
 const ctx=context(),notes=[{pitch:69,start:0,duration:5,velocity:.8},{pitch:72,start:3,duration:1,velocity:.8}];
 const run=ViolinSampler.schedule(ctx,[{pitch:69,buffer:{duration:1}}],notes,{offset:1,end:3,bpm:120,beats:6,beatType:8,speed:.5,countIn:1,metronome:true,reverb:0,vibrato:0});
 assert.ok(Math.abs(run.startAt-3.06)<1e-8);assert.equal(run.beatDuration,.5);
 const samples=ctx.nodes.filter(n=>n.kind==='sample');assert.equal(samples.length,1);
 assert.ok(Math.abs(samples[0].at-3.06)<1e-8);assert.ok(Math.abs(samples[0].until-7.18)<1e-8);
 const clicks=ctx.nodes.filter(n=>n.kind==='oscillator');assert.equal(clicks.length,14);
 assert.equal(clicks[0].frequency.value,1320);assert.equal(clicks[1].frequency.value,880);
 run.dispose();assert.ok(ctx.nodes.every(n=>n.disconnected));
});
test('play starts inside A–B and seek/stop cancel all scheduled work',async()=>{
 const s=new ViolinSampler();s.ctx=context();s.load=async()=>[{pitch:69,buffer:{duration:1}}];
 const notes=[{pitch:69,start:0,duration:8,velocity:.8}];
 try{
  await s.play(notes,{start:2,end:4,countIn:1,bpm:120,reverb:0});assert.equal(s.offset,2);assert.equal(s.playEnd,4);
  s.ctx.currentTime=s.startedAt+10;assert.equal(s.position(),4);
  s.seek(3);assert.equal(s.offset,3);assert.equal(s.playing,false);assert.equal(s.timer,0);
  assert.ok(s.ctx.nodes.every(n=>n.disconnected));
 }finally{s.stop()}
});
test('stop during sample loading prevents late playback; newest play wins',async()=>{
 const s=new ViolinSampler();s.ctx=context();let resolve;
 s.load=()=>new Promise(r=>resolve=r);
 const playing=s.play([{pitch:69,start:0,duration:1,velocity:.8}]);s.stop();resolve([{pitch:69,buffer:{duration:1}}]);
 assert.equal(await playing,false);assert.equal(s.playing,false);assert.equal(s.ctx.nodes.length,0);
 const pending=[];s.load=()=>new Promise(r=>pending.push(r));
 const first=s.play([{pitch:60,start:0,duration:1,velocity:.8}]),last=s.play([{pitch:72,start:0,duration:1,velocity:.8}]);
 pending[1]([{pitch:72,buffer:{duration:1}}]);assert.equal(await last,true);
 pending[0]([{pitch:60,buffer:{duration:1}}]);assert.equal(await first,false);
 s.stop();assert.ok(s.ctx.nodes.every(n=>n.disconnected));
});
test('WAV frame length follows playback speed and supports zero volume',async()=>{
 const previous=globalThis.OfflineAudioContext;let settings;
 globalThis.OfflineAudioContext=class{
  constructor(channels,length,sampleRate){Object.assign(this,context());this.length=length;this.sampleRate=sampleRate;settings=this}
  async startRendering(){return {getChannelData:()=>new Float32Array(this.length)}}
 };
 try{
  const s=new ViolinSampler();s.load=async()=>[{pitch:69,buffer:{duration:1}}];
  const bytes=await s.render([{pitch:69,start:0,duration:2,velocity:.8}],{speed:.5,volume:0,reverb:0});
  assert.equal(settings.length,Math.ceil(5.8*44100));assert.equal(bytes.length,44+settings.length*4);
  assert.equal(settings.nodes[0].gain.value,0);
 }finally{globalThis.OfflineAudioContext=previous}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {ViolinSampler} from './sampler.js';
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
function context(){
 const nodes=[];
 const node=()=>{const n={gain:param(),frequency:param(),playbackRate:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){this.disconnected=true},start(){},stop(){this.stopped=true}};nodes.push(n);return n};
 return {nodes,currentTime:0,sampleRate:44100,state:'running',destination:{},createGain:node,createDynamicsCompressor:node,createBufferSource:node,createOscillator:node,createConvolver:node,
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

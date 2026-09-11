import assert from 'node:assert/strict';
import test from 'node:test';
import {Window} from 'happy-dom';
import * as C from './core.js';
import {parseProject,History} from './project.js';
const window=new Window();
globalThis.DOMParser=window.DOMParser;
const n=(pitch,start=0,duration=.5)=>({pitch,start,duration,velocity:.8});
test('MIDI format 1 reads both complete tracks, with shared tempo',()=>{
 const one=C.encodeMidi([n(60)]),two=C.encodeMidi([n(72,1,1)]);
 const combined=new Uint8Array(one.length+two.length-14);combined.set(one);combined.set(two.slice(14),one.length);combined[9]=1;combined[11]=2;
 const read=C.decodeMidi(combined);assert.equal(read.tracks.length,2);assert.deepEqual(read.notes.map(x=>x.pitch),[60,72]);assert.equal(read.notes[1].start,1);
});
test('invalid MIDI cannot read outside its track',()=>{
 const bytes=C.encodeMidi([n(60)]);const truncated=bytes.slice(0,-2);
 assert.throws(()=>C.decodeMidi(truncated));
 const bad=bytes.slice();bad[12]=0;bad[13]=0;assert.throws(()=>C.decodeMidi(bad));
});
test('same-pitch repeated attacks survive arrangement; overlap is actually removed',()=>{
 assert.equal(C.arrange([n(69,0,.5),n(69,.5,.5)]).length,2);
 const result=C.preventOverlap([n(60,0,1),n(72,0,1),n(74,.5,1)]);
 for(let i=1;i<result.length;i++)assert.ok(result[i-1].start+result[i-1].duration<=result[i].start);
 assert.equal(C.quantize([n(69,0,.005)],120,4,0)[0].duration,.005);
});
test('normalization tolerates bad velocity and rejects invalid notes',()=>{
 assert.equal(C.normalize([{...n(60),velocity:NaN}])[0].velocity,.8);
 assert.equal(C.normalize([null,n(60,-1)]).length,0);
 assert.throws(()=>C.validateNotes([n(60,7201)]));
});
test('MusicXML ties precede voice/type and roundtrip preserves irregular note times',()=>{
 const input=[n(60,.137,.348),n(64,1.019,3.1)];
 const xml=C.encodeMusicXML(input,{bpm:120,grid:0,title:'測試 & <作品>'});
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 assert.equal(doc.querySelector('parsererror'),null);
 for(const note of doc.querySelectorAll('note')){
  const tags=[...note.children].map(x=>x.localName);
  if(tags.includes('tie'))assert.ok(tags.indexOf('tie')<tags.indexOf('voice'));
 }
 const result=C.decodeMusicXML(xml);
 assert.equal(result.notes.length,input.length);
 input.forEach((note,i)=>{assert.ok(Math.abs(result.notes[i].start-note.start)<.001);assert.ok(Math.abs(result.notes[i].duration-note.duration)<.002)});
});
test('snapped MusicXML collisions do not shift later onsets',()=>{
 const xml=C.encodeMusicXML([n(60,0,.3),n(62,.26,.3)],{bpm:120,grid:2});
 const out=C.decodeMusicXML(xml).notes;assert.ok(Math.abs(out[1].start-.25)<.001);
});
const attrs='<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
const note=(pitch='C',d=1)=>'<note><pitch><step>'+pitch+'</step><octave>4</octave></pitch><duration>'+d+'</duration></note>';
test('MusicXML measure cursor follows longest voice, not final backup voice',()=>{
 const xml='<score-partwise><part id="P1"><measure>'+attrs+note('C',4)+'<backup><duration>4</duration></backup>'+note('E',1)+'</measure><measure>'+note('G',1)+'</measure></part></score-partwise>';
 const out=C.decodeMusicXML(xml).notes;assert.equal(out.at(-1).start,2);
});
test('MusicXML timewise parts and global tempo changes',()=>{
 const xml='<score-timewise><measure number="1"><part id="P1">'+attrs+'<direction><sound tempo="60"/></direction>'+note('C',4)+'</part><part id="P2">'+attrs+note('G',4)+'</part></measure><measure number="2"><part id="P1"><direction><sound tempo="120"/></direction>'+note('D',4)+'</part><part id="P2">'+note('A',4)+'</part></measure></score-timewise>';
 const out=C.decodeMusicXML(xml);assert.equal(out.bpm,60);assert.deepEqual(out.notes.map(x=>x.start),[0,0,4,4]);assert.deepEqual(out.notes.map(x=>x.duration),[4,4,2,2]);
});
test('new project preserves raw pitch and legacy draft avoids re-transposing',()=>{
 const current=parseProject({format:'violin-atlas-project',version:2,title:'Test',notes:[n(72)],raw:[n(60)],controls:{transpose:'12'},bpm:90});
 assert.equal(current.raw[0].pitch,60);assert.equal(current.controls.transpose,'12');
 const legacy=parseProject({version:1,notes:[n(72)],settings:{transpose:12,minNote:'.2',analyzeLimit:'30'}});
 assert.equal(legacy.controls.transpose,0);assert.equal(legacy.controls['min-note'],'.2');
 assert.throws(()=>parseProject({format:'wrong',version:2,notes:[],raw:[]}));
});
test('undo and redo restore tempo together with notes',()=>{
 const h=new History();h.push({notes:[n(60)],bpm:90});const before=h.back({notes:[n(72)],bpm:120});assert.equal(before.bpm,90);assert.equal(h.forward(before).notes[0].pitch,72);
});

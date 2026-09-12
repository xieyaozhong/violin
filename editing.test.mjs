import test from 'node:test';
import assert from 'node:assert/strict';
import {editNotes,clipNotes,selectionRange,practiceSettings,notesCSV} from './editing.js';
import {parseProject,PROJECT_FORMAT} from './project.js';
const n=(pitch,start,duration=1)=>({pitch,start,duration,velocity:.8});

test('batch transforms only selected notes and preserves selection after sorting',()=>{
 const input=[n(69,0),n(72,1),n(74,2)],before=structuredClone(input);
 const moved=editNotes(input,new Set([2]),'shift',{value:-4,bpm:120});
 assert.deepEqual(moved.notes.map(x=>[x.pitch,x.start]),[[69,0],[74,0],[72,1]]);
 assert.deepEqual([...moved.selection],[1]);assert.deepEqual(input,before);
 const transpose=editNotes(input,new Set([0,2]),'transpose',{value:12});
 assert.deepEqual(transpose.notes.map(x=>x.pitch),[81,72,86]);
 const velocity=editNotes(input,new Set([1]),'velocity',{value:64});
 assert.equal(velocity.notes[1].velocity,64/127);assert.equal(velocity.notes[0].velocity,.8);
});
test('invalid batch edits are atomic, including bounds and limits',()=>{
 const input=[n(127,0),n(60,7198)],before=structuredClone(input);
 for(const [action,options] of [['transpose',{value:1}],['shift',{value:-1}],['velocity',{value:0}],['transpose',{value:.5}],['duplicate',{}]]){
  assert.throws(()=>editNotes(input,new Set([0,1]),action,options));assert.deepEqual(input,before);
 }
 const many=Array.from({length:20000},()=>n(60,0));
 assert.throws(()=>editNotes(many,new Set([0]),'duplicate'),/20,000/);
 assert.throws(()=>editNotes(input,new Set(),'delete'),/勾選/);
});
test('duplicate appends a complete selected phrase and selects its copies',()=>{
 const input=[n(69,2,.5),n(71,3,.5),n(60,5,.2)];
 const result=editNotes(input,new Set([0,1]),'duplicate');
 assert.deepEqual(result.notes.map(x=>[x.pitch,x.start]),[[69,2],[71,3],[69,3.5],[71,4.5],[60,5]]);
 assert.deepEqual([...result.selection],[2,3]);
 const removed=editNotes(result.notes,result.selection,'delete');
 assert.equal(removed.notes.length,3);assert.equal(removed.selection.size,0);
 assert.deepEqual(selectionRange(input,new Set([0,1])),{start:2,end:3.5});
});
test('selected quantization leaves other timing unchanged',()=>{
 const result=editNotes([n(69,.11,.33),n(71,.62,.28)],new Set([0]),'quantize',{bpm:120,grid:4});
 assert.equal(result.notes[0].start,.125);assert.equal(result.notes[1].start,.62);
 assert.equal(result.notes[1].duration,.28);
});
test('A–B clipping includes sustaining notes and excludes exact outer boundaries',()=>{
 const input=[n(60,0,1),n(69,.5,2),n(71,1.5,2),n(72,2,1)];
 const out=clipNotes(input,1,2);
 assert.deepEqual(out.map(x=>[x.pitch,x.start,x.duration]),[[69,0,1],[71,.5,.5]]);
 assert.throws(()=>clipNotes(input,2,1));assert.throws(()=>clipNotes(input,0,.01));
 assert.equal(input[1].duration,2);
});
test('practice settings clamp malformed projects and old projects get safe defaults',()=>{
 const data={format:PROJECT_FORMAT,version:2,notes:[n(69,0,10)],raw:[],practice:{region:true,start:2,end:8,loop:true,metronome:true,countIn:2,clickVolume:0}};
 const p=parseProject(data);assert.equal(p.practice.start,2);assert.equal(p.practice.end,8);assert.equal(p.practice.clickVolume,0);
 const restored=parseProject(JSON.stringify(p));assert.deepEqual(restored.practice,p.practice);
 delete data.practice;assert.deepEqual(parseProject(data).practice,practiceSettings({},10));
 const invalid=practiceSettings({region:true,start:15,end:-10,loop:'yes',countIn:100,clickVolume:500},10);
 assert.equal(invalid.region,false);assert.equal(invalid.end,10);assert.equal(invalid.countIn,0);assert.equal(invalid.loop,false);assert.equal(invalid.clickVolume,100);
});
test('CSV has UTF-8 BOM and deterministic numeric columns',()=>{
 const csv=notesCSV([n(61,1.25,.5)]);
 assert.ok(csv.startsWith('\uFEFFMIDI,'));assert.match(csv,/61,C#4,1.250000,0.500000,102\r\n$/);
});

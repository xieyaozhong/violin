import {validateNotes,clamp,endTime} from './core.js';
import {practiceSettings} from './editing.js';
export const PROJECT_FORMAT='violin-atlas-project';
export function parseProject(input){
 const d=typeof input==='string'?JSON.parse(input):input;
 if(!d||![1,2].includes(d.version)||!Array.isArray(d.notes))throw Error('不是有效的弦之境專案');
 if(d.version===2&&d.format!==PROJECT_FORMAT)throw Error('專案格式不符');
 const notes=validateNotes(d.notes),legacy=d.version===1;
 const raw=validateNotes(legacy?notes:d.raw);
 const controls={...(d.controls||d.settings||{})};
 controls['min-note']??=controls.minNote;controls['analyze-limit']??=controls.analyzeLimit;
 // Old drafts only saved processed notes. Neutralize transforms before reusing them.
 if(legacy)Object.assign(controls,{transpose:0,mode:'all',quantize:0,octaves:false});
 const bpm=clamp(Number(d.bpm??controls.bpm)||120,20,300);
 return {version:2,format:PROJECT_FORMAT,notes,raw,bpm,title:String(d.title||'Violin arrangement').slice(0,100),
  sourceName:String(d.sourceName||'專案').slice(0,250),controls,audio:d.audio||{},practice:practiceSettings(d.practice||{},endTime(notes)),notation:d.notation||null,savedAt:Number(d.savedAt)||Date.now()};
}
export function snapshot(state){
 return structuredClone({notes:state.notes,bpm:state.bpm,notation:state.notation});
}
export class History{
 constructor(limit=30){this.limit=limit;this.undo=[];this.redo=[]}
 clear(){this.undo=[];this.redo=[]}
 push(value){this.undo.push(structuredClone(value));if(this.undo.length>this.limit)this.undo.shift();this.redo=[]}
 back(current){if(!this.undo.length)return null;this.redo.push(structuredClone(current));return this.undo.pop()}
 forward(current){if(!this.redo.length)return null;this.undo.push(structuredClone(current));return this.redo.pop()}
}

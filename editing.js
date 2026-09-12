/* Non-destructive editor and practice helpers. All times are score seconds. */
import {validateNotes,normalize,quantize,clamp,endTime,noteName} from './core.js';

export function practiceSettings(input={},total=0){
 const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
 const start=clamp(number(input.start,0),0,total);
 const end=clamp(number(input.end,total),0,total);
 const region=input.region===true&&end-start>=.05;
 return {region,start:region?start:0,end:region?end:total,loop:input.loop===true,
  metronome:input.metronome===true,countIn:[0,1,2].includes(Number(input.countIn))?Number(input.countIn):0,
  clickVolume:clamp(number(input.clickVolume,35),0,100)};
}

export function clipNotes(notes,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end-start<.05)throw Error('A–B 區段至少需要 0.05 秒，且 B 必須晚於 A');
 return validateNotes(notes.flatMap(n=>{
  const a=Math.max(start,n.start),b=Math.min(end,n.start+n.duration);
  return b-a>1e-6?[{...n,start:Math.max(0,a-start),duration:b-a}]:[];
 }));
}

export function selectionRange(notes,selected){
 const chosen=notes.filter((_,i)=>selected.has(i));
 if(!chosen.length)throw Error('請先勾選音符');
 return {start:chosen.reduce((a,n)=>Math.min(a,n.start),Infinity),end:endTime(chosen)};
}

export function editNotes(notes,selected,action,{value=0,bpm=120,grid=4}={}){
 const chosen=new Set([...selected].filter(i=>Number.isInteger(i)&&notes[i]));
 if(!chosen.size)throw Error('請先勾選音符');
 if(!['transpose','shift','velocity','quantize','duplicate','delete'].includes(action))throw Error('不支援的編輯操作');
 value=Number(value);
 if(!Number.isFinite(value))throw Error('請輸入有效數值');
 if(action==='transpose'&&!Number.isInteger(value))throw Error('移調必須是整數半音');
 if(action==='velocity'&&(value<1||value>127))throw Error('力度須為 1–127');
 if(action==='quantize'&&![1,2,4,8].includes(Number(grid)))throw Error('請選擇量化單位');
 if(action==='duplicate'&&notes.length+chosen.size>20000)throw Error('複製後超過 20,000 個音符上限');
 const range=selectionRange(notes,chosen),span=range.end-range.start;
 const output=[];
 notes.forEach((source,i)=>{
  const picked=chosen.has(i);let note={...source};
  if(picked){
   if(action==='delete')return;
   if(action==='transpose')note.pitch+=value;
   if(action==='shift')note.start+=value*60/bpm;
   if(action==='velocity')note.velocity=Math.round(value)/127;
   if(action==='quantize')note=quantize([note],bpm,Number(grid),1)[0];
  }
  if(!Number.isFinite(note.start)||note.start<0||note.pitch<0||note.pitch>127)throw Error('此操作會超出 MIDI 0–127 音域或把音符移到 0 秒之前；作品未變更');
  output.push({note,picked:picked&&action!=='duplicate'});
  if(picked&&action==='duplicate')output.push({note:{...source,id:undefined,start:source.start+span},picked:true});
 });
 output.sort((a,b)=>a.note.start-b.note.start||a.note.pitch-b.note.pitch);
 const result=validateNotes(output.map(x=>x.note));
 return {notes:result,selection:new Set(output.flatMap((x,i)=>x.picked?[i]:[]))};
}

export function notesCSV(notes){
 return '\uFEFF'+'MIDI,音名,開始秒數,長度秒數,力度\r\n'+normalize(notes).map(n=>
  [n.pitch,noteName(n.pitch),n.start.toFixed(6),n.duration.toFixed(6),Math.round(n.velocity*127)].join(',')
 ).join('\r\n')+'\r\n';
}

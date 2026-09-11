// A disposable worker keeps inference off the editor thread and releases model memory.
import {normalize,clamp} from './core.js';
self.onmessage=async({data:{samples,threshold,minNote}})=>{
 try{
  self.postMessage({progress:2,stage:'載入 AI 模型'});
  const bp=await import('https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/+esm');
  // Same pinned TensorFlow module used by the Basic Pitch CDN bundle.
  const tf=await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.19.0/+esm');
  const model=new bp.BasicPitch('https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json');
  await model.model;
  const sr=22050,total=samples.length/sr,windowSize=22,step=21.4,notes=[];
  for(let start=0;start<total;start+=step){
   const end=Math.min(total,start+windowSize),frames=[],onsets=[];
   tf.engine().startScope();
   try{await model.evaluateModel(samples.subarray(Math.round(start*sr),Math.round(end*sr)),
    (f,o)=>{frames.push(...f);onsets.push(...o)},
    p=>self.postMessage({progress:5+90*(start+(end-start)*p)/total,stage:'AI 音高辨識',detail:Math.round(end)+' / '+Math.ceil(total)+' 秒'}));
   }finally{tf.engine().endScope()}
   const events=bp.noteFramesToTime(bp.outputToNotesPoly(frames,onsets,threshold,threshold,Math.max(1,Math.round(minNote*sr/256))));
   for(const n of events){
    const at=Math.max(0,start+n.startTimeSeconds),length=Math.min(n.durationSeconds,total-at);
    if(length<=0)continue;
    const note={pitch:n.pitchMidi,start:at,duration:length,velocity:clamp(n.amplitude||.8,1/127,1)};
    const match=notes.findLast(x=>x.pitch===note.pitch&&Math.min(x.start+x.duration,at+length)-Math.max(x.start,at)>Math.min(x.duration,length)*.6);
    if(match)match.duration=Math.max(match.start+match.duration,at+length)-match.start;
    else notes.push(note);
   }
   if(notes.length>20000)throw Error('辨識超過 20,000 個音符，請縮短分析區段');
   if(end>=total)break;
  }
  const result=normalize(notes);
  if(!result.length)throw Error('未辨識到音符。請降低音符門檻，或改用清晰獨奏音軌、MIDI');
  self.postMessage({notes:result});
 }catch(e){self.postMessage({error:e.message||'音高辨識失敗'})}
};

/* Violin Atlas Converter — original code, MIT. No network or browser dependency. */
export const VERSION='2.0.0';
export const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const OPEN_STRINGS=[55,62,69,76];
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const noteName=n=>NAMES[((Math.round(n)%12)+12)%12]+(Math.floor(Math.round(n)/12)-1);
export const hz=n=>440*Math.pow(2,(n-69)/12);
export const safeName=s=>String(s||'violin').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
export function normalize(notes) {
 if (!Array.isArray(notes)) return [];
 return notes.filter(n=>n && typeof n==='object').map((n,i)=>({
  ...n,id:n.id??i,pitch:Math.round(Number(n.pitch??n.midi??n.pitchMidi)),
  start:Number(n.start??n.time??n.startTimeSeconds??0),duration:Number(n.duration??n.durationSeconds??0),
  velocity:Number.isFinite(Number(n.velocity??n.amplitude))?clamp(Number(n.velocity??n.amplitude),1/127,1):.8,
  track:n.track??0,channel:n.channel??0
 })).filter(n=>Number.isFinite(n.pitch)&&Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.start>=0&&n.duration>0&&n.pitch>=0&&n.pitch<=127).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}
export const endTime=notes=>notes.reduce((end,n)=>Math.max(end,n.start+n.duration),0);
export function validateNotes(notes) {
 if(!Array.isArray(notes)||notes.length>20000)throw Error('音符上限為 20,000 個，請分段處理');
 const clean=normalize(notes);
 if(clean.length!==notes.length||endTime(clean)>7200)throw Error('音符資料無效，或作品超過 2 小時');
 return clean;
}
export function foldPitch(p,lo=55,hi=100){p=Math.round(p);if(lo>hi)throw Error('音域設定錯誤');let candidates=[];for(let k=-10;k<=10;k++){let q=p+12*k;if(q>=lo&&q<=hi)candidates.push(q)}return candidates.length?candidates.reduce((a,b)=>Math.abs(b-p)<Math.abs(a-p)?b:a):clamp(p,lo,hi)}
export function arrange(source,opts={}){
 const {mode='melody',low=55,high=100,octaves=true,transpose=0,maxVoices=2}=opts;
 let notes=normalize(source).map(n=>({...n,pitch:n.pitch+Number(transpose)}));
 if(octaves)notes=notes.map(n=>({...n,pitch:foldPitch(n.pitch,low,high)}));
 else notes=notes.filter(n=>n.pitch>=low&&n.pitch<=high);
 if(!notes.length)return [];
 if(mode==='all')return notes;
 if(mode==='melody'||mode==='bass'){
  const bounds=[...new Set(notes.flatMap(n=>[n.start,n.start+n.duration]).map(x=>Math.round(x*10000)/10000))].sort((a,b)=>a-b);
  const out=[];let previous=null,chosen=null,chosenSource=null,at=0;const active=new Map();
  for(let i=0;i<bounds.length-1;i++){
   const a=bounds[i],b=bounds[i+1],mid=(a+b)/2;if(b-a<1e-5)continue;
   while(at<notes.length&&notes[at].start<=mid){active.set(at,notes[at]);at++}
   for(const [id,n] of active)if(n.start+n.duration<=mid)active.delete(id);
   if(!active.size){chosen=null;chosenSource=null;previous=null;continue}
   let best=null,score=-Infinity;
   for(const n of active.values()){
    const s=(mode==='bass'?-n.pitch:n.pitch)*0.085+Math.log(0.05+n.velocity)*0.55+Math.min(n.duration,2)*0.2+(previous===n.pitch?3.2:0)-(previous===null?0:Math.min(Math.abs(n.pitch-previous),24)*0.075)+(n.start>=a-0.0001&&n.start<=a+0.0001?0.35:0);
    if(s>score){score=s;best=n}
   }
   if(chosen&&chosenSource===best&&chosen.pitch===best.pitch&&Math.abs(chosen.start+chosen.duration-a)<0.0002){chosen.duration=b-chosen.start;chosen.velocity=Math.max(chosen.velocity,best.velocity)}
   else{chosen={...best,start:a,duration:b-a};out.push(chosen)}
   previous=best.pitch;chosenSource=best;
  }
  return normalize(out).filter(n=>n.duration>=0.035);
 }
 const voices=Array.from({length:clamp(maxVoices,1,4)},()=>[]);
 for(const n of notes){let best=-1,cost=Infinity;for(let i=0;i<voices.length;i++){
  const last=voices[i].at(-1);if(last&&last.start+last.duration>n.start+1e-5)continue;
  const c=last?Math.abs(last.pitch-n.pitch):0;if(c<cost){cost=c;best=i}
 }if(best>=0)voices[best].push({...n,voice:best+1});}
 return voices.flat().sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}
export function quantize(notes,bpm=120,division=4,strength=1){
 if(!division||!strength)return normalize(notes);
 const step=60/clamp(bpm,20,300)/clamp(division,1,16),k=clamp(strength,0,1);
 return normalize(notes).map(n=>{
  const start=Math.max(0,n.start+(Math.round(n.start/step)*step-n.start)*k);
  const end=Math.max(start+step/4,n.start+n.duration+(Math.round((n.start+n.duration)/step)*step-(n.start+n.duration))*k);
  return {...n,start,duration:end-start};
 }).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}
export function preventOverlap(notes){
 const out=[];
 for(const n of normalize(notes)){
  while(out.length){
   const last=out.at(-1);
   if(last.start+last.duration<=n.start)break;
   if(n.start-last.start<.001){out.pop();continue}
   last.duration=n.start-last.start;break;
  }
  out.push({...n});
 }
 return out;
}
export function demo(){const pitches=[69,71,72,74,76,74,72,71,69,67,69,71,72,69,67,64,67,69,71,72,74,72,71,69];return pitches.map((p,i)=>({pitch:p,start:i*.42,duration:i%6===5?.75:.36,velocity:.72}));}
function vlq(n){n=Math.max(0,Math.round(n));let b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b}
function chunk(str){return [...new TextEncoder().encode(str)]}
function u16(n){return [(n>>>8)&255,n&255]}
function u32(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]}
export function encodeMidi(notes,{bpm=120,title='Violin Atlas',program=40}={}){
 bpm=clamp(Number(bpm)||120,20,300);notes=validateNotes(notes);
 const ppq=480,tempo=Math.round(60000000/clamp(bpm,20,300)),events=[];
 const add=(tick,order,data)=>events.push({tick,order,data});
 const txt=new TextEncoder().encode(title);add(0,0,[255,3,...vlq(txt.length),...txt]);add(0,0,[255,81,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255]);add(0,1,[0xc0,clamp(program,0,127)]);
 for(const n of normalize(notes)){
  const start=Math.round(n.start*bpm/60*ppq),end=Math.max(start+1,Math.round((n.start+n.duration)*bpm/60*ppq));
  add(start,3,[0x90,n.pitch,clamp(Math.round(n.velocity*127),1,127)]);add(end,2,[0x80,n.pitch,0]);
 }
 events.sort((a,b)=>a.tick-b.tick||a.order-b.order);let track=[],last=0;
 for(const e of events){track.push(...vlq(e.tick-last),...e.data);last=e.tick}track.push(0,255,47,0);
 return new Uint8Array([...chunk('MThd'),...u32(6),...u16(0),...u16(1),...u16(ppq),...chunk('MTrk'),...u32(track.length),...track]);
}
export function decodeMidi(buffer){
 const bytes=new Uint8Array(buffer);let pos=0,limit=bytes.length;
 const err=()=>{throw Error('無法讀取 MIDI：檔案格式不完整或不支援')};
 const read=n=>{if(!Number.isInteger(n)||n<0||pos+n>limit)err();const v=bytes.slice(pos,pos+n);pos+=n;return v};
 const num=n=>{let v=0;for(const b of read(n))v=v*256+b;return v};
 const str=n=>new TextDecoder().decode(read(n));
 const variable=()=>{let v=0,b,i=0;do{if(i++>=4)err();b=num(1);v=(v<<7)|(b&127)}while(b&128);return v};
 if(str(4)!=='MThd')err();const hlen=num(4);if(hlen<6)err();const format=num(2),count=num(2),division=num(2);if(division&0x8000)throw Error('目前不支援 SMPTE 時基的 MIDI');if(format>1)throw Error('請將 MIDI 格式 2 轉成格式 0 或 1');if(!division||!count||count>1024)err();read(hlen-6);
 const ppq=division,tracks=[],tempos=[{tick:0,tempo:500000}],maxEvents=500000;
 for(let t=0;t<count;t++){
  limit=bytes.length;if(str(4)!=='MTrk')err();const length=num(4),end=pos+length;if(end>bytes.length)err();limit=end;let tick=0,status=0,eventCount=0,events=[],name=`軌道 ${t+1}`,program=null;
  while(pos<end){if(++eventCount>maxEvents)throw Error('MIDI 事件過多');tick+=variable();let b=num(1);if(b<128){if(!status)err();pos--;b=status}else if(b<240)status=b;
   if(b===255){const type=num(1),len=variable(),data=read(len);if(type===81&&len===3&&data.some(x=>x>0))tempos.push({tick,tempo:(data[0]<<16)|(data[1]<<8)|data[2]});if(type===3)name=new TextDecoder().decode(data);if(type===47)break;continue}
   if(b===240||b===247){status=0;read(variable());continue}
   const op=b&240,ch=b&15;if(op===192||op===208){const v=num(1);if(v>127)err();if(op===192)program=v;continue}
   if(op<128||op>224)err();const a=num(1),v=num(1);if(a>127||v>127)err();if(op===144&&v>0)events.push({tick,type:'on',ch,pitch:a,velocity:v/127});else if(op===128||(op===144&&v===0))events.push({tick,type:'off',ch,pitch:a});else if(op===176&&a===64)events.push({tick,type:'pedal',ch,value:v});
  }pos=end;tracks.push({name,program,events,endTick:tick});
 }
 tempos.sort((a,b)=>a.tick-b.tick);const tm=[];for(const t of tempos){if(tm.length&&tm.at(-1).tick===t.tick)tm[tm.length-1]={...t};else tm.push({...t})}let seconds=0;for(let i=0;i<tm.length;i++){if(i)seconds+=(tm[i].tick-tm[i-1].tick)*tm[i-1].tempo/1e6/ppq;tm[i].seconds=seconds}
 function time(tick){let lo=0,hi=tm.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(tm[mid].tick<=tick)lo=mid;else hi=mid-1}const t=tm[lo];return t.seconds+(tick-t.tick)*t.tempo/1e6/ppq}
 const result=tracks.map((t,idx)=>{let active=new Map(),pedal=Array(16).fill(false),held=Array.from({length:16},()=>[]),notes=[];
  const finish=(n,tick)=>{if(n){const end=time(tick);notes.push({pitch:n.pitch,start:n.start,duration:Math.max(.01,end-n.start),velocity:n.velocity,channel:n.ch,track:idx})}};
  for(const e of t.events){const key=e.ch*128+e.pitch;if(e.type==='on'){const stack=active.get(key)||[];stack.push({...e,start:time(e.tick)});active.set(key,stack)}else if(e.type==='off'){const stack=active.get(key);const n=stack?.shift();if(!stack?.length)active.delete(key);if(n){if(pedal[e.ch])held[e.ch].push(n);else finish(n,e.tick)}}else if(e.type==='pedal'){const down=e.value>=64;if(pedal[e.ch]&&!down){for(const n of held[e.ch])finish(n,e.tick);held[e.ch]=[]}pedal[e.ch]=down}}
  const last=t.endTick;for(const stack of active.values())for(const n of stack)finish(n,last);for(const h of held)for(const n of h)finish(n,last);
  return {...t,notes:normalize(notes).filter(n=>n.channel!==9),events:undefined};
 });
 return {format,ppq,tracks:result,tempos:tm,bpm:Math.round(60000000/tm[0].tempo),notes:normalize(result.flatMap(t=>t.notes))};
}
const xmlEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
const keyFifths={C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5,Gb:-6,Cb:-7};
function spell(p,key='C'){
 const flats=['F','Bb','Eb','Ab','Db','Gb','Cb'].some(x=>x===key);
 const names=flats?['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']:NAMES;
 const name=names[((p%12)+12)%12];return {step:name[0],alter:name.length>1?(name[1]==='#'?1:-1):0,octave:Math.floor(p/12)-1};
}
function typeFor(ticks){const values=[[3840,'whole',0],[2880,'half',1],[1920,'half',0],[1440,'quarter',1],[960,'quarter',0],[720,'eighth',1],[480,'eighth',0],[360,'16th',1],[240,'16th',0],[180,'32nd',1],[120,'32nd',0],[60,'64th',0]];return values.find(v=>v[0]===ticks)||null}
function splitDuration(n){const out=[];let left=n;for(const [v] of [[3840],[2880],[1920],[1440],[960],[720],[480],[360],[240],[180],[120],[60]])while(left>=v){out.push(v);left-=v}if(left)out.push(left);return out}
export function encodeMusicXML(input,{bpm=120,title='Violin arrangement',composer='',key='C',beats=4,beatType=4,grid=4}={}){
 bpm=clamp(Number(bpm)||120,20,300);if(!Number.isInteger(beats)||beats<1||beats>12||![2,4,8,16].includes(beatType))throw Error('拍號無效');
 const notes=validateNotes(input),div=960,bar=Math.round(beats*div*4/beatType),secondsPerTick=60/bpm/div,step=grid?div/clamp(grid,1,16):1;
 if(!notes.length)throw Error('沒有可輸出的音符');
 // Quantize before assigning voices, so collisions never push later notes out of time.
 const snapped=notes.map(n=>({...n,startTick:Math.round(n.start/secondsPerTick/step)*step,
  endTick:Math.max(Math.round(n.start/secondsPerTick/step)*step+step,Math.round((n.start+n.duration)/secondsPerTick/step)*step)}));
 const prepared=[];
 for(const n of snapped){
  let v=prepared.find(a=>a.at(-1).endTick<=n.startTick);
  if(!v){if(prepared.length>=16)throw Error('樂譜同時聲部超過 16 個，請先選擇單旋律或雙聲部');v=[];prepared.push(v)}
  v.push(n);
 }
 const maxTick=prepared.reduce((m,v)=>Math.max(m,v.at(-1).endTick),0),bars=Math.ceil(maxTick/bar),parts=[];
 if(bars>1024)throw Error('樂譜超過 1,024 小節，請分段輸出');
 function notation(p,duration,voice,rest=false,tieStart=false,tieStop=false){let typ=typeFor(duration),attrs=typ?`<type>${typ[1]}</type>${typ[2]?'<dot/>':''}`:'';
  const pitch=rest?null:spell(p,key);const mark=rest?'<rest/>':`<pitch><step>${pitch.step}</step>${pitch.alter?`<alter>${pitch.alter}</alter>`:''}<octave>${pitch.octave}</octave></pitch>`;
  const ties=rest?'':`${tieStop?'<tie type="stop"/>':''}${tieStart?'<tie type="start"/>':''}`;const notation=rest?'':tieStart||tieStop?`<notations>${tieStop?'<tied type="stop"/>':''}${tieStart?'<tied type="start"/>':''}</notations>`:'';
  return `<note>${mark}<duration>${duration}</duration>${ties}<voice>${voice}</voice>${attrs}${notation}</note>`;
 }
 function emitSpan(start,end,pitch,voice,rest=false,tieIn=false,tieOut=false){let pieces=[],cursor=start;while(cursor<end){const remaining=Math.min(end-cursor,bar-(cursor%bar));pieces.push(...splitDuration(remaining));cursor+=remaining}return pieces.map((d,i)=>notation(pitch,d,voice,rest,tieOut||i<pieces.length-1,tieIn||i>0)).join('')}
 prepared.forEach((voice,i)=>{let measures=[],cursor=0,events=[];for(const n of voice){if(n.startTick>cursor)events.push({start:cursor,end:n.startTick,rest:true});events.push({start:n.startTick,end:n.endTick,pitch:n.pitch});cursor=n.endTick}const endTick=Math.max(bar,bars*bar);if(cursor<endTick)events.push({start:cursor,end:endTick,rest:true});
  for(let m=0;m<bars;m++){let body='',mStart=m*bar,mEnd=mStart+bar;for(const e of events){let s=Math.max(e.start,mStart),eEnd=Math.min(e.end,mEnd);if(eEnd<=s)continue;body+=emitSpan(s,eEnd,e.pitch,i+1,e.rest,s>e.start,eEnd<e.end)}
   measures.push(`<measure number="${m+1}">${m===0?`<attributes><divisions>${div}</divisions><key><fifths>${keyFifths[key]??0}</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><words>Violin</words></direction-type><sound tempo="${bpm}"/></direction>`:''}${body}</measure>`)}parts.push(`<part id="P${i+1}">${measures.join('')}</part>`)});
 return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE score-partwise  PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><work><work-title>${xmlEsc(title)}</work-title></work><movement-title>${xmlEsc(title)}</movement-title><identification><creator type="composer">${xmlEsc(composer)}</creator></identification><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list>${prepared.map((_,i)=>`<score-part id="P${i+1}"><part-name>Violin${prepared.length>1?' '+(i+1):''}</part-name><part-abbreviation>Vln.</part-abbreviation><score-instrument id="I${i+1}"><instrument-name>Violin</instrument-name></score-instrument><midi-instrument id="I${i+1}"><midi-channel>${(i<9?i:i+1)%16+1}</midi-channel><midi-program>41</midi-program></midi-instrument></score-part>`).join('')}</part-list>${parts.join('')}</score-partwise>`;
}
export function decodeMusicXML(text){
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('MusicXML 格式錯誤');
 const root=doc.documentElement;
 if(!root||!['score-partwise','score-timewise'].includes(root.localName))throw Error('請選擇 MusicXML 樂譜');
 const children=(el,name)=>Array.from(el?.children||[]).filter(x=>x.localName===name);
 const child=(el,name)=>children(el,name)[0];
 const val=(el,name,fallback='')=>child(el,name)?.textContent??fallback;
 const title=root.querySelector('work-title,movement-title')?.textContent||'Imported score';
 const partDefs=children(child(root,'part-list'),'score-part');
 let parts;
 if(root.localName==='score-timewise'){
  const measures=children(root,'measure');
  const ids=[...new Set(measures.flatMap(m=>children(m,'part').map(p=>p.getAttribute('id'))))];
  parts=ids.map(id=>({id,measures:measures.map(m=>({el:children(m,'part').find(p=>p.getAttribute('id')===id),implicit:m.getAttribute('implicit')}))}));
 }else parts=children(root,'part').map(p=>({id:p.getAttribute('id'),measures:children(p,'measure').map(el=>({el,implicit:el.getAttribute('implicit')}))}));
 const tempos=[{q:0,bpm:120}],tracks=[];let key='C',meter='4/4';
 for(const [pi,part] of parts.entries()){
  let divisions=1,measureStart=0,bar=4,transpose=0,notes=[],ties=new Map();
  for(const {el:measure,implicit} of part.measures){
   let cursor=measureStart,furthest=measureStart,previousStart=measureStart;
   for(const el of Array.from(measure?.children||[])){
    const tag=el.localName;
    if(tag==='attributes'){
     divisions=Number(val(el,'divisions',divisions));if(!(divisions>0))throw Error('MusicXML divisions 必須大於 0');
     const t=child(el,'time');if(t){const beats=String(val(t,'beats',4)).split('+').reduce((a,b)=>a+Number(b),0),type=Number(val(t,'beat-type',4));bar=beats*4/type;if(!(bar>0&&bar<=48))throw Error('MusicXML 拍號無效');if(pi===0&&measureStart===0)meter=beats+'/'+type}
     const k=child(el,'key');if(k&&pi===0&&measureStart===0)key=Object.keys(keyFifths).find(k2=>keyFifths[k2]===Number(val(k,'fifths',0)))||'C';
     const tr=child(el,'transpose');if(tr)transpose=Number(val(tr,'chromatic',0))+12*Number(val(tr,'octave-change',0));
    }else if(tag==='direction'||tag==='sound'){
     const sound=tag==='sound'?el:child(el,'sound'),met=el.querySelector('metronome');
     let tempo=Number(sound?.getAttribute('tempo'))||0;
     if(!tempo&&met){const unit={whole:4,half:2,quarter:1,eighth:.5,'16th':.25}[val(met,'beat-unit')];tempo=Number(val(met,'per-minute',0))*unit*(child(met,'beat-unit-dot')?1.5:1)}
     if(tempo>0&&Number.isFinite(tempo))tempos.push({q:Math.max(0,cursor+Number(val(el,'offset',0))/divisions),bpm:tempo});
    }else if(tag==='backup'||tag==='forward'){
     const d=Number(val(el,'duration',0))/divisions;if(!Number.isFinite(d)||d<0)throw Error('MusicXML 時值無效');
     cursor=tag==='backup'?Math.max(measureStart,cursor-d):cursor+d;furthest=Math.max(furthest,cursor);
    }else if(tag==='note'){
     if(child(el,'grace'))continue;
     const rest=child(el,'rest'),d=Number(val(el,'duration',rest?.getAttribute('measure')==='yes'?bar*divisions:0))/divisions;
     if(!Number.isFinite(d)||d<0)throw Error('MusicXML 音符時值無效');
     const chord=!!child(el,'chord'),q=chord?previousStart:cursor;if(!chord)previousStart=q;
     const p=child(el,'pitch');
     if(p&&!rest&&d>0){
      const pitch=(Number(val(p,'octave',4))+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[val(p,'step')])+Number(val(p,'alter',0))+transpose;
      const voice=Number(val(el,'voice',1))||1,staff=val(el,'staff',1),tieKey=staff+':'+voice+':'+pitch;
      const ts=children(el,'tie'),stop=ts.some(t=>t.getAttribute('type')==='stop'),start=ts.some(t=>t.getAttribute('type')==='start');
      const tied=ties.get(tieKey);
      if(stop&&tied&&Math.abs(tied.q+tied.length-q)<1e-5){tied.length+=d;if(!start)ties.delete(tieKey)}
      else{const n={pitch,q,length:d,velocity:.8,track:pi,voice};notes.push(n);if(start)ties.set(tieKey,n)}
     }
     if(!chord)cursor+=d;furthest=Math.max(furthest,q+d,cursor);
    }
   }
   measureStart=implicit==='yes'?furthest:Math.max(measureStart+bar,furthest);
  }
  const definition=partDefs.find(p=>p.getAttribute('id')===part.id);
  tracks.push({name:val(definition,'part-name',part.id||'Part '+(pi+1)),notes});
 }
 const map=[];tempos.sort((a,b)=>a.q-b.q);
 for(const t of tempos){if(map.at(-1)?.q===t.q)map[map.length-1]=t;else map.push(t)}
 let sec=0;for(let i=0;i<map.length;i++){if(i)sec+=(map[i].q-map[i-1].q)*60/map[i-1].bpm;map[i].seconds=sec}
 const time=q=>{let lo=0,hi=map.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(map[mid].q<=q)lo=mid;else hi=mid-1}const t=map[lo];return t.seconds+(q-t.q)*60/t.bpm};
 for(const t of tracks)t.notes=validateNotes(t.notes.map(({q,length,...n})=>({...n,start:time(q),duration:time(q+length)-time(q)})));
 const notes=validateNotes(tracks.flatMap(t=>t.notes));if(!notes.length)throw Error('樂譜中沒有可讀取的音高音符');
 return {title,bpm:map[0].bpm,notes,tracks,key,meter,tempos:map};
}
export function wavBytes(channels,sampleRate=44100){
 const count=channels[0].length,nch=channels.length,out=new ArrayBuffer(44+count*nch*2),v=new DataView(out);let p=0;const str=s=>{for(const c of s)v.setUint8(p++,c.charCodeAt(0))};const u16=x=>{v.setUint16(p,x,true);p+=2};const u32=x=>{v.setUint32(p,x,true);p+=4};
 str('RIFF');u32(36+count*nch*2);str('WAVEfmt ');u32(16);u16(1);u16(nch);u32(sampleRate);u32(sampleRate*nch*2);u16(nch*2);u16(16);str('data');u32(count*nch*2);
 for(let i=0;i<count;i++)for(let c=0;c<nch;c++){const s=clamp(channels[c][i],-1,1);v.setInt16(p,s<0?s*32768:s*32767,true);p+=2}return new Uint8Array(out);
}

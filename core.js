/* Violin Atlas Converter — original code, MIT. No network or browser dependency. */
export const VERSION='1.0.0';
export const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const OPEN_STRINGS=[55,62,69,76];
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const noteName=n=>NAMES[((Math.round(n)%12)+12)%12]+(Math.floor(Math.round(n)/12)-1);
export const hz=n=>440*Math.pow(2,(n-69)/12);
export const safeName=s=>String(s||'violin').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
export const normalize=notes=>(notes||[]).map((n,i)=>({...n,id:n.id??i,pitch:Math.round(Number(n.pitch??n.midi??n.pitchMidi)),start:Math.max(0,Number(n.start??n.time??n.startTimeSeconds??0)),duration:Number(n.duration??n.durationSeconds??0),velocity:clamp(Number(n.velocity??n.amplitude??0.8),0.05,1),track:n.track??0,channel:n.channel??0})).filter(n=>Number.isFinite(n.pitch)&&Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.duration>0&&n.pitch>=0&&n.pitch<=127).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
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
  const out=[];let previous=null,chosen=null,at=0;const active=new Map();
  for(let i=0;i<bounds.length-1;i++){
   const a=bounds[i],b=bounds[i+1],mid=(a+b)/2;if(b-a<1e-5)continue;
   while(at<notes.length&&notes[at].start<=mid){active.set(at,notes[at]);at++}
   for(const [id,n] of active)if(n.start+n.duration<=mid)active.delete(id);
   if(!active.size){chosen=null;continue}
   let best=null,score=-Infinity;
   for(const n of active.values()){
    const s=(mode==='bass'?-n.pitch:n.pitch)*0.085+Math.log(0.05+n.velocity)*0.55+Math.min(n.duration,2)*0.2+(previous===n.pitch?3.2:0)-(previous===null?0:Math.min(Math.abs(n.pitch-previous),24)*0.075)+(n.start>=a-0.0001&&n.start<=a+0.0001?0.35:0);
    if(s>score){score=s;best=n}
   }
   if(chosen&&chosen.pitch===best.pitch&&Math.abs(chosen.start+chosen.duration-a)<0.0002){chosen.duration=b-chosen.start;chosen.velocity=Math.max(chosen.velocity,best.velocity)}
   else{chosen={...best,start:a,duration:b-a};out.push(chosen)}
   previous=best.pitch;
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
 const step=60/clamp(bpm,20,300)/clamp(division,1,16),k=clamp(strength,0,1);
 return normalize(notes).map(n=>{
  const start=Math.max(0,n.start+(Math.round(n.start/step)*step-n.start)*k);
  const end=Math.max(start+step/4,n.start+n.duration+(Math.round((n.start+n.duration)/step)*step-(n.start+n.duration))*k);
  return {...n,start,duration:end-start};
 }).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}
export function preventOverlap(notes){const out=[];for(const n of normalize(notes)){const last=out.at(-1);if(last&&last.start+last.duration>n.start){last.duration=Math.max(0.02,n.start-last.start)}out.push({...n})}return out.filter(n=>n.duration>=0.02)}
export function demo(){const pitches=[69,71,72,74,76,74,72,71,69,67,69,71,72,69,67,64,67,69,71,72,74,72,71,69];return pitches.map((p,i)=>({pitch:p,start:i*.42,duration:i%6===5?.75:.36,velocity:.72}));}
function vlq(n){n=Math.max(0,Math.round(n));let b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b}
function chunk(str){return [...str].map(c=>c.charCodeAt(0))}
function u16(n){return [(n>>>8)&255,n&255]}
function u32(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]}
export function encodeMidi(notes,{bpm=120,title='Violin Atlas',program=40}={}){
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
 const bytes=new Uint8Array(buffer);let pos=0;
 const err=()=>{throw Error('無法讀取 MIDI：檔案格式不完整或不支援')};
 const read=n=>{if(pos+n>bytes.length)err();const v=bytes.slice(pos,pos+n);pos+=n;return v};
 const num=n=>{let v=0;for(const b of read(n))v=v*256+b;return v};
 const str=n=>new TextDecoder().decode(read(n));
 const variable=()=>{let v=0,b,i=0;do{if(i++>4)err();b=num(1);v=(v<<7)|(b&127)}while(b&128);return v};
 if(str(4)!=='MThd')err();const hlen=num(4);if(hlen<6)err();const format=num(2),count=num(2),division=num(2);if(division&0x8000)throw Error('目前不支援 SMPTE 時基的 MIDI');pos+=hlen-6;
 const ppq=division,tracks=[],tempos=[{tick:0,tempo:500000}],maxEvents=500000;
 for(let t=0;t<count;t++){
  if(str(4)!=='MTrk')err();const end=pos+num(4);if(end>bytes.length)err();let tick=0,status=0,events=[],name=`軌道 ${t+1}`,program=null;
  while(pos<end){if(events.length>maxEvents)throw Error('MIDI 事件過多');tick+=variable();let b=num(1);if(b<128){if(!status)err();pos--;b=status}else if(b<240)status=b;
   if(b===255){const type=num(1),len=variable(),data=read(len);if(type===81&&len===3)tempos.push({tick,tempo:(data[0]<<16)|(data[1]<<8)|data[2]});if(type===3)name=new TextDecoder().decode(data);if(type===47)break;continue}
   if(b===240||b===247){read(variable());continue}
   const op=b&240,ch=b&15;if(op===192||op===208){const v=num(1);if(op===192)program=v;continue}
   if(op<128||op>224)err();const a=num(1),v=num(1);if(op===144&&v>0)events.push({tick,type:'on',ch,pitch:a,velocity:v/127});else if(op===128||(op===144&&v===0))events.push({tick,type:'off',ch,pitch:a});else if(op===176&&a===64)events.push({tick,type:'pedal',ch,value:v});
  }pos=end;tracks.push({name,program,events});
 }
 tempos.sort((a,b)=>a.tick-b.tick);const tm=[];for(const t of tempos){if(tm.length&&tm.at(-1).tick===t.tick)tm[tm.length-1]={...t};else tm.push({...t})}let seconds=0;for(let i=0;i<tm.length;i++){if(i)seconds+=(tm[i].tick-tm[i-1].tick)*tm[i-1].tempo/1e6/ppq;tm[i].seconds=seconds}
 function time(tick){let lo=0,hi=tm.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(tm[mid].tick<=tick)lo=mid;else hi=mid-1}const t=tm[lo];return t.seconds+(tick-t.tick)*t.tempo/1e6/ppq}
 const result=tracks.map((t,idx)=>{let active=new Map(),pedal=Array(16).fill(false),held=Array.from({length:16},()=>[]),notes=[];
  const finish=(n,tick)=>{if(n){const end=time(tick);notes.push({pitch:n.pitch,start:n.start,duration:Math.max(.01,end-n.start),velocity:n.velocity,channel:n.ch,track:idx})}};
  for(const e of t.events){const key=e.ch*128+e.pitch;if(e.type==='on'){const stack=active.get(key)||[];stack.push({...e,start:time(e.tick)});active.set(key,stack)}else if(e.type==='off'){const stack=active.get(key);const n=stack?.shift();if(!stack?.length)active.delete(key);if(n){if(pedal[e.ch])held[e.ch].push(n);else finish(n,e.tick)}}else if(e.type==='pedal'){const down=e.value>=64;if(pedal[e.ch]&&!down){for(const n of held[e.ch])finish(n,e.tick);held[e.ch]=[]}pedal[e.ch]=down}}
  const last=t.events.at(-1)?.tick||0;for(const stack of active.values())for(const n of stack)finish(n,last);for(const h of held)for(const n of h)finish(n,last);
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
 const notes=normalize(input),div=960,bar=Math.round(beats*div*4/beatType),secondsPerTick=60/bpm/div,step=div/(grid||4);
 if(!notes.length)throw Error('沒有可輸出的音符');
 const voices=[],voiceMap=new Map();for(const n of notes){let v=-1;if(n.voice){if(!voiceMap.has(n.voice))voiceMap.set(n.voice,voices.length);v=voiceMap.get(n.voice)}if(v<0){v=voices.findIndex(a=>!a.length||a.at(-1).start+a.at(-1).duration<=n.start+1e-5);if(v<0)v=voices.length}if(!voices[v])voices[v]=[];voices[v].push(n)}
 const prepared=voices.map(v=>{let prev=0;return v.sort((a,b)=>a.start-b.start).map(n=>{let start=Math.max(prev,Math.round(n.start/secondsPerTick/step)*step),duration=Math.max(step,Math.round(n.duration/secondsPerTick/step)*step);duration=Math.min(duration,bar*256);prev=start+duration;return {...n,startTick:start,endTick:prev}})});
 const maxTick=Math.max(...prepared.flatMap(v=>v.map(n=>n.endTick))),bars=Math.ceil(maxTick/bar),parts=[];
 function notation(p,duration,voice,rest=false,tieStart=false,tieStop=false){let typ=typeFor(duration),attrs=typ?`<type>${typ[1]}</type>${typ[2]?'<dot/>':''}`:'';if(!typ)attrs='<type>64th</type>';
  const pitch=rest?null:spell(p,key);const mark=rest?'<rest/>':`<pitch><step>${pitch.step}</step>${pitch.alter?`<alter>${pitch.alter}</alter>`:''}<octave>${pitch.octave}</octave></pitch>`;
  const ties=rest?'':`${tieStop?'<tie type="stop"/>':''}${tieStart?'<tie type="start"/>':''}`;const notation=rest?'':tieStart||tieStop?`<notations>${tieStop?'<tied type="stop"/>':''}${tieStart?'<tied type="start"/>':''}</notations>`:'';
  return `<note>${mark}<duration>${duration}</duration><voice>${voice}</voice>${attrs}${ties}${notation}</note>`;
 }
 function emitSpan(start,end,pitch,voice,rest=false,tieIn=false,tieOut=false){let pieces=[],cursor=start;while(cursor<end){const remaining=Math.min(end-cursor,bar-(cursor%bar));pieces.push(...splitDuration(remaining));cursor+=remaining}return pieces.map((d,i)=>notation(pitch,d,voice,rest,tieOut||i<pieces.length-1,tieIn||i>0)).join('')}
 prepared.forEach((voice,i)=>{let measures=[],cursor=0,events=[];for(const n of voice){if(n.startTick>cursor)events.push({start:cursor,end:n.startTick,rest:true});events.push({start:n.startTick,end:n.endTick,pitch:n.pitch});cursor=n.endTick}const endTick=Math.max(bar,bars*bar);if(cursor<endTick)events.push({start:cursor,end:endTick,rest:true});
  for(let m=0;m<bars;m++){let body='',mStart=m*bar,mEnd=mStart+bar;for(const e of events){let s=Math.max(e.start,mStart),eEnd=Math.min(e.end,mEnd);if(eEnd<=s)continue;body+=emitSpan(s,eEnd,e.pitch,i+1,e.rest,s>e.start,eEnd<e.end)}
   measures.push(`<measure number="${m+1}">${m===0?`<attributes><divisions>${div}</divisions><key><fifths>${keyFifths[key]??0}</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><words>Violin</words></direction-type><sound tempo="${bpm}"/></direction>`:''}${body}</measure>`)}parts.push(`<part id="P${i+1}">${measures.join('')}</part>`)});
 return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE score-partwise  PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><work><work-title>${xmlEsc(title)}</work-title></work><movement-title>${xmlEsc(title)}</movement-title><identification><creator type="composer">${xmlEsc(composer)}</creator></identification><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list>${prepared.map((_,i)=>`<score-part id="P${i+1}"><part-name>Violin${prepared.length>1?' '+(i+1):''}</part-name><part-abbreviation>Vln.</part-abbreviation><score-instrument id="I${i+1}"><instrument-name>Violin</instrument-name></score-instrument><midi-instrument id="I${i+1}"><midi-channel>${i+1}</midi-channel><midi-program>41</midi-program></midi-instrument></score-part>`).join('')}</part-list>${parts.join('')}</score-partwise>`;
}
export function decodeMusicXML(text){
 const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('MusicXML 格式錯誤');
 const root=doc.documentElement;if(!['score-partwise','score-timewise'].includes(root.localName))throw Error('請選擇 MusicXML 樂譜');
 const title=root.querySelector('work-title,movement-title')?.textContent||'Imported score';let bpm=120,notes=[],tracks=[];
 const child=(el,name)=>Array.from(el.children).find(x=>x.localName===name);
 const val=(el,name,fallback='')=>child(el,name)?.textContent??fallback;
 for(const [pi,part] of Array.from(root.children).filter(x=>x.localName==='part').entries()){
  let divisions=1,cur=0,previousStart=0,openTies=new Map(),trackNotes=[];
  for(const measure of Array.from(part.children).filter(x=>x.localName==='measure')){
   for(const el of measure.children){const tag=el.localName;
    if(tag==='attributes')divisions=Number(val(el,'divisions',divisions))||divisions;
    else if(tag==='direction'){const sound=child(el,'sound');if(sound?.getAttribute('tempo'))bpm=Number(sound.getAttribute('tempo'))||bpm}
    else if(tag==='backup')cur-=Number(val(el,'duration',0))/divisions*60/bpm;
    else if(tag==='forward')cur+=Number(val(el,'duration',0))/divisions*60/bpm;
    else if(tag==='note'){
     const dur=Number(val(el,'duration',0))/divisions*60/bpm;if(child(el,'grace'))continue;
     const chord=!!child(el,'chord'),start=chord?previousStart:cur;if(!chord)previousStart=start;
     if(!child(el,'rest')){const p=child(el,'pitch');if(p){let step=val(p,'step','C'),alter=Number(val(p,'alter',0)),oct=Number(val(p,'octave',4));const pitch=(oct+1)*12+NAMES.indexOf(step)+alter;const tieEls=Array.from(el.children).filter(x=>x.localName==='tie'),stop=tieEls.some(x=>x.getAttribute('type')==='stop'),startTie=tieEls.some(x=>x.getAttribute('type')==='start'),voice=Number(val(el,'voice',1))||1,key=voice+':'+pitch;
      if(stop&&openTies.has(key)){const n=openTies.get(key);n.duration+=dur;if(!startTie)openTies.delete(key)}else{const n={pitch,start,duration:Math.max(.01,dur),velocity:.8,track:pi,voice};trackNotes.push(n);if(startTie)openTies.set(key,n)}
     }}if(!chord)cur+=dur;
    }
   }
  }
  tracks.push({name:`Violin ${pi+1}`,notes:normalize(trackNotes)});notes.push(...trackNotes);
 }
 return {title,bpm,notes:normalize(notes),tracks};
}
export function wavBytes(channels,sampleRate=44100){
 const count=channels[0].length,nch=channels.length,out=new ArrayBuffer(44+count*nch*2),v=new DataView(out);let p=0;const str=s=>{for(const c of s)v.setUint8(p++,c.charCodeAt(0))};const u16=x=>{v.setUint16(p,x,true);p+=2};const u32=x=>{v.setUint32(p,x,true);p+=4};
 str('RIFF');u32(36+count*nch*2);str('WAVEfmt ');u32(16);u16(1);u16(nch);u32(sampleRate);u32(sampleRate*nch*2);u16(nch*2);u16(16);str('data');u32(count*nch*2);
 for(let i=0;i<count;i++)for(let c=0;c<nch;c++){const s=clamp(channels[c][i],-1,1);v.setInt16(p,s<0?s*32768:s*32767,true);p+=2}return new Uint8Array(out);
}
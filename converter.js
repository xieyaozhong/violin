import * as Core from './core.js';
import {ViolinSampler} from './sampler.js';
import {parseProject,PROJECT_FORMAT,History,snapshot} from './project.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const state={source:null,raw:[],notes:[],title:'Violin arrangement',bpm:120,midi:null,originalBuffer:null,originalUrl:null,busy:false,cancel:false,undo:[],page:0,selected:-1,tab:'score',model:null,modelLib:null,score:null,scoreLib:null,scoreToken:0,job:0,notation:null,loading:false,playPending:false};
const history=new History();let worker=null,cancelAnalysis=null,draftTimer=0,analysisKey='',rollLayout=null;
const DRAFT_KEY='violin-atlas-converter-draft-v1';
const sampler=new ViolinSampler();let toastTimer=0,renderTimer=0,rollBoxes=[],resumeAfterSeek=false;
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>`${Math.floor(Math.max(0,t)/60)}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
const duration=()=>Core.endTime(state.notes);
const name=()=>Core.safeName(state.title||'violin');
function toast(s){const e=$('#toast');e.textContent=s;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),3500)}
function status(s,type=''){const e=$('#status-box');e.textContent=s;e.className='status-box'+(type?' '+type:'')}
function progress(stage,pct,detail=''){const box=$('#progress-box');box.hidden=false;$('#progress-stage').textContent=stage;$('#progress-percent').textContent=Math.round(pct)+'%';$('#progress-fill').style.width=Core.clamp(pct,0,100)+'%';$('#progress-detail').textContent=detail;$('.progress-track').setAttribute('aria-valuenow',String(Math.round(Core.clamp(pct,0,100))))}
function syncRangeLabels(){
 for(const [id,out,suffix,factor] of [['transpose','transpose-value','',1],['strength','strength-value','%',1],['threshold','threshold-value','',.01],['vibrato','vibrato-value',' ¢',1],['reverb','reverb-value','%',1],['volume','volume-value','%',1]]){
  const value=Number($('#'+id).value)*factor;
  $('#'+out).textContent=(id==='transpose'&&value>0?'+':'')+(factor===.01?value.toFixed(2):value)+suffix;
 }
}
function syncTitle(){$('#title').value=state.title}
function busy(value,canCancel=false){
 state.busy=value;
 $('#cancel-btn').hidden=!value||!canCancel;
 document.querySelector('main').setAttribute('aria-busy',String(value));
 available();
}
function ensureEnhancements(){
 $('#mode').closest('.form-row').insertAdjacentHTML('beforebegin','<div class="form-row"><label for="title">作品名稱</label><input id="title" type="text" maxlength="100" value="Violin arrangement" autocomplete="off"></div>');
 $('#convert-btn').insertAdjacentHTML('afterend','<button class="button secondary big arrange-button" id="arrange-btn" hidden>套用設定並重新編曲 ↻</button><p class="fine-print save-state" id="save-state" role="status">草稿只儲存於此瀏覽器；可下載專案備份。</p>');
 $('#source-info').insertAdjacentHTML('afterend','<div class="draft-notice" id="draft-notice" hidden><div><strong>找到上次的編曲草稿</strong><span id="draft-meta"></span></div><div class="draft-actions"><button class="text-button" id="restore-draft">載入草稿</button><button class="text-button" id="dismiss-draft">略過</button></div></div>');
 $('#undo-btn').insertAdjacentHTML('afterend','<button class="button tiny secondary" id="redo-btn" disabled>↷ 重做</button>');
 $('.export-grid').insertAdjacentHTML('beforeend','<button class="button secondary" id="export-project" disabled><span>↓</span><strong>下載專案備份</strong><small>音符、設定與原始辨識結果</small></button>');
 $('.input-actions').insertAdjacentHTML('beforeend','<button class="button secondary" id="new-btn">＋ 空白樂譜</button>');
 $('#file-input').accept+=',.json';
 $('.dropzone strong').textContent='選擇音樂、樂譜或專案檔';
 $('.playback-settings').insertAdjacentHTML('afterend','<label class="check-row"><input type="checkbox" id="loop">整首循環練習</label><div class="form-row compact"><label for="volume">音量</label><div class="range-box"><input id="volume" type="range" min="0" max="100" value="80"><output id="volume-value">80%</output></div></div>');
 $('#analyze-limit').closest('.form-row').insertAdjacentHTML('beforebegin','<div class="form-row"><label for="analyze-start">起始位置（秒）</label><input id="analyze-start" type="number" min="0" step="1" value="0"></div>');
 $('#threshold').closest('.form-row').querySelector('label').textContent='音符門檻';
 $('.advanced .fine-print').insertAdjacentHTML('afterbegin','門檻越低，辨識出的音符越多；低門檻也可能增加雜訊。 ');
 $('#analyze-limit').querySelectorAll('option').forEach(o=>o.textContent=o.textContent.replace('前 ',''));
 $('.piano-tools span').textContent='點選音符可編輯；橫向捲動查看全曲';
 $('.piano-scroll').insertAdjacentHTML('beforeend','<div id="playhead" aria-hidden="true"></div>');
 $('.piano-scroll').tabIndex=0;
 const track=$('.progress-track');track.setAttribute('role','progressbar');track.setAttribute('aria-label','轉換進度');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
 $$('[data-tab]').forEach(b=>{b.id='tab-'+b.dataset.tab;b.setAttribute('aria-controls',b.dataset.tab+'-view');$('#'+b.dataset.tab+'-view').setAttribute('aria-labelledby',b.id)});
}
const controlIds=['mode','bpm','key','meter','transpose','range','quantize','strength','threshold','min-note','analyze-limit','analyze-start'];
function draftSettings(){const values=Object.fromEntries(controlIds.map(id=>[id,$('#'+id).value]));values.octaves=$('#octaves').checked;return values}
function projectData(){return {format:PROJECT_FORMAT,version:2,savedAt:Date.now(),title:state.title,sourceName:state.source?.file?.name||'專案',raw:state.raw,notes:state.notes,bpm:state.bpm,notation:state.notation,controls:draftSettings(),audio:{...audioSettings(),onStatus:undefined}}}
function saveDraft(){
 clearTimeout(draftTimer);
 draftTimer=setTimeout(flushDraft,400);
}
function flushDraft(){
 clearTimeout(draftTimer);
 if(!state.source||(!state.notes.length&&!state.raw.length&&state.source.kind!=='blank'))return;
 try{localStorage.setItem(DRAFT_KEY,JSON.stringify(projectData()));$('#save-state').textContent='草稿已儲存於此瀏覽器'}
 catch{$('#save-state').textContent='此瀏覽器無法儲存草稿，請下載專案備份'}
}
function readDraft(){try{const data=localStorage.getItem(DRAFT_KEY);return data?parseProject(data):null}catch{return null}}
function setIfOption(id,value){
 const e=$('#'+id);if(!e||value===undefined||value===null)return;
 if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(value)))return;
 if(e.type==='number'||e.type==='range'){value=Number(value);if(!Number.isFinite(value))return;value=Core.clamp(value,Number(e.min||-Infinity),Number(e.max||Infinity))}
 e.value=String(value);
}
function applyDraftSettings(settings={}){
 for(const id of controlIds)setIfOption(id,settings[id]);
 if(settings.octaves!==undefined)$('#octaves').checked=!!settings.octaves;
 syncRangeLabels();
}
function showDraftNotice(){const d=readDraft();if(!d)return;$('#draft-meta').textContent=d.title+' · '+d.notes.length+' 個音符';$('#draft-notice').hidden=false}
function restoreProject(d){
 resetSource();
 state.source={kind:'project',file:{name:d.sourceName||'編曲專案'}};
 state.raw=d.raw;state.notes=d.notes;state.title=d.title;state.bpm=d.bpm;
 applyDraftSettings(d.controls);
 for(const id of ['instrument','speed','vibrato','reverb','volume'])setIfOption(id,d.audio[id]);
 state.notation=d.notation||{...getSettings(),bpm:d.bpm,grid:0};
 setSourceInfo(state.source.file,'編曲專案',d.notes.length+' 個音符');syncRangeLabels();
 renderEverything();saveDraft();status('專案已載入，可繼續修譜與匯出。原音訊需另行匯入才能重新辨識。','success');
}
function restoreDraft(){const d=readDraft();if(d)restoreProject(d)}
function available(){
 const yes=state.notes.length>0,locked=state.busy||state.loading;
 for(const id of ['file-input','demo-btn','new-btn','clear-btn','title','track-select',...controlIds,'octaves'])$('#'+id).disabled=locked;
 $('#convert-btn').disabled=locked||!state.source||(!state.raw.length&&!state.originalBuffer);
 $('#arrange-btn').hidden=!state.raw.length;$('#arrange-btn').disabled=locked||!state.raw.length;
 for(const id of ['export-audio','export-midi','export-xml','export-pdf','seek'])$('#'+id).disabled=locked||!yes;
 $('#export-project').disabled=locked||!state.source;
 $('#play-btn').disabled=locked||!yes||state.playPending;
 $('#stop-btn').disabled=!yes&&!state.playPending;
 $('#add-note').disabled=locked||!state.source;
 $('#undo-btn').disabled=locked||!history.undo.length;$('#redo-btn').disabled=locked||!history.redo.length;
 $$('#note-table input, #note-table button').forEach(e=>e.disabled=locked);
 $('#ready-pill').textContent=yes?'作品已生成':'尚無音符';$('#ready-pill').classList.toggle('ready',yes);
 $('#score-count').textContent=state.notes.length+' NOTES';$('#edit-count').textContent=state.notes.length+' 個音符';
 $('#play-title').textContent=yes?state.title:'等待音樂';$('#art-title').textContent=state.title;$('#sheet-title').textContent=state.title;
 sampler.duration=duration();sampler.offset=Math.min(sampler.offset,sampler.duration);
 $('#clock').textContent=fmt(sampler.position())+' / '+fmt(duration());
}
function saveBlob(data,filename,type){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function getSettings(){const [low,high]=$('#range').value.split(',').map(Number);const [beats,beatType]=$('#meter').value.split('/').map(Number);return {mode:$('#mode').value,low,high,octaves:$('#octaves').checked,transpose:Number($('#transpose').value),bpm:Core.clamp(Number($('#bpm').value)||120,20,300),key:$('#key').value,beats,beatType,grid:Number($('#quantize').value),strength:Number($('#strength').value)/100,maxVoices:2}}
function audioSettings(){return {volume:Number($('#volume').value),instrument:$('#instrument').value,speed:Number($('#speed').value),vibrato:Number($('#vibrato').value),reverb:Number($('#reverb').value),onStatus:s=>$('#sample-state').textContent=s}}
function resetSource(){
 state.cancel=true;state.job++;state.scoreToken++;clearTimeout(renderTimer);clearTimeout(draftTimer);
 sampler.stop();cancelAnalysis?.();worker?.terminate();worker=null;cancelAnalysis=null;analysisKey='';
 if(state.originalUrl)URL.revokeObjectURL(state.originalUrl);
 Object.assign(state,{originalUrl:null,source:null,raw:[],notes:[],midi:null,originalBuffer:null,title:'Violin arrangement',selected:-1,page:0,notation:null});
 history.clear();$('#file-input').value='';$('#track-select').replaceChildren();
 $('#source-info').hidden=true;$('#draft-notice').hidden=true;$('#source-player').hidden=true;$('#track-picker').hidden=true;
 $('#original-audio').removeAttribute('src');$('#original-audio').load();$('#progress-box').hidden=true;
 syncTitle();renderEverything();status('請匯入音樂、載入示範，或建立空白樂譜');
}
function setSourceInfo(file,kind,extra=''){
 syncTitle();$('#source-name').textContent=file.name;$('#source-meta').textContent=[kind,extra].filter(Boolean).join(' · ');
 $('#source-info').hidden=false;
}
async function openFile(file){
 if(!file||state.busy||state.loading)return;
 state.loading=true;sampler.stop();available();status('正在讀取 '+file.name+'…');
 try{
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(file.size>250*1024*1024)throw Error('檔案超過 250 MB，請先裁切');
  if(['xml','musicxml','mxl','json'].includes(ext)&&file.size>20*1024*1024)throw Error('樂譜與專案檔上限為 20 MB');
  const ab=await file.arrayBuffer();
  if(ext==='json'){const d=parseProject(new TextDecoder().decode(ab));restoreProject(d);return}
  let parsed=null,buffer=null,kind;
  if(['mid','midi'].includes(ext)){parsed=Core.decodeMidi(ab);kind='midi';if(!parsed.notes.length)throw Error('MIDI 沒有可用音符，鼓軌不適用旋律轉換')}
  else if(['xml','musicxml','mxl'].includes(ext)){
   let xml=new TextDecoder().decode(ab);
   if(ext==='mxl'){
    const zip=await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm');let total=0;
    const files=zip.unzipSync(new Uint8Array(ab),{filter:f=>{total+=f.originalSize;if(total>40*1024*1024)throw Error('解壓後樂譜超過 40 MB');return true}});
    let path=Object.keys(files).find(k=>/\.(musicxml|xml)$/i.test(k)&&!k.startsWith('META-INF/'));
    if(files['META-INF/container.xml']){
     const c=new DOMParser().parseFromString(new TextDecoder().decode(files['META-INF/container.xml']),'application/xml');
     path=c.querySelector('rootfile')?.getAttribute('full-path')||path;
    }
    if(!path||!files[path])throw Error('壓縮檔中找不到 MusicXML');
    xml=new TextDecoder().decode(files[path]);
   }
   parsed=Core.decodeMusicXML(xml);kind='xml';
  }else{
   if(!file.type.startsWith('audio/')&&!['mp3','wav','m4a','mp4','flac','ogg','aac','webm'].includes(ext))throw Error('請選擇音訊、MIDI、MusicXML 或弦之境 JSON 專案');
   const ctx=await sampler.context();
   try{buffer=await ctx.decodeAudioData(ab)}catch{throw Error('此瀏覽器無法解碼音訊，請轉成 WAV 或 MP3 後重試')}
   kind='audio';
  }
  if(parsed)parsed.notes=Core.validateNotes(parsed.notes);
  // Only replace the current work after the new input has been validated.
  flushDraft();resetSource();state.source={kind,file};state.title=parsed?.title||file.name.replace(/\.[^.]+$/,'')||'Violin arrangement';
  if(parsed){
   state.raw=parsed.notes;state.bpm=Core.clamp(parsed.bpm,20,300);$('#bpm').value=state.bpm;
   setIfOption('key',parsed.key);setIfOption('meter',parsed.meter);
   state.midi=parsed;
   const tracks=parsed.tracks||[];
   $('#track-select').innerHTML='<option value="all">全部旋律軌道</option>'+tracks.map((t,i)=>t.notes.length?`<option value="${i}">${escapeHtml(t.name)} · ${t.notes.length} 音符</option>`:'').join('');
   $('#track-select').value='all';$('#track-picker').hidden=tracks.filter(t=>t.notes.length).length<2;
   $('#track-picker label').textContent=kind==='midi'?'MIDI 軌道':'MusicXML 聲部';
   setSourceInfo(file,kind==='midi'?'MIDI':'MusicXML',parsed.notes.length+' 個音符');
   status('已讀取，可選擇軌道並生成編曲','success');
  }else{
   state.originalBuffer=buffer;state.originalUrl=URL.createObjectURL(file);
   $('#analyze-start').value=0;$('#analyze-start').max=Math.max(0,buffer.duration-.1);
   $('#original-audio').src=state.originalUrl;$('#source-player').hidden=false;drawWaveform(buffer);
   setSourceInfo(file,'音訊',fmt(buffer.duration)+' · '+buffer.sampleRate+' Hz');
   status('音訊已載入，選擇分析區段後開始轉換','success');
  }
 }catch(e){status((e.message||'讀取失敗')+'。現有作品已保留。','error');toast(e.message)}
 finally{state.loading=false;$('#file-input').value='';available()}
}
function drawWaveform(buffer){const c=$('#waveform');if(!c)return;const rect=c.getBoundingClientRect(),w=Math.max(100,rect.width||300),h=74,dpr=Math.min(devicePixelRatio||1,2);c.width=w*dpr;c.height=h*dpr;const g=c.getContext('2d');g.scale(dpr,dpr);g.clearRect(0,0,w,h);g.fillStyle='#f7f8f7';g.fillRect(0,0,w,h);const data=buffer.getChannelData(0),stride=Math.max(1,Math.floor(data.length/w));g.strokeStyle='#b49a73';g.lineWidth=1;g.beginPath();for(let x=0;x<w;x++){let min=1,max=-1;for(let i=x*stride;i<Math.min(data.length,(x+1)*stride);i+=Math.max(1,Math.floor(stride/100))){min=Math.min(min,data[i]);max=Math.max(max,data[i])}g.moveTo(x,h/2+min*h*.42);g.lineTo(x,h/2+max*h*.42)}g.stroke();g.strokeStyle='#dce0de';g.beginPath();g.moveTo(0,h/2);g.lineTo(w,h/2);g.stroke()}
async function transcribe(buffer,job){
 const start=Number($('#analyze-start').value),limit=Number($('#analyze-limit').value);
 if(!Number.isFinite(start)||start<0||start>=buffer.duration)throw Error('分析起點必須在音訊長度內');
 const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
 if(!Offline||!globalThis.Worker)throw Error('此瀏覽器不支援背景音訊辨識，請改用新版瀏覽器或匯入 MIDI');
 const seconds=Math.min(buffer.duration-start,limit);
 progress('準備音訊',1,fmt(start)+' – '+fmt(start+seconds)+'；結果從 0 秒開始');
 const ctx=new Offline(1,Math.ceil(seconds*22050),22050),src=ctx.createBufferSource();
 src.buffer=buffer;src.connect(ctx.destination);src.start(0,start,seconds);
 const mono=await ctx.startRendering();if(job!==state.job||state.cancel)throw Error('已停止分析');
 const samples=mono.getChannelData(0).slice();
 return new Promise((resolve,reject)=>{
  worker=new Worker(new URL('./transcribe-worker.js',import.meta.url),{type:'module'});
  const done=(err,notes)=>{worker?.terminate();worker=null;cancelAnalysis=null;if(err)reject(err);else resolve(notes)};
  cancelAnalysis=()=>done(Error('已停止分析'));
  worker.onerror=()=>done(Error('背景辨識載入失敗，請確認網路連線，或改用 MIDI'));
  worker.onmessage=({data})=>{
   if(job!==state.job||state.cancel){done(Error('已停止分析'));return}
   if(data.error)done(Error(data.error));
   else if(data.notes)done(null,Core.validateNotes(data.notes));
   else progress(data.stage,data.progress,data.detail||'首次使用需下載模型；音訊不會上傳');
  };
  worker.postMessage({samples,threshold:Number($('#threshold').value)/100,minNote:Number($('#min-note').value)},[samples.buffer]);
 });
}
function transcriptionKey(){return ['analyze-start','analyze-limit','threshold','min-note'].map(id=>$('#'+id).value).join('|')}
function chooseRaw(){
 if(state.midi){const v=$('#track-select').value;state.raw=v==='all'?state.midi.notes:(state.midi.tracks[Number(v)]?.notes||[])}
 return state.raw;
}
function applyArrangement(){
 const opts=getSettings();chooseRaw();
 if(!state.raw.length)throw Error('沒有可編曲的音符');
 let notes=Core.arrange(state.raw,opts);
 if(opts.grid)notes=Core.quantize(notes,opts.bpm,opts.grid,opts.strength);
 if(['melody','bass'].includes(opts.mode))notes=Core.preventOverlap(notes);
 if(!notes.length)throw Error('此音域沒有可用音符，請調整音域或移調');
 history.push(snapshot(state));state.notes=Core.validateNotes(notes);state.bpm=opts.bpm;
 state.notation={...opts,grid:0};state.page=0;state.selected=-1;
 sampler.stop();renderEverything();saveDraft();
 status('已生成 '+state.notes.length+' 個音符 · '+fmt(duration())+' · '+opts.bpm+' BPM','success');
}
async function convert(){
 if(state.busy||!state.source)return;
 const job=state.job;state.cancel=false;sampler.stop();busy(true,state.source.kind==='audio');progress('準備轉換',0);
 try{
  if(state.source.kind==='audio'&&(!state.raw.length||analysisKey!==transcriptionKey())){
   const raw=await transcribe(state.originalBuffer,job);
   if(job!==state.job||state.cancel)return;
   state.raw=raw;analysisKey=transcriptionKey();
  }
  if(job!==state.job||state.cancel)return;
  applyArrangement();toast('編曲已完成');
 }catch(e){status(e.message||'轉換失敗',state.cancel?'':'error');toast(e.message)}
 finally{busy(false);$('#progress-box').hidden=true}
}
function loadDemo(){
 flushDraft();resetSource();state.source={kind:'demo',file:{name:'弦之境 · 示範旋律.mid'}};
 state.title='弦之境 · 示範旋律';state.raw=Core.demo();state.bpm=120;$('#bpm').value=120;
 setSourceInfo(state.source.file,'示範旋律','原創練習旋律');applyArrangement();history.clear();available();
}
function pushUndo(){history.push(snapshot(state))}
function finishEdit(){sampler.stop();state.selected=-1;state.notes=Core.normalize(state.notes);renderEverything();saveDraft()}
function updateNote(index,patch){
 if(state.busy||!state.notes[index])return;
 const n={...state.notes[index],...patch};
 if(!Number.isFinite(n.pitch)||!Number.isFinite(n.start)||!Number.isFinite(n.duration)||n.pitch<0||n.pitch>127||n.start<0||n.duration<.01||n.start+n.duration>7200){
  toast('音高須為 MIDI 0–127，時間不可為負，長度至少 0.01 秒，總長最多 2 小時');renderTable();return;
 }
 pushUndo();state.notes[index]=n;finishEdit();
}
function undo(redo=false){
 if(state.busy)return;
 const next=redo?history.forward(snapshot(state)):history.back(snapshot(state));
 if(!next)return;Object.assign(state,next);finishEdit();
}
function parsePitch(value){const str=String(value).trim();if(/^\d+$/.test(str))return Number(str);const m=/^([A-Ga-g])([#b♯♭]?)(-?\d+)$/.exec(str);if(!m)return NaN;const p={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1].toUpperCase()];return (Number(m[3])+1)*12+p+(m[2]==='#'||m[2]==='♯'?1:m[2]==='b'||m[2]==='♭'?-1:0)}
function renderEverything(){renderTable();renderPiano();available();scheduleScore();$('#selected-note').textContent='點選時間軸中的音符'}
function scheduleRender(){renderEverything()}
function scheduleScore(){clearTimeout(renderTimer);state.scoreToken++;renderTimer=setTimeout(()=>renderScore().catch(e=>fallbackScore(e.message)),150)}
async function getScoreLib(){if(window.opensheetmusicdisplay)return window.opensheetmusicdisplay;if(state.scoreLib)return state.scoreLib;state.scoreLib=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.9.9/build/opensheetmusicdisplay.min.js';const timer=setTimeout(()=>reject(Error('樂譜載入逾時，請重試或下載 MusicXML')),45000);script.addEventListener('load',()=>clearTimeout(timer));script.addEventListener('error',()=>clearTimeout(timer));script.onload=()=>window.opensheetmusicdisplay?resolve(window.opensheetmusicdisplay):reject(Error('樂譜函式庫載入失敗'));script.onerror=()=>reject(Error('無法載入樂譜函式庫，仍可下載 MusicXML'));document.head.append(script)});try{return await state.scoreLib}catch(e){state.scoreLib=null;throw e}}
function scoreXML(){return Core.encodeMusicXML(state.notes,{...(state.notation||getSettings()),bpm:state.bpm,title:state.title,composer:'',grid:0})}
async function renderScore(){if(!state.notes.length){$('#score-root').innerHTML='<div class="empty-score"><span>𝄞</span><p>載入音樂或新增音符，開始你的編曲</p></div>';return false}const job=state.job,token=++state.scoreToken,root=$('#score-root');root.innerHTML='<div class="empty-score"><span>𝄞</span><p>正在排版五線譜…</p></div>';const xml=scoreXML();try{const lib=await getScoreLib();if(job!==state.job||token!==state.scoreToken)return;root.replaceChildren();const osmd=new lib.OpenSheetMusicDisplay(root,{autoResize:true,backend:'svg',drawTitle:false,drawComposer:false,drawPartNames:false,drawingParameters:'default',pageFormat:'Endless'});state.score=osmd;await osmd.load(xml);if(job!==state.job||token!==state.scoreToken)return;osmd.render();return true}catch(e){if(token===state.scoreToken)fallbackScore(e.message);return false}}
function fallbackScore(reason){
 if(!state.notes.length)return;
 $('#score-root').innerHTML='<div class="score-error"><strong>五線譜暫時無法排版</strong><p>'+escapeHtml(reason||'請檢查網路連線')+'</p><p>音符仍保留，可切換時間軸、編輯音符或下載 MusicXML。</p></div>';
}
function renderTable(){const rows=state.notes,per=40,pages=Math.max(1,Math.ceil(rows.length/per));state.page=Core.clamp(state.page,0,pages-1);const start=state.page*per;$('#note-table').innerHTML=rows.length?rows.slice(start,start+per).map((n,j)=>{const i=start+j;return `<tr data-index="${i}"><td><input aria-label="音高" data-field="pitch" value="${Core.noteName(n.pitch)}"></td><td><input aria-label="開始時間" type="number" min="0" step=".01" data-field="start" value="${n.start.toFixed(3)}"></td><td><input aria-label="音符長度" type="number" min=".01" step=".01" data-field="duration" value="${n.duration.toFixed(3)}"></td><td><input aria-label="力度" type="number" min="1" max="127" data-field="velocity" value="${Math.round(n.velocity*127)}"></td><td><button class="delete-note" aria-label="刪除音符" data-delete="${i}">×</button></td></tr>`}).join(''):'<tr><td colspan="5" class="empty-row">尚無音符</td></tr>';$('#page-notes').textContent=rows.length?`${state.page+1} / ${pages}`:'—';$('#prev-notes').disabled=state.page===0;$('#next-notes').disabled=state.page>=pages-1;$('#undo-btn').disabled=!history.undo.length;$('#redo-btn').disabled=!history.redo.length}
function renderPiano(){
 const canvas=$('#piano-roll'),notes=state.notes;
 const low=notes.reduce((p,n)=>Math.min(p,n.pitch),55),high=notes.reduce((p,n)=>Math.max(p,n.pitch),88);
 const row=16,top=30,left=55,total=duration(),maxWidth=12000;
 const px=Math.min(32*Number($('#piano-zoom').value),(maxWidth-left-24)/Math.max(1,total));
 const w=Math.max(380,left+Math.ceil(total*px)+24),h=top+(high-low+1)*row+8;
 // A bounded backing resolution avoids huge allocations for long pieces / wide ranges.
 const dpr=Math.min(globalThis.devicePixelRatio||1,2,Math.sqrt(12000000/(w*h)));
 canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';
 const g=canvas.getContext('2d');if(!g)return;g.scale(dpr,dpr);
 g.fillStyle='#fff';g.fillRect(0,0,w,h);rollBoxes=[];rollLayout={left,px,w,h};
 const pitchY=p=>top+(high-p)*row;
 for(let p=low;p<=high;p++){
  const y=pitchY(p);g.fillStyle=[1,3,6,8,10].includes(p%12)?'#f1f3f4':'#fff';g.fillRect(left,y,w-left,row);
  g.strokeStyle='#e0e4e5';g.beginPath();g.moveTo(left,y+row);g.lineTo(w,y+row);g.stroke();
 }
 const opts=state.notation||getSettings(),beat=60/state.bpm*4/opts.beatType,bar=beat*opts.beats;
 const stride=Math.max(1,Math.ceil(50/Math.max(.001,bar*px)));
 for(let i=0;i*bar<=total;i+=stride){
  const x=left+i*bar*px;g.strokeStyle='#c8d0d4';g.beginPath();g.moveTo(x,top);g.lineTo(x,h);g.stroke();
 }
 notes.forEach((n,i)=>{
  const x=left+n.start*px,y=pitchY(n.pitch)+1,nw=Math.max(2,n.duration*px-1);
  g.fillStyle=i===state.selected?'#89612d':'#456a80';g.fillRect(x,y,nw,row-2);
  if(nw>36){g.fillStyle='#fff';g.font='12px sans-serif';g.fillText(Core.noteName(n.pitch),x+3,y+12)}
  rollBoxes.push({x,y,w:nw,h:row-2,index:i});
 });
 g.fillStyle='#edf0f2';g.fillRect(0,0,left,h);g.fillRect(0,0,w,top);
 g.fillStyle='#43545f';g.font='12px sans-serif';
 for(let p=low;p<=high;p++)if(p%12===0||p===low||p===high)g.fillText(Core.noteName(p),5,pitchY(p)+12);
 for(let i=0;i*bar<=total;i+=stride)g.fillText((i+1)+' 小節',left+i*bar*px+3,19);
 updatePlayhead(sampler.position());
}
function updatePlayhead(seconds){
 const p=$('#playhead');if(!p||!rollLayout)return;
 p.hidden=!state.notes.length;p.style.left=(rollLayout.left+seconds*rollLayout.px)+'px';p.style.height=rollLayout.h+'px';
}
function selectedNote(index){state.selected=index;renderPiano();const n=state.notes[index];if(!n)return;$('#selected-note').innerHTML=`<b>${Core.noteName(n.pitch)}</b> · ${n.start.toFixed(2)}s · ${n.duration.toFixed(2)}s <button class="text-button" id="edit-selected">編輯此音符 →</button>`;$('#edit-selected').onclick=()=>{state.page=Math.floor(index/40);selectTab('edit');renderTable();$('#note-table tr[data-index="'+index+'"] input')?.focus()}}
function selectTab(tab){state.tab=tab;$$('[data-tab]').forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1});$$('.tab-panel').forEach(e=>e.hidden=e.id!==tab+'-view');if(tab==='piano')renderPiano();if(tab==='score'&&state.notes.length&&!$('#score-root svg'))scheduleScore()}
async function play(){
 if(state.busy||!state.notes.length)return;
 if(sampler.playing){sampler.pause();return}
 state.playPending=true;available();
 try{
  $('#original-audio').pause();
  const playing=await sampler.play(state.notes,audioSettings());
  if(playing){$('#play-btn').textContent='Ⅱ';$('#play-btn').setAttribute('aria-label','暫停')}
 }catch(e){status(e.message||'播放失敗','error');toast(e.message)}
 finally{state.playPending=false;available()}
}
function stop(){resumeAfterSeek=false;state.playPending=false;sampler.stop();available()}
function setupEvents(){
 $('#file-input').addEventListener('change',e=>openFile(e.target.files[0]));
 $('#clear-btn').onclick=()=>{resetSource();try{localStorage.removeItem(DRAFT_KEY);$('#save-state').textContent='草稿已清除'}catch{}};
 $('#demo-btn').onclick=loadDemo;$('#convert-btn').onclick=convert;
 $('#new-btn').onclick=()=>{flushDraft();resetSource();state.source={kind:'blank',file:{name:'未命名作品'}};state.title='未命名作品';state.bpm=Number($('#bpm').value);state.notation={...getSettings(),grid:0};setSourceInfo(state.source.file,'空白樂譜');selectTab('edit');available();saveDraft()};
 $('#arrange-btn').onclick=()=>{if(state.busy)return;try{applyArrangement();toast('已套用設定；可使用復原還原先前編輯')}catch(e){status(e.message,'error')}};
 $('#cancel-btn').onclick=()=>{state.cancel=true;cancelAnalysis?.();status('已停止分析，原作品已保留')};
 $('#restore-draft').onclick=restoreDraft;$('#dismiss-draft').onclick=()=>$('#draft-notice').hidden=true;
 $('#title').oninput=e=>{state.title=e.target.value.trim().slice(0,100)||'Violin arrangement';available();saveDraft()};
 $('#title').onblur=syncTitle;
 const drop=$('#dropzone');
 for(const ev of ['dragenter','dragover'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragging')});
 for(const ev of ['dragleave','drop'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragging')});
 drop.addEventListener('drop',e=>openFile(e.dataTransfer.files[0]));
 for(const id of ['transpose','strength','threshold','vibrato','reverb','volume'])$('#'+id).oninput=()=>{syncRangeLabels();if(id==='volume'&&sampler.master)sampler.master.gain.value=Number($('#volume').value)/100*.82};
 for(const id of controlIds.concat('octaves'))$('#'+id).addEventListener('change',()=>{saveDraft();if(state.notes.length)status('設定已變更，按「套用設定並重新編曲」更新作品；辨識區段與門檻需按「開始轉換」')});
 $('#play-btn').onclick=play;$('#stop-btn').onclick=stop;
 sampler.onStop=()=>{$('#play-btn').textContent='▶';$('#play-btn').setAttribute('aria-label','播放')};
 sampler.onTime=(p,d)=>{$('#clock').textContent=fmt(p)+' / '+fmt(d);$('#seek').value=d?Math.round(p/d*1000):0;updatePlayhead(p)};
 sampler.onEnd=()=>{if($('#loop').checked&&!state.busy)play()};
 $('#original-audio').onplay=stop;
 const seek=$('#seek');
 seek.oninput=e=>{const target=duration()*Number(e.target.value)/1000;resumeAfterSeek=resumeAfterSeek||sampler.playing;sampler.seek(target)};
 seek.onchange=()=>{if(resumeAfterSeek){resumeAfterSeek=false;play()}};
 seek.onpointercancel=()=>{resumeAfterSeek=false};
 for(const id of ['instrument','speed','vibrato','reverb'])$('#'+id).onchange=()=>{
  const was=sampler.playing;sampler.pause();if(was)play();saveDraft();
 };
 $$('[data-tab]').forEach((b,i,buttons)=>{
  b.onclick=()=>selectTab(b.dataset.tab);
  b.onkeydown=e=>{
   const next=e.key==='ArrowRight'?(i+1)%buttons.length:e.key==='ArrowLeft'?(i+buttons.length-1)%buttons.length:e.key==='Home'?0:e.key==='End'?buttons.length-1:null;
   if(next!==null){e.preventDefault();selectTab(buttons[next].dataset.tab);buttons[next].focus()}
  };
 });
 $('#rerender-btn').onclick=()=>{clearTimeout(renderTimer);renderScore().catch(e=>toast(e.message))};
 $('#piano-zoom').oninput=renderPiano;
 $('#piano-roll').onclick=e=>{
  if(!rollLayout)return;const rect=e.currentTarget.getBoundingClientRect();
  const x=(e.clientX-rect.left)*rollLayout.w/rect.width,y=(e.clientY-rect.top)*rollLayout.h/rect.height;
  const hit=rollBoxes.findLast(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);if(hit)selectedNote(hit.index);
 };
 $('#note-table').addEventListener('change',e=>{
  const field=e.target.dataset.field;if(!field)return;
  const index=Number(e.target.closest('tr').dataset.index),text=e.target.value.trim();
  const v=field==='pitch'?parsePitch(text):text===''?NaN:Number(text);
  if(!Number.isFinite(v)||(field==='velocity'&&(v<1||v>127))){toast('請輸入有效值；音高例如 G4、C#5，力度為 1–127');renderTable();return}
  updateNote(index,{[field]:field==='velocity'?v/127:v});
 });
 $('#note-table').onclick=e=>{if(state.busy)return;const b=e.target.closest('[data-delete]');if(!b)return;pushUndo();state.notes.splice(Number(b.dataset.delete),1);finishEdit()};
 $('#add-note').onclick=()=>{
  if(state.busy)return;if(state.notes.length>=20000||duration()>=7199){toast('作品已達長度或音符上限');return}
  pushUndo();state.notes.push({pitch:69,start:duration(),duration:60/state.bpm,velocity:.8});
  state.page=Math.floor((state.notes.length-1)/40);finishEdit();
 };
 $('#undo-btn').onclick=()=>undo();$('#redo-btn').onclick=()=>undo(true);
 $('#prev-notes').onclick=()=>{state.page--;renderTable()};$('#next-notes').onclick=()=>{state.page++;renderTable()};
 $('#export-midi').onclick=()=>{try{saveBlob(Core.encodeMidi(state.notes,{bpm:state.bpm,title:state.title,program:{violin:40,viola:41,cello:42,string_ensemble_1:48}[$('#instrument').value]}),name()+'.mid','audio/midi');toast('MIDI 已輸出')}catch(e){toast(e.message)}};
 $('#export-xml').onclick=()=>{try{saveBlob(scoreXML(),name()+'.musicxml','application/vnd.recordare.musicxml+xml');toast('MusicXML 已輸出')}catch(e){toast(e.message)}};
 $('#export-project').onclick=()=>{saveBlob(JSON.stringify(projectData(),null,2),name()+'.violin.json','application/json');toast('專案已備份；原始音訊不包含在內')};
 $('#export-pdf').onclick=async()=>{
  busy(true);try{selectTab('score');clearTimeout(renderTimer);const ready=await renderScore();if(ready)window.print();else toast('正式樂譜尚未排版完成，請重試或下載 MusicXML')}
  catch(e){toast(e.message)}finally{busy(false)}
 };
 $('#export-audio').onclick=async()=>{
  if(state.busy)return;stop();busy(true);progress('合成演奏音檔',10,'將套用目前音色、速度、音量、揉弦與殘響');
  try{const data=await sampler.render(state.notes,audioSettings(),s=>progress('合成演奏音檔',60,s));saveBlob(data,name()+'.wav','audio/wav');toast('WAV 已輸出')}
  catch(e){status(e.message||'輸出失敗','error')}finally{busy(false);$('#progress-box').hidden=true}
 };
 window.addEventListener('keydown',e=>{
  const typing=e.target.matches('input,select,textarea,[contenteditable]');if(typing)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey)}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true)}
 });
 window.addEventListener('beforeunload',()=>{flushDraft();sampler.stop();worker?.terminate();if(state.originalUrl)URL.revokeObjectURL(state.originalUrl)});
 window.addEventListener('resize',()=>{if(state.originalBuffer)drawWaveform(state.originalBuffer);if(state.tab==='piano')renderPiano()});
}
ensureEnhancements();setupEvents();available();showDraftNotice();syncRangeLabels();selectTab('score');

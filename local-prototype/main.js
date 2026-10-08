import './style.css';
import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { BOT_INSTRUCTIES } from './instructions.js';
import { KEY,restore,persist,contextFor } from './privacy.js';
const $=id=>document.getElementById(id);
let engine, history=[], busy=false;
try { history=restore(localStorage); $('remember').checked=localStorage.getItem(KEY)!==null; }
catch { $('error').textContent='Het opgeslagen gesprek kan niet worden gelezen. Wis het of ga zonder bewaren verder.'; }
function render(){
  $('messages').replaceChildren(...history.map(m=>{const div=document.createElement('div');div.className='message '+m.role;const label=document.createElement('strong');label.textContent=m.role==='user'?'Jij':'Always In Control';const p=document.createElement('p');p.textContent=m.content;div.append(label,p);return div;}));
}
function save(){try{persist(localStorage,history,$('remember').checked);}catch{$('remember').checked=false;$('error').textContent='Bewaren is niet gelukt. Het gesprek blijft alleen in deze sessie beschikbaar.';try{localStorage.removeItem(KEY);}catch{}}}
function controls(){ $('send').disabled=!engine||busy;$('input').disabled=!engine||busy;$('clear').disabled=busy;$('remember').disabled=busy; }
$('remember').onchange=save;
$('clear').onclick=async()=>{history=[];$('input').value='';$('error').textContent='';try{localStorage.removeItem(KEY);}catch{$('error').textContent='Opgeslagen tekst kon niet worden gewist. Wis de sitegegevens in je browser.';}render();if(engine)try{await engine.resetChat();}catch{engine=null;controls();$('setup').hidden=false;$('start').disabled=false;$('status').textContent='Laad de lokale AI opnieuw.';}};
$('input').onpaste=e=>{if([...e.clipboardData.items].some(i=>i.kind==='file')){e.preventDefault();$('error').textContent='Screenshots en bestanden worden niet aangenomen. Plak alleen tekst.';}};
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{e.preventDefault();$('error').textContent='Bestanden worden niet aangenomen.';});
$('start').onclick=async()=>{
  $('start').disabled=true;$('error').textContent='';
  try{
    if(!navigator.gpu)throw new Error();
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error();
    const modelId=adapter.features.has('shader-f16')?'Qwen2.5-1.5B-Instruct-q4f16_1-MLC':'Qwen2.5-1.5B-Instruct-q4f32_1-MLC';
    const model=prebuiltAppConfig.model_list.find(m=>m.model_id===modelId);
    if(!model)throw new Error();
    engine=await CreateMLCEngine(model.model_id,{initProgressCallback:p=>{$('status').textContent='AI laden: '+Math.round(p.progress*100)+'%';}});
    $('status').textContent='Lokale AI klaar. Antwoorden worden op dit apparaat berekend.';
    $('setup').hidden=true;
  }catch{engine=null;$('status').textContent='Lokale AI kon niet worden geladen op dit apparaat.';$('error').textContent='Deze proef vereist een geschikte browser en voldoende geheugen. Er wordt niet overgeschakeld naar een online AI.';$('start').disabled=false;}
  controls();
};
$('chat').onsubmit=async e=>{
 e.preventDefault();const content=$('input').value.trim();if(!engine||busy||!content)return;
 busy=true;controls();$('error').textContent='';$('status').textContent='De lokale coach denkt na…';
 const pending=[...history,{role:'user',content}];
 try{
   const reply=await engine.chat.completions.create({messages:[{role:'system',content:BOT_INSTRUCTIES},...contextFor(pending)],temperature:0.4,max_tokens:1100});
   const answer=reply.choices[0]?.message?.content;if(typeof answer!=='string'||!answer.trim())throw new Error();
   history=[...pending,{role:'assistant',content:answer}];$('input').value='';render();save();$('status').textContent='Antwoord gereed. Bij lange gesprekken ziet de coach alleen het recentste gedeelte.';
 }catch{$('error').textContent='Antwoorden lukte niet. Je tekst staat nog klaar. Probeer een kortere situatie of begin een nieuw gesprek.';$('status').textContent='Geen antwoord gemaakt.';}
 finally{busy=false;controls();}
};
render();


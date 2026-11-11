import {TIERS,$,el,onUser,api,cardsOf,levelList} from "./shared.js";

const fmt = n => n.toLocaleString();
const cell = (tag,text,cls) => el(tag,cls||"",text);
let rows = [];                       // [{name,pos,counts:{tier:n}}]

/* Left/cap text for one tier of one level. Common has no cap. */
function slot(t,n){
  if(t.cap===Infinity) return {text:fmt(n),cls:""};
  const left = t.cap-n;
  return {text:`${n} / ${t.cap}`, cls:left<=0?"out":""};
}

function renderTiers(counts,levelCount){
  const head = el("tr"); ["Tier","Cap per level","Max possible","In circulation","Left"].forEach(h=>head.append(cell("th",h)));
  const body = TIERS.map(t=>{
    const tr = el("tr"), name = cell("td",t.name,"tiername"); name.style.setProperty("--c",t.color);
    const inf = t.cap===Infinity, max = t.cap*levelCount, made = counts[t.id]||0;
    tr.append(name, cell("td",inf?"Unlimited":fmt(t.cap)), cell("td",inf?"Unlimited":fmt(max)),
      cell("td",fmt(made)), cell("td",inf?"Unlimited":fmt(Math.max(0,max-made))));
    return tr;
  });
  const total = cell("td",fmt(Object.values(counts).reduce((a,b)=>a+b,0))); 
  const foot = el("tr","sum"); foot.append(cell("td","All tiers"),cell("td",""),cell("td",""),total,cell("td",""));
  $("#tiers").replaceChildren(el("thead","",null), ...body, foot);
  $("#tiers thead").append(head);
}

function renderLevels(){
  const q = $("#levelFilter").value.trim().toLowerCase();
  const head = el("tr"); head.append(cell("th","#"),cell("th","Level"));
  TIERS.forEach(t=>{const h=cell("th",t.name,"tiername"); h.style.setProperty("--c",t.color); head.append(h)});
  const body = rows.filter(r=>r.name.toLowerCase().includes(q)).map(r=>{
    const tr = el("tr"); tr.append(cell("td",r.pos??"–"),cell("td",r.name));
    TIERS.forEach(t=>{const s=slot(t,r.counts[t.id]||0); tr.append(cell("td",s.text,s.cls))});
    return tr;
  });
  if(!body.length){ const tr=el("tr"), td=cell("td","No levels match."); td.colSpan=2+TIERS.length; tr.append(td); body.push(tr); }
  const thead = el("thead"); thead.append(head);
  $("#levels").replaceChildren(thead,...body);
}

onUser(async()=>{
  const [list, players] = await Promise.all([levelList(), api("profiles")]);
  /* There is no "all cards" endpoint, so add up every player's collection. */
  const all = (await Promise.all(players.map(p=>cardsOf(p.id)))).flat();

  const byLevel = new Map(), counts = {};
  list.forEach(l=>byLevel.set(String(l.id),{name:l.lvlname,pos:l.position,counts:{}}));
  all.forEach(c=>{
    const k = String(c.level_id);
    if(!byLevel.has(k)) byLevel.set(k,{name:c.lvlname,pos:null,counts:{}});   // card for a level that isn't in the list
    const r = byLevel.get(k); r.counts[c.rarity]=(r.counts[c.rarity]||0)+1;
    counts[c.rarity]=(counts[c.rarity]||0)+1;
  });
  rows = [...byLevel.values()].sort((a,b)=>(a.pos??1e9)-(b.pos??1e9) || a.name.localeCompare(b.name));

  const n = list.length || byLevel.size;
  $("#status").textContent = `${fmt(all.length)} cards in circulation across ${fmt(n)} levels, held by ${fmt(players.length)} players.`
    + (list.length ? "" : " (Demon list unavailable, so \"Max possible\" only covers levels that have been pulled.)");
  renderTiers(counts,n);
  $("#levelFilter").oninput = renderLevels;
  renderLevels();
});

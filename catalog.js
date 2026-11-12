import {TIERS,$,el,onPage,api,levelList} from "./shared.js";

const fmt = n => n.toLocaleString();
const cell = (tag,text,cls) => el(tag,cls||"",text);
let rows = [];                       // [{name,pos,cards:{tier:[{serial,owner}]}}]
let sort = {tier:null,dir:-1}, focusTier = null;   // dir -1 = most copies first, 1 = fewest first

/* ---------- owner tooltip ---------- */
const tip = el("div","tip"); tip.hidden = true; tip.setAttribute("role","tooltip"); document.body.append(tip);
function showTip(target,title,lines){
  tip.replaceChildren(el("div","tt",title), ...lines.map(l=>el("div","",l)));
  tip.hidden = false;
  const r = target.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  const left = Math.max(8, Math.min(r.left + r.width/2 - w/2, innerWidth - w - 8));
  const top = r.bottom + 8 + h > innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8;
  tip.style.left = left+"px"; tip.style.top = top+"px";
}
const hideTip = () => { tip.hidden = true; };
/* Hover, keyboard focus, or tap shows it. */
function attachTip(td,title,lines){
  td.classList.add("hasTip"); td.tabIndex = 0;
  td.onmouseenter = td.onfocus = () => showTip(td,title,lines);
  td.onmouseleave = td.onblur = hideTip;
  td.onclick = () => tip.hidden ? showTip(td,title,lines) : hideTip();
}
addEventListener("scroll",hideTip,true);

/* "Owner x3", biggest holders first, capped. */
function groupLines(owners,max){
  const m = new Map(); owners.forEach(o=>m.set(o,(m.get(o)||0)+1));
  const r = [...m].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]));
  const out = r.slice(0,max).map(([o,n])=>n>1 ? `${o} ×${n}` : o);
  if(r.length>max) out.push(`+ ${r.length-max} more owners`);
  return out;
}
/* One line per card ("#3  Owner") while the list is short, otherwise grouped by owner. */
function cardLines(cards,max=12){
  const list = [...cards].sort((a,b)=>a.serial-b.serial);
  return list.length<=max ? list.map(c=>`#${c.serial}  ${c.owner}`) : groupLines(list.map(c=>c.owner),max);
}

/* ---------- tables ---------- */
function renderTiers(ownersByTier,levelCount){
  const head = el("tr"); ["Tier","Cap per level","Max possible","In circulation","Left"].forEach(h=>head.append(cell("th",h)));
  let all = 0;
  const body = TIERS.map(t=>{
    const tr = el("tr"), name = cell("td",t.name,"tiername"); name.style.setProperty("--c",t.color);
    const inf = t.cap===Infinity, max = t.cap*levelCount, owners = ownersByTier[t.id]||[], made = owners.length;
    all += made;
    const circ = cell("td",fmt(made));
    if(made) attachTip(circ,`${t.name} owners`,groupLines(owners,15));
    tr.append(name, cell("td",inf?"Unlimited":fmt(t.cap)), cell("td",inf?"Unlimited":fmt(max)),
      circ, cell("td",inf?"Unlimited":fmt(Math.max(0,max-made))));
    return tr;
  });
  const foot = el("tr","sum"); foot.append(cell("td","All tiers"),cell("td",""),cell("td",""),cell("td",fmt(all)),cell("td",""));
  const thead = el("thead"); thead.append(head);
  $("#tiers").replaceChildren(thead,...body,foot);
}

function renderLevels(){
  const q = $("#levelFilter").value.trim().toLowerCase();
  const head = el("tr"); head.append(cell("th","#"),cell("th","Level"));
  /* Click a rarity: most copies first, click again: fewest first, again: back to list order. */
  TIERS.forEach(t=>{
    const h = cell("th",t.name,"tiername sortable"), on = sort.tier===t.id;
    h.style.setProperty("--c",t.color); h.dataset.tier = t.id; h.tabIndex = 0;
    h.title = `Sort by number of ${t.name} copies`;
    h.setAttribute("aria-sort", on ? (sort.dir<0?"descending":"ascending") : "none");
    if(on) h.append(" ", el("span","arrow", sort.dir<0 ? "▼" : "▲"));
    const toggle = () => {
      sort = !on ? {tier:t.id,dir:-1} : sort.dir<0 ? {tier:t.id,dir:1} : {tier:null,dir:-1};
      focusTier = t.id; renderLevels();
    };
    h.onclick = toggle;
    h.onkeydown = e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(); } };
    head.append(h);
  });
  let shown = rows.filter(r=>r.name.toLowerCase().includes(q));
  if(sort.tier){ const n = r=>(r.cards[sort.tier]||[]).length; shown = [...shown].sort((a,b)=>sort.dir*(n(a)-n(b))); }   // ties keep list order
  const body = shown.map(r=>{
    const tr = el("tr"); tr.append(cell("td",r.pos??"–"),cell("td",r.name));
    TIERS.forEach(t=>{
      const cards = r.cards[t.id]||[], n = cards.length;
      const text = t.cap===Infinity ? fmt(n) : `${n} / ${t.cap}`;
      const td = cell("td",text,t.cap!==Infinity && n>=t.cap ? "out" : "");
      if(n) attachTip(td,`${r.name} · ${t.name}`,cardLines(cards));
      tr.append(td);
    });
    return tr;
  });
  if(!body.length){ const tr=el("tr"), td=cell("td","No levels match."); td.colSpan=2+TIERS.length; tr.append(td); body.push(tr); }
  const thead = el("thead"); thead.append(head);
  $("#levels").replaceChildren(thead,...body);
  if(focusTier){ $(`#levels th[data-tier="${focusTier}"]`)?.focus(); focusTier = null; }
}

onPage(async()=>{
  let list, data;
  try{ [list, data] = await Promise.all([levelList(), api("catalog")]); }
  catch(e){ $("#status").textContent = "Couldn't load the catalog: "+e.message; return; }
  const all = data.cards.map(c=>({...c, owner:c.owner?.name || "Unknown"}));    // public: owner names only, no account ids

  const byLevel = new Map(), ownersByTier = {};
  list.forEach(l=>byLevel.set(String(l.id),{name:l.lvlname,pos:l.position,cards:{}}));
  all.forEach(c=>{
    const k = String(c.level_id);
    if(!byLevel.has(k)) byLevel.set(k,{name:c.lvlname,pos:null,cards:{}});   // card for a level that isn't in the list
    ((byLevel.get(k).cards[c.rarity] ||= [])).push({serial:c.serial,owner:c.owner});
    (ownersByTier[c.rarity] ||= []).push(c.owner);
  });
  rows = [...byLevel.values()].sort((a,b)=>(a.pos??1e9)-(b.pos??1e9) || a.name.localeCompare(b.name));

  const n = list.length || byLevel.size;
  $("#status").textContent = `${fmt(all.length)} cards in circulation across ${fmt(n)} levels, held by ${fmt(data.players)} players. Hover a count to see who owns them.`
    + (list.length ? "" : ' (Demon list unavailable, so "Max possible" only covers levels that have been pulled.)');
  renderTiers(ownersByTier,n);
  $("#levelFilter").oninput = renderLevels;
  renderLevels();
});

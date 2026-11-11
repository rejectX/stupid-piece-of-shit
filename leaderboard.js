import {TIERS,$,el,onUser,api,cardsOf,profileUrl} from "./shared.js";

const fmt = n => n.toLocaleString();
const cell = (tag,text,cls) => el(tag,cls||"",text);

/* Each tab ranks players by one number. */
const TABS = [
  {id:"total", label:"Total cards",  title:"Most cards owned",       value:p=>p.total},
  {id:"first", label:"#1 serials",   title:"Most #1 serial cards",   value:p=>p.first},
  ...TIERS.map(t=>({id:t.id, label:t.name, color:t.color, title:`Most ${t.name} cards`, value:p=>p.rarity[t.id]||0}))
];

let stats = [], myId = null, current = "total";

function render(){
  const tab = TABS.find(t=>t.id===current);
  document.querySelectorAll("#tabs button").forEach(b=>{
    const on = b.dataset.tab===current; b.classList.toggle("on",on); b.setAttribute("aria-selected",String(on));
  });
  const ranked = stats.map(p=>({p,v:tab.value(p)})).filter(x=>x.v>0)
    .sort((a,b)=>b.v-a.v || b.p.total-a.p.total || a.p.name.localeCompare(b.p.name));
  $("#status").textContent = ranked.length ? `${tab.title}. ${fmt(ranked.length)} of ${fmt(stats.length)} players ranked.` : `${tab.title}: nobody has any yet.`;

  const head = el("tr"); ["Rank","Player",tab.label].forEach((h,i)=>head.append(cell("th",h,i===2?"num":"")));
  let rank = 0, prev = null;                                   // equal counts share a rank (1, 2, 2, 4)
  const body = ranked.map((x,i)=>{
    if(x.v!==prev){ rank = i+1; prev = x.v; }
    const tr = el("tr", x.p.id===myId ? "me" : ""), a = el("a","",x.p.name); a.href = profileUrl(x.p.id);
    const name = cell("td",""); name.append(a); if(x.p.id===myId) name.append(el("span","muted"," (you)"));
    const val = cell("td",fmt(x.v),"num"+(tab.color?" tiername":"")); if(tab.color) val.style.setProperty("--c",tab.color);
    tr.append(cell("td",String(rank),"rank"),name,val);
    return tr;
  });
  const thead = el("thead"); thead.append(head);
  $("#board").replaceChildren(thead,...body);
}

function pick(id){
  current = id;
  history.replaceState(null,"","#"+id);
  render();
}

onUser(async me=>{
  myId = me.id;
  const tabs = $("#tabs");
  tabs.replaceChildren(...TABS.map(t=>{
    const b = el("button","",t.label); b.dataset.tab = t.id; b.setAttribute("role","tab"); b.onclick = ()=>pick(t.id); return b;
  }));
  const fromHash = location.hash.slice(1);
  if(TABS.some(t=>t.id===fromHash)) current = fromHash;

  const players = await api("profiles");
  /* There is no "all cards" endpoint, so tally every player's collection. */
  stats = await Promise.all(players.map(async p=>{
    const cards = await cardsOf(p.id), rarity = {}; let first = 0;
    cards.forEach(c=>{ rarity[c.rarity] = (rarity[c.rarity]||0)+1; if(c.serial===1) first++; });
    return {id:p.id, name:p.name, rarity, first, total:cards.length};
  }));
  render();
});

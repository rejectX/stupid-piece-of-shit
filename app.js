import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {auth} from "./firebase.js";
import {T,$,el,toast,label,cardEl,cardsOf,api,signIn,showProgress,renderNav,renderWho} from "./shared.js";

let me=null, mine=[], found=null, coolTimer;

/* ---------- packs ---------- */
async function openPack(){
  $("#open").disabled=true;
  try{
    const cards = await api("open_pack");                 // rarity and serials are rolled on the server
    const box=$("#reveal"); box.replaceChildren();
    cards.forEach((c,i)=>{const e=cardEl(c); e.classList.add("pop"); e.style.animationDelay=(0.5+i*1)+"s"; box.append(e)});
    await refreshCollection();
  }catch(e){ toast(e.message); }
  cooldownTick();
}
async function cooldownTick(){
  clearInterval(coolTimer);
  const end = Date.now() + (await api("pack_wait"))*1000;
  const tick=()=>{const s=Math.ceil((end-Date.now())/1000);
    $("#cool").textContent = s>0 ? `Next pack in ${s}s` : "Pack ready."; $("#open").disabled = s>0; if(s<=0)clearInterval(coolTimer)};
  tick(); coolTimer=setInterval(tick,500);
}

/* ---------- collection ---------- */
async function refreshCollection(){
  mine = await cardsOf(me.id);
  $("#grid").replaceChildren(...mine.map(cardEl));
  const uniq=new Set(mine.map(c=>c.level_id)).size;
  $("#stats").textContent = mine.length ? `${mine.length} cards · ${uniq} different levels` : "No cards yet. Open a pack to get started.";
  showProgress($("#progress"),mine);
  fillPicks($("#offer"),mine,picked($("#offer")));
}

/* ---------- trading ---------- */
async function openCollector(id,wantId){
  if(id===me.id) return toast("You can't trade with yourself.");
  const u = await api("profile",{id});
  if(!u) return toast("Collector not found.");
  const cards = await cardsOf(id);
  if(!cards.length) return toast(u.name+" has no cards yet.");
  found={id,name:u.name,cards};
  $("#who-name").value=u.name;
  fillPicks($("#want"),cards,wantId?[wantId]:[]);
  $("#tradeForm").hidden=false;
}
async function findCollector(){
  const name=$("#who-name").value.trim().toLowerCase(); if(!name) return;
  const data=await api("find",{name});
  if(!data || data.id===me.id) return toast("No other collector with that name.");
  await openCollector(data.id);
}
/* Checkbox lists: tick as many cards as you like on each side (1 for 1, 2 for 1, 3 for 2, ...). */
const picked = box => [...box.querySelectorAll("input:checked")].map(i=>i.value);
function updateSummary(){
  const g=picked($("#offer")).length, w=picked($("#want")).length;
  $("#tradeSummary").textContent = g||w ? `You give ${g}, you get ${w}.` : "";
}
function fillPicks(box,cards,checked=[]){
  box.replaceChildren(...cards.map(c=>{
    const row=el("label","pick"), cb=document.createElement("input"), txt=el("span","",label(c));
    cb.type="checkbox"; cb.value=c.id; cb.checked=checked.includes(c.id); cb.onchange=updateSummary;
    txt.style.setProperty("--c",T[c.rarity].color); row.append(cb,txt); return row;
  }));
  updateSummary();
}
async function sendTrade(){
  const offer=picked($("#offer")), want=picked($("#want"));
  if(!offer.length||!want.length) return toast("Pick at least one card on each side.");
  const single = offer.length===1 && want.length===1;      // 1-for-1 keeps the original request shape
  try{ await api("create_trade", single ? {offer:offer[0],want:want[0]} : {offer,want}); toast("Trade offer sent."); $("#tradeForm").hidden=true; loadTrades(); }
  catch(e){ toast(e.message); }
}
async function respond(trade,act){
  try{ await api("respond_trade",{trade,act}); if(act==="accept"){toast("Trade complete."); refreshCollection();} }
  catch(e){ toast(e.message); }
  loadTrades();
}
/* A trade's offer/want can be one card (old trades) or an array of cards. */
const asList = x => Array.isArray(x) ? x : [x];
const plain = cards => asList(cards).map(label).join(", ");
function names(cards){
  const s=el("span");
  asList(cards).forEach((c,i)=>{ if(i) s.append(", "); const b=el("b","",label(c)); b.style.setProperty("--c",T[c.rarity].color); s.append(b); });
  return s;
}
function offerRow(t,incoming){
  const row=el("div","offer"), txt=el("div","txt");
  txt.append(incoming?`${t.sender.name} offers `:"You want ", names(incoming?t.offer:t.want),
    el("div","muted", incoming ? `for your ${plain(t.want)}` : `from ${t.receiver.name} for your ${plain(t.offer)}`));
  row.append(txt);
  const btn=(text,act)=>{const b=el("button","",text); b.onclick=()=>respond(t.id,act); return b};
  row.append(...(incoming ? [btn("Accept","accept"),btn("Decline","decline")] : [btn("Cancel","cancel")]));
  return row;
}
async function loadTrades(){
  let data; try{ data=await api("trades"); }catch(e){ return toast(e.message); }
  const fill=(box,list,inc)=>box.replaceChildren(...(list.length?list.map(t=>offerRow(t,inc)):[el("p","muted","Nothing pending.")]));
  fill($("#incoming"),data.filter(t=>t.to_id===me.id),true);
  fill($("#outgoing"),data.filter(t=>t.from_id===me.id),false);
}

/* ---------- shell ---------- */
function show(tab){
  document.querySelectorAll(".tab").forEach(s=>s.hidden=s.id!==tab);
  document.querySelectorAll("nav [data-tab]").forEach(b=>b.classList.toggle("on",b.dataset.tab===tab));
  if(tab==="collection") refreshCollection();
  if(tab==="trades") loadTrades();
}
$("#signin").onclick=signIn; $("#open").onclick=openPack; $("#find").onclick=findCollector; $("#send").onclick=sendTrade;

onAuthStateChanged(auth, async u=>{
  $("#login").hidden=!!u; $("#nav").hidden=!u;
  if(!u){ document.querySelectorAll(".tab").forEach(s=>s.hidden=true); $("#who").replaceChildren(); $("#nav").replaceChildren(); return; }
  try{
    me=await api("claim");
    renderNav(me,show); renderWho(me); cooldownTick();
    const p=new URLSearchParams(location.search), tu=p.get("trade");
    if(tu){ await refreshCollection(); show("trades"); await openCollector(tu,p.get("want")); history.replaceState(null,"",location.pathname); }
    else show(["collection","packs","trades"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "collection");
  }catch(e){ console.error(e); toast(e.message); }
});

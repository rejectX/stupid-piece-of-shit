import {signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {auth} from "./firebase.js";
import {T,$,el,toast,label,cardEl,cardsOf,profileUrl,api,signIn} from "./shared.js";

const NAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
let me=null, mine=[], found=null, coolTimer;

/* ---------- packs ---------- */
async function openPack(){
  $("#open").disabled=true;
  try{
    const cards = await api("open_pack");                 // rarity and serials are rolled on the server
    const box=$("#reveal"); box.replaceChildren();
    cards.forEach((c,i)=>{const e=cardEl(c); e.classList.add("pop"); e.style.animationDelay=i*0.25+"s"; box.append(e)});
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
  $("#offer").replaceChildren(...mine.map(c=>new Option(label(c),c.id)));
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
  $("#want").replaceChildren(...cards.map(c=>new Option(label(c),c.id)));
  if(wantId && cards.some(c=>c.id===wantId)) $("#want").value=wantId;
  $("#tradeForm").hidden=false;
}
async function findCollector(){
  const name=$("#who-name").value.trim().toLowerCase(); if(!name) return;
  const data=await api("find",{name});
  if(!data || data.id===me.id) return toast("No other collector with that name.");
  await openCollector(data.id);
}
async function sendTrade(){
  const offer=$("#offer").value, want=$("#want").value;
  if(!offer||!want) return toast("Pick one card from each side.");
  try{ await api("create_trade",{offer,want}); toast("Trade offer sent."); $("#tradeForm").hidden=true; loadTrades(); }
  catch(e){ toast(e.message); }
}
async function respond(trade,act){
  try{ await api("respond_trade",{trade,act}); if(act==="accept"){toast("Trade complete."); refreshCollection();} }
  catch(e){ toast(e.message); }
  loadTrades();
}
function offerRow(t,incoming){
  const row=el("div","offer"), txt=el("div","txt");
  const card=incoming?t.offer:t.want, give=el("b",""," "+label(card)); give.style.setProperty("--c",T[card.rarity].color);
  txt.append(incoming?`${t.sender.name} offers`:"You want", give,
    el("div","muted", incoming ? `for your ${label(t.want)}` : `from ${t.receiver.name} for your ${label(t.offer)}`));
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

/* ---------- usernames ---------- */
function renderWho(){
  const out=el("button","","Sign out"), ren=el("button","","Change username"), nm=el("a","",me.name);
  nm.href=profileUrl(me.id); nm.title="View your profile";
  out.onclick=()=>signOut(auth);
  ren.onclick=()=>{$("#newName").value=me.name; $("#nameErr").textContent=""; $("#nameDlg").showModal(); $("#newName").select()};
  $("#who").replaceChildren(nm,ren,out);
}
$("#cancelName").onclick=()=>$("#nameDlg").close();
$("#nameForm").onsubmit=async e=>{
  e.preventDefault();
  const name=$("#newName").value.trim(), err=$("#nameErr");
  if(!NAME_RE.test(name)) return err.textContent="Use 3–20 letters, numbers, _ . or -";
  if(name===me.name) return $("#nameDlg").close();
  try{ await api("rename",{name}); me.name=name; renderWho(); $("#nameDlg").close(); toast("Username changed to "+name+"."); }
  catch(ex){ err.textContent=ex.message; }
};

/* ---------- shell ---------- */
function show(tab){
  document.querySelectorAll(".tab").forEach(s=>s.hidden=s.id!==tab);
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.tab===tab));
  if(tab==="collection") refreshCollection();
  if(tab==="trades") loadTrades();
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>show(b.dataset.tab));
$("#signin").onclick=signIn; $("#open").onclick=openPack; $("#find").onclick=findCollector; $("#send").onclick=sendTrade;

onAuthStateChanged(auth, async u=>{
  $("#login").hidden=!!u; $("#nav").hidden=!u;
  if(!u){ document.querySelectorAll(".tab").forEach(s=>s.hidden=true); $("#who").replaceChildren(); return; }
  try{
    me=await api("claim");
    renderWho(); $("#myProfile").href=profileUrl(me.id); cooldownTick();
    const p=new URLSearchParams(location.search), tu=p.get("trade");
    if(tu){ await refreshCollection(); show("trades"); await openCollector(tu,p.get("want")); history.replaceState(null,"",location.pathname); }
    else show("collection");
  }catch(e){ console.error(e); toast(e.message); }
});

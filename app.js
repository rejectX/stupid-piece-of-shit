import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,collection,query,where,getDocs,runTransaction,writeBatch,onSnapshot,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* 1. Paste your Firebase web app config here (Project settings > Your apps). */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID"
};

const API = "https://146.59.93.5/demonlist/api/levels.php";
const PACK_SIZE = 3, COOLDOWN_MS = 60_000;

/* Rarity tiers, best first. Each level has its own serial counter per tier, so tiers never share
   a serial. cap = max copies per level. weight = chance of rolling that tier. If a tier is sold out
   for a level, the roll falls down to the next tier. */
const TIERS = [
  {id:"mythic",    name:"Mythic",    cap:1,        weight:1},
  {id:"legendary", name:"Legendary", cap:5,        weight:4},
  {id:"epic",      name:"Epic",      cap:20,       weight:10},
  {id:"rare",      name:"Rare",      cap:60,       weight:25},
  {id:"common",    name:"Common",    cap:Infinity, weight:60}
];
const T = Object.fromEntries(TIERS.map((t,i)=>[t.id,{...t,rank:i}]));

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = s => document.querySelector(s);
const el = (tag,cls,text) => {const e=document.createElement(tag); if(cls)e.className=cls; if(text!=null)e.textContent=text; return e};
const toast = msg => {const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast.id); toast.id=setTimeout(()=>t.classList.remove("show"),3500)};
const ytId = u => (u||"").split("/embed/")[1]?.split(/[?&#]/)[0] || null;
const serialText = c => T[c.rarity].cap===Infinity ? `#${c.serial}` : `#${c.serial} / ${T[c.rarity].cap}`;
const label = c => `${c.lvlname} · ${T[c.rarity].name} ${serialText(c)}`;

let me=null, levels=[], mine=[], found=null, incoming=[], outgoing=[];

/* ---------- levels ---------- */
async function loadLevels(){
  if(levels.length) return;
  let data;
  try{ data = await (await fetch(API)).json(); }
  catch(e){ data = await (await fetch("levels.json")).json(); }   // fallback: saved copy of the API response
  levels = data.filter(l=>l.id!=null && l.lvlname);
}

/* ---------- card rendering ---------- */
function cardEl(c){
  const d = el("div","card r-"+c.rarity), th = el("div","thumb");
  if(c.yt){const i=el("img"); i.alt=""; i.loading="lazy"; i.src=`https://i.ytimg.com/vi/${c.yt}/hqdefault.jpg`; th.append(i)}
  const foot = el("div","foot"); foot.append(el("span","rar",T[c.rarity].name), el("span","",serialText(c)));
  d.append(el("div","shine"), th, el("h3","",c.lvlname), el("p","by","by "+c.creator), foot);
  return d;
}

/* ---------- minting ---------- */
function rollTier(){
  let n = Math.random()*TIERS.reduce((a,t)=>a+t.weight,0);
  for(let i=0;i<TIERS.length;i++){ if((n-=TIERS[i].weight)<0) return i; }
  return TIERS.length-1;
}
async function mint(level){
  const cref = doc(db,"counters",String(level.id));
  return runTransaction(db, async tx=>{
    const c = (await tx.get(cref)).data() || {};
    let i = rollTier();
    while(i<TIERS.length-1 && (c[TIERS[i].id]||0) >= TIERS[i].cap) i++;     // sold out: drop a tier
    const t = TIERS[i], serial = (c[t.id]||0)+1;
    const card = {levelId:level.id, lvlname:level.lvlname, creator:level.creator||"Unknown", yt:ytId(level.ytlink),
      rarity:t.id, serial, ownerUid:me.uid, ownerName:me.displayName, lockTrade:null, created:serverTimestamp()};
    tx.set(cref,{[t.id]:serial},{merge:true});
    tx.set(doc(db,"cards",`${level.id}_${t.id}_${serial}`), card);           // unique id = no duplicate serials
    return card;
  });
}

async function openPack(){
  const btn=$("#open"); btn.disabled=true;
  try{
    const uref=doc(db,"users",me.uid), last=(await getDoc(uref)).data()?.lastPack||0;
    if(Date.now()-last < COOLDOWN_MS) return toast("Your next pack isn't ready yet.");
    await loadLevels();
    await setDoc(uref,{lastPack:Date.now()},{merge:true});
    const box=$("#reveal"); box.replaceChildren();
    for(let i=0;i<PACK_SIZE;i++){
      const card = await mint(levels[Math.floor(Math.random()*levels.length)]);
      const e = cardEl(card); e.classList.add("pop"); e.style.animationDelay=i*0.25+"s"; box.append(e);
    }
    await refreshCollection();
  }catch(e){ console.error(e); toast("Couldn't open the pack: "+e.message); }
  finally{ btn.disabled=false; cooldownTick(); }
}
let coolTimer;
async function cooldownTick(){
  clearInterval(coolTimer);
  const last=(await getDoc(doc(db,"users",me.uid))).data()?.lastPack||0;
  const tick=()=>{const left=Math.ceil((COOLDOWN_MS-(Date.now()-last))/1000);
    $("#cool").textContent = left>0 ? `Next pack in ${left}s` : "Pack ready."; $("#open").disabled = left>0; if(left<=0)clearInterval(coolTimer)};
  tick(); coolTimer=setInterval(tick,500);
}

/* ---------- collection ---------- */
const sortCards = a => a.sort((x,y)=>T[x.rarity].rank-T[y.rarity].rank || x.lvlname.localeCompare(y.lvlname) || x.serial-y.serial);
async function cardsOf(uid){
  const s = await getDocs(query(collection(db,"cards"),where("ownerUid","==",uid)));
  return sortCards(s.docs.map(d=>({id:d.id,...d.data()})));
}
async function refreshCollection(){
  mine = await cardsOf(me.uid);
  const g=$("#grid"); g.replaceChildren(...mine.map(cardEl));
  const uniq=new Set(mine.map(c=>c.levelId)).size;
  $("#stats").textContent = mine.length ? `${mine.length} cards · ${uniq} different levels` : "No cards yet. Open a pack to get started.";
  $("#offer").replaceChildren(...mine.map(c=>new Option(label(c),c.id)));
}

/* ---------- trading ---------- */
async function findCollector(){
  const name=$("#who-name").value.trim(); if(!name) return;
  const s=await getDocs(query(collection(db,"users"),where("name","==",name)));
  const u=s.docs.find(d=>d.id!==me.uid);
  if(!u) return toast("No other collector with that name.");
  const cards=await cardsOf(u.id);
  if(!cards.length) return toast(name+" has no cards yet.");
  found={uid:u.id,name,cards};
  $("#want").replaceChildren(...cards.map(c=>new Option(label(c),c.id)));
  $("#tradeForm").hidden=false;
}
async function sendTrade(){
  const offer=mine.find(c=>c.id===$("#offer").value), want=found?.cards.find(c=>c.id===$("#want").value);
  if(!offer||!want) return toast("Pick one card from each side.");
  const ref=doc(collection(db,"trades")), b=writeBatch(db);
  b.set(ref,{fromUid:me.uid,fromName:me.displayName,toUid:found.uid,toName:found.name,
    offerId:offer.id,offerLabel:label(offer),offerRarity:offer.rarity,
    wantId:want.id,wantLabel:label(want),wantRarity:want.rarity,status:"pending",created:serverTimestamp()});
  b.update(doc(db,"cards",offer.id),{lockTrade:ref.id});     // lets the recipient claim this card on accept
  try{ await b.commit(); toast("Trade offer sent."); $("#tradeForm").hidden=true; }
  catch(e){ toast("Couldn't send: "+e.message); }
}
async function acceptTrade(t){
  try{
    await runTransaction(db, async tx=>{
      const tr=doc(db,"trades",t.id), a=doc(db,"cards",t.offerId), b=doc(db,"cards",t.wantId);
      const [ts,as,bs]=await Promise.all([tx.get(tr),tx.get(a),tx.get(b)]);
      if(ts.data().status!=="pending") throw Error("This offer is no longer open.");
      if(as.data().ownerUid!==t.fromUid || bs.data().ownerUid!==me.uid) throw Error("One of the cards has already moved.");
      tx.update(a,{ownerUid:me.uid,ownerName:me.displayName,lockTrade:null});
      tx.update(b,{ownerUid:t.fromUid,ownerName:t.fromName,lockTrade:null});
      tx.update(tr,{status:"accepted"});
    });
    toast("Trade complete."); refreshCollection();
  }catch(e){ toast(e.message); }
}
const setStatus = (t,status) => writeBatch(db).update(doc(db,"trades",t.id),{status}).commit().catch(e=>toast(e.message));

function offerRow(t,incomingSide){
  const row=el("div","offer"), txt=el("div","txt");
  const give=el("b",""," "+(incomingSide?t.offerLabel:t.wantLabel)); give.style.setProperty("--c",{common:"#8da0c8",rare:"#3fb4ff",epic:"#b85cff",legendary:"#ffc531",mythic:"#ff5ad9"}[incomingSide?t.offerRarity:t.wantRarity]);
  txt.append(incomingSide?`${t.fromName} offers`:`You want`, give);
  const other=el("div","muted", incomingSide ? `for your ${t.wantLabel}` : `from ${t.toName} for your ${t.offerLabel}`);
  txt.append(other); row.append(txt);
  if(incomingSide){
    const a=el("button","","Accept"), d=el("button","","Decline");
    a.onclick=()=>acceptTrade(t); d.onclick=()=>setStatus(t,"declined"); row.append(a,d);
  }else{
    const c=el("button","","Cancel"); c.onclick=()=>setStatus(t,"cancelled"); row.append(c);
  }
  return row;
}
function renderTrades(){
  const fill=(box,list,inc)=>{const p=list.filter(t=>t.status==="pending");
    box.replaceChildren(...(p.length?p.map(t=>offerRow(t,inc)):[el("p","muted","Nothing pending.")]))};
  fill($("#incoming"),incoming,true); fill($("#outgoing"),outgoing,false);
}
function watchTrades(){
  const snap=(f,v,set)=>onSnapshot(query(collection(db,"trades"),where(f,"==",me.uid)),s=>{set(s.docs.map(d=>({id:d.id,...d.data()}))); renderTrades()});
  snap("toUid",0,v=>incoming=v); snap("fromUid",0,v=>outgoing=v);
}

/* ---------- shell ---------- */
function show(tab){
  document.querySelectorAll(".tab").forEach(s=>s.hidden=s.id!==tab);
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.tab===tab));
  if(tab==="collection") refreshCollection();
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>show(b.dataset.tab));
$("#signin").onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>toast(e.message));
$("#open").onclick=openPack; $("#find").onclick=findCollector; $("#send").onclick=sendTrade;

let unsubscribed=false;
onAuthStateChanged(auth, async u=>{
  me=u; const who=$("#who");
  $("#login").hidden=!!u; $("#nav").hidden=!u;
  if(!u){ document.querySelectorAll(".tab").forEach(s=>s.hidden=true); who.replaceChildren(); return; }
  await setDoc(doc(db,"users",u.uid),{name:u.displayName},{merge:true});
  const out=el("button","","Sign out"); out.onclick=()=>signOut(auth);
  who.replaceChildren(el("span","",u.displayName),out);
  if(!unsubscribed){watchTrades(); unsubscribed=true}
  cooldownTick(); show("collection");
  loadLevels().catch(()=>toast("Couldn't load level data. See README note on the API."));
});

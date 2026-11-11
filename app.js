import {GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {doc,getDoc,setDoc,collection,query,where,getDocs,runTransaction,writeBatch,onSnapshot,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {auth,db} from "./firebase.js";
import {TIERS,$,el,toast,ytId,label,cardEl,cardsOf,profileUrl} from "./shared.js";
 
const API = "https://146.59.93.5/demonlist/api/levels.php";
const PACK_SIZE = 3, COOLDOWN_MS = 60_000;
 
let me=null, myName="", levels=[], mine=[], found=null, incoming=[], outgoing=[];
 
/* ---------- levels ---------- */
async function loadLevels(){
  if(levels.length) return;
  let data;
  try{ data = await (await fetch(API)).json(); }
  catch(e){ data = await (await fetch("levels.json")).json(); }   // fallback: saved copy of the API response
  levels = data.filter(l=>l.id!=null && l.lvlname);
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
      rarity:t.id, serial, ownerUid:me.uid, ownerName:myName, lockTrade:null, created:serverTimestamp()};
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
async function refreshCollection(){
  mine = await cardsOf(me.uid);
  const g=$("#grid"); g.replaceChildren(...mine.map(cardEl));
  const uniq=new Set(mine.map(c=>c.levelId)).size;
  $("#stats").textContent = mine.length ? `${mine.length} cards · ${uniq} different levels` : "No cards yet. Open a pack to get started.";
  $("#offer").replaceChildren(...mine.map(c=>new Option(label(c),c.id)));
}
 
/* ---------- trading ---------- */
async function openCollector(uid,wantId){
  if(uid===me.uid) return toast("You can't trade with yourself.");
  const u=await getDoc(doc(db,"users",uid));
  if(!u.exists()) return toast("Collector not found.");
  const name=u.data().name, cards=await cardsOf(uid);
  if(!cards.length) return toast(name+" has no cards yet.");
  found={uid,name,cards};
  $("#who-name").value=name;
  $("#want").replaceChildren(...cards.map(c=>new Option(label(c),c.id)));
  if(wantId && cards.some(c=>c.id===wantId)) $("#want").value=wantId;
  $("#tradeForm").hidden=false;
}
async function findCollector(){
  const name=$("#who-name").value.trim(); if(!name) return;
  const s=await getDocs(query(collection(db,"users"),where("nameLower","==",name.toLowerCase())));
  const u=s.docs.find(d=>d.id!==me.uid);
  if(!u) return toast("No other collector with that name.");
  await openCollector(u.id);
}
async function sendTrade(){
  const offer=mine.find(c=>c.id===$("#offer").value), want=found?.cards.find(c=>c.id===$("#want").value);
  if(!offer||!want) return toast("Pick one card from each side.");
  const ref=doc(collection(db,"trades")), b=writeBatch(db);
  b.set(ref,{fromUid:me.uid,fromName:myName,toUid:found.uid,toName:found.name,
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
      tx.update(a,{ownerUid:me.uid,ownerName:myName,lockTrade:null});
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
 
/* ---------- usernames ---------- */
const NAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
// usernames/{lowercase name} -> {uid} reserves a name so no two collectors share one
async function claimName(name){
  const key=name.toLowerCase(), nref=doc(db,"usernames",key), uref=doc(db,"users",me.uid);
  await runTransaction(db, async tx=>{
    const [n,u]=await Promise.all([tx.get(nref),tx.get(uref)]);
    if(n.exists() && n.data().uid!==me.uid) throw Error("That name is taken.");
    const old=u.data()?.nameLower;
    if(old && old!==key) tx.delete(doc(db,"usernames",old));
    if(!n.exists()) tx.set(nref,{uid:me.uid});
    tx.set(uref,{name,nameLower:key},{merge:true});
  });
  myName=name;
}
async function ensureName(){
  const d=(await getDoc(doc(db,"users",me.uid))).data()||{};
  if(d.name && d.nameLower){ myName=d.name; return; }
  const base=(d.name||me.displayName||"collector").replace(/[^A-Za-z0-9_.-]/g,"_").slice(0,16).padEnd(3,"_");
  for(let i=0;i<8;i++){
    try{ await claimName(i?base+Math.floor(1000+Math.random()*9000):base); return; }
    catch(e){ if(e.message!=="That name is taken.") throw e; }
  }
  throw Error("Couldn't pick a default username.");
}
async function renameCards(){   // keep ownerName on existing cards in sync
  const s=await getDocs(query(collection(db,"cards"),where("ownerUid","==",me.uid)));
  for(let i=0;i<s.docs.length;i+=400){
    const b=writeBatch(db); s.docs.slice(i,i+400).forEach(d=>b.update(d.ref,{ownerName:myName})); await b.commit();
  }
}
function renderWho(){
  const out=el("button","","Sign out"), ren=el("button","","Change username");
  out.onclick=()=>signOut(auth);
  ren.onclick=()=>{$("#newName").value=myName; $("#nameErr").textContent=""; $("#nameDlg").showModal(); $("#newName").select()};
  const nm=el("a","",myName); nm.href=profileUrl(me.uid); nm.title="View your profile";
  $("#who").replaceChildren(nm,ren,out);
}
$("#cancelName").onclick=()=>$("#nameDlg").close();
$("#nameForm").onsubmit=async e=>{
  e.preventDefault();
  const name=$("#newName").value.trim(), err=$("#nameErr");
  if(!NAME_RE.test(name)) return err.textContent="Use 3–20 letters, numbers, _ . or -";
  if(name===myName) return $("#nameDlg").close();
  try{
    await claimName(name); await renameCards();
    renderWho(); refreshCollection(); $("#nameDlg").close(); toast("Username changed to "+name+".");
  }catch(ex){ err.textContent=ex.message; }
};
 
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
  try{ await ensureName(); }catch(e){ return toast(e.message); }
  renderWho();
  if(!unsubscribed){watchTrades(); unsubscribed=true}
  $("#myProfile").href=profileUrl(u.uid);
  cooldownTick();
  const p=new URLSearchParams(location.search), tu=p.get("trade");
  if(tu){ await refreshCollection(); show("trades"); await openCollector(tu,p.get("want")); history.replaceState(null,"",location.pathname); }
  else show("collection");
  loadLevels().catch(()=>toast("Couldn't load level data. See README note on the API."));
});
 

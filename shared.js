import {GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {auth} from "./firebase.js";
import {API_URL,LEVELS_URL} from "./config.js";

/* Rarity tiers, best first (caps and odds are enforced in schema.sql). */
export const TIERS = [
  {id:"mythic",    name:"Mythic",    cap:1,        color:"#ff5ad9"},
  {id:"legendary", name:"Legendary", cap:5,        color:"#ffc531"},
  {id:"epic",      name:"Epic",      cap:20,       color:"#b85cff"},
  {id:"rare",      name:"Rare",      cap:60,       color:"#3fb4ff"},
  {id:"common",    name:"Common",    cap:Infinity, color:"#8da0c8"}
];
export const T = Object.fromEntries(TIERS.map((t,i)=>[t.id,{...t,rank:i}]));

export const $ = s => document.querySelector(s);
export const el = (tag,cls,text) => {const e=document.createElement(tag); if(cls)e.className=cls; if(text!=null)e.textContent=text; return e};
export const toast = msg => {const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast.id); toast.id=setTimeout(()=>t.classList.remove("show"),3500)};
export const serialText = c => T[c.rarity].cap===Infinity ? `#${c.serial}` : `#${c.serial} / ${T[c.rarity].cap}`;
export const label = c => `${c.lvlname} · ${T[c.rarity].name} ${serialText(c)}`;
export const profileUrl = id => `profile.html?u=${encodeURIComponent(id)}`;
export const signIn = () => signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>toast(e.message));

/* Every data call goes through the Edge Function, which checks the Firebase ID token. */
export async function api(action,args={}){
  const token = await auth.currentUser.getIdToken();
  const r = await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({action,...args})});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||"Request failed");
  return j;
}

export function cardEl(c){
  const d = el("div","card r-"+c.rarity), th = el("div","thumb");
  if(c.yt){const i=el("img"); i.alt=""; i.loading="lazy"; i.src=`https://i.ytimg.com/vi/${c.yt}/hqdefault.jpg`; th.append(i)}
  const foot = el("div","foot"); foot.append(el("span","rar",T[c.rarity].name), el("span","",serialText(c)));
  d.append(el("div","shine"), th, el("h3","",c.lvlname), el("p","by","by "+c.creator), foot);
  return d;
}

export const sortCards = a => a.sort((x,y)=>T[x.rarity].rank-T[y.rarity].rank || x.lvlname.localeCompare(y.lvlname) || x.serial-y.serial);
export async function cardsOf(ownerId){ return sortCards(await api("cards",{owner:ownerId})); }

/* ---------- header: one list of buttons, rendered the same on every page ---------- */
/* {tab} = a tab on index.html, {href} = a page, {mine} = the signed-in user's profile. Add new header buttons here. */
export const NAV = [
  {tab:"collection",text:"Collection"},
  {tab:"packs",text:"Open packs"},
  {tab:"trades",text:"Trades"},
  {href:"users.html",text:"Players"},
  {href:"catalog.html",text:"Catalog"},
  {mine:true,text:"My profile"}
];
/* On index.html pass onTab to switch tabs in place; everywhere else the tab buttons link to index.html#tab. */
export function renderNav(me,onTab){
  const here = location.pathname.split("/").pop() || "index.html";
  $("#nav").replaceChildren(...NAV.map(n=>{
    if(n.tab){
      if(onTab){ const b=el("button","",n.text); b.dataset.tab=n.tab; b.onclick=()=>onTab(n.tab); return b; }
      const a=el("a","btn",n.text); a.href=`index.html#${n.tab}`; return a;
    }
    const href = n.mine ? profileUrl(me.id) : n.href, a = el("a","btn",n.text); a.href = href;
    const ownProfile = n.mine && new URLSearchParams(location.search).get("u")===me.id;
    if(here===href.split("?")[0] && (!n.mine || ownProfile)) a.classList.add("on");
    return a;
  }));
}

/* Username link, Change username and Sign out; the rename dialog is created on demand so every page has it. */
const NAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
let whoMe = null;
function ensureNameDialog(){
  if($("#nameDlg")) return;
  const d = el("dialog"); d.id = "nameDlg";
  d.innerHTML = `<form id="nameForm"><h2>Change username</h2><p class="muted">3–20 characters: letters, numbers, _ . -</p>
    <input id="newName" maxlength="20" autocomplete="off" aria-label="New username"><p id="nameErr" class="err" role="alert"></p>
    <div class="row"><button type="submit" class="big">Save name</button><button type="button" id="cancelName">Cancel</button></div></form>`;
  document.body.append(d);
  $("#cancelName").onclick = () => d.close();
  $("#nameForm").onsubmit = async e=>{
    e.preventDefault();
    const name=$("#newName").value.trim(), err=$("#nameErr");
    if(!NAME_RE.test(name)) return err.textContent="Use 3–20 letters, numbers, _ . or -";
    if(name===whoMe.name) return d.close();
    try{ await api("rename",{name}); whoMe.name=name; renderWho(whoMe); d.close(); toast("Username changed to "+name+"."); }
    catch(ex){ err.textContent=ex.message; }
  };
}
export function renderWho(me){
  whoMe = me; ensureNameDialog();
  const nm=el("a","",me.name), ren=el("button","","Change username"), out=el("button","","Sign out");
  nm.href=profileUrl(me.id); nm.title="View your profile";
  ren.onclick=()=>{ $("#newName").value=me.name; $("#nameErr").textContent=""; $("#nameDlg").showModal(); $("#newName").select(); };
  out.onclick=()=>signOut(auth);
  $("#who").replaceChildren(nm,ren,out);
}

/* For profile.html, users.html and catalog.html: needs #login, #signin, #content, #nav, #who. cb receives the signed-in profile {id,name}. */
export function onUser(cb){
  $("#signin").onclick = signIn;
  onAuthStateChanged(auth, async u=>{
    $("#login").hidden = !!u; $("#content").hidden = !u;
    if(!u){ $("#nav").replaceChildren(); $("#who").replaceChildren(); return; }
    try{
      const me = await api("claim");
      renderNav(me); renderWho(me);
      await cb(me);
    }catch(e){ console.error(e); toast(e.message); }
  });
}

/* ---------- collection progress ---------- */
let listP=null;
/* The full demon list (fetched once per page). Resolves to [] if it can't be loaded. */
export function levelList(){
  return listP ||= fetch(LEVELS_URL).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(l=>Array.isArray(l)?l:[]).catch(e=>{ console.error("Demon list fetch failed:",e); return []; });
}
/* Size of the full demon list; 0 if unavailable. */
export const totalLevels = () => levelList().then(l=>l.length);
/* Progress bar: unique levels owned out of the whole list. Returns null if the total is unknown. */
export function progressEl(owned,total){
  if(!total) return null;
  const pct=Math.min(100,owned/total*100), box=el("div","progress");
  const bar=el("div","bar"); bar.style.width=pct+"%";
  const track=el("div","track"); track.setAttribute("role","progressbar");
  track.setAttribute("aria-valuemin","0"); track.setAttribute("aria-valuemax",String(total)); track.setAttribute("aria-valuenow",String(owned));
  track.append(bar);
  const pctText=pct>0&&pct<1?"<1":pct.toFixed(pct<10?1:0).replace(/\.0$/,"");
  box.append(track, el("span","ptext",`${owned} / ${total} levels collected (${pctText}%)`));
  return box;
}
/* Fills `host` with the bar for `cards`; leaves it empty if the list is unavailable. */
export async function showProgress(host,cards){
  const total=await totalLevels(), p=progressEl(new Set(cards.map(c=>c.level_id)).size,total);
  host.replaceChildren(...(p?[p]:[]));
}

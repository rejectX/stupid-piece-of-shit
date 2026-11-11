import {GoogleAuthProvider,signInWithPopup,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
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

/* For profile.html and users.html: needs #login, #signin, #content, #nav. cb receives the signed-in profile {id,name}. */
export function onUser(cb){
  $("#signin").onclick = signIn;
  onAuthStateChanged(auth, async u=>{
    $("#login").hidden = !!u; $("#content").hidden = !u;
    if(!u){ $("#nav").replaceChildren(); return; }
    try{
      const me = await api("claim");
      const link=(href,text)=>{const a=el("a","btn",text); a.href=href; return a};
      $("#nav").replaceChildren(link("index.html","Collection"),link("users.html","Players"),link(profileUrl(me.id),"My profile"));
      await cb(me);
    }catch(e){ console.error(e); toast(e.message); }
  });
}

/* ---------- collection progress ---------- */
let totalP=null;
/* Size of the full demon list (fetched once per page). Resolves to 0 if the list can't be loaded. */
export function totalLevels(){
  return totalP ||= fetch(LEVELS_URL).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(l=>Array.isArray(l)?l.length:0).catch(e=>{ console.error("Demon list fetch failed:",e); return 0; });
}
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

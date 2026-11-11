import {GoogleAuthProvider,signInWithPopup,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {collection,query,where,getDocs} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {auth,db} from "./firebase.js";

/* Rarity tiers, best first. cap = max copies per level, weight = pack roll chance. */
export const TIERS = [
  {id:"mythic",    name:"Mythic",    cap:1,        weight:1,  color:"#ff5ad9"},
  {id:"legendary", name:"Legendary", cap:5,        weight:4,  color:"#ffc531"},
  {id:"epic",      name:"Epic",      cap:20,       weight:10, color:"#b85cff"},
  {id:"rare",      name:"Rare",      cap:60,       weight:25, color:"#3fb4ff"},
  {id:"common",    name:"Common",    cap:Infinity, weight:60, color:"#8da0c8"}
];
export const T = Object.fromEntries(TIERS.map((t,i)=>[t.id,{...t,rank:i}]));

export const $ = s => document.querySelector(s);
export const el = (tag,cls,text) => {const e=document.createElement(tag); if(cls)e.className=cls; if(text!=null)e.textContent=text; return e};
export const toast = msg => {const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast.id); toast.id=setTimeout(()=>t.classList.remove("show"),3500)};
export const ytId = u => (u||"").split("/embed/")[1]?.split(/[?&#]/)[0] || null;
export const serialText = c => T[c.rarity].cap===Infinity ? `#${c.serial}` : `#${c.serial} / ${T[c.rarity].cap}`;
export const label = c => `${c.lvlname} · ${T[c.rarity].name} ${serialText(c)}`;
export const profileUrl = uid => `profile.html?u=${encodeURIComponent(uid)}`;

export function cardEl(c){
  const d = el("div","card r-"+c.rarity), th = el("div","thumb");
  if(c.yt){const i=el("img"); i.alt=""; i.loading="lazy"; i.src=`https://i.ytimg.com/vi/${c.yt}/hqdefault.jpg`; th.append(i)}
  const foot = el("div","foot"); foot.append(el("span","rar",T[c.rarity].name), el("span","",serialText(c)));
  d.append(el("div","shine"), th, el("h3","",c.lvlname), el("p","by","by "+c.creator), foot);
  return d;
}

export const sortCards = a => a.sort((x,y)=>T[x.rarity].rank-T[y.rarity].rank || x.lvlname.localeCompare(y.lvlname) || x.serial-y.serial);
export async function cardsOf(uid){
  const s = await getDocs(query(collection(db,"cards"),where("ownerUid","==",uid)));
  return sortCards(s.docs.map(d=>({id:d.id,...d.data()})));
}

/* For the profile and players pages: needs #login, #signin, #content, #nav in the page. */
export function onUser(cb){
  $("#signin").onclick = () => signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>toast(e.message));
  onAuthStateChanged(auth, u=>{
    $("#login").hidden = !!u; $("#content").hidden = !u;
    if(!u){ $("#nav").replaceChildren(); return; }
    const link=(href,text)=>{const a=el("a","btn",text); a.href=href; return a};
    $("#nav").replaceChildren(link("index.html","Collection"),link("users.html","Players"),link(profileUrl(u.uid),"My profile"));
    cb(u).catch(e=>{console.error(e); toast(e.message)});
  });
}

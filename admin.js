import {TIERS,T,$,el,toast,onUser,api,levelList,isAdmin} from "./shared.js";

let players = [], levels = [], levelById = new Map(), nameById = new Map();
let player = null, level = null;                       // current selections
const MAX_RESULTS = 40;

/* ---------- pickers ---------- */
function fillResults(box,items,selected,onPick,text,empty){
  const rows = items.slice(0,MAX_RESULTS).map(x=>{
    const b = el("button","",text(x)); b.type = "button";
    if(selected && selected===x) b.classList.add("sel");
    b.onclick = () => onPick(x); return b;
  });
  if(items.length>MAX_RESULTS) rows.push(el("p","muted",`+ ${items.length-MAX_RESULTS} more, keep typing to narrow it down`));
  box.replaceChildren(...(rows.length ? rows : [el("p","muted",empty)]));
}
function renderPlayers(){
  const q = $("#playerFilter").value.trim().toLowerCase();
  fillResults($("#playerResults"), players.filter(p=>p.name.toLowerCase().includes(q)), player,
    p=>{ player=p; renderPlayers(); updateSummary(); }, p=>p.name, "No players match.");
}
function renderLevels(){
  const q = $("#levelFilter").value.trim().toLowerCase();
  fillResults($("#levelResults"), levels.filter(l=>l.lvlname.toLowerCase().includes(q)), level,
    l=>{ level=l; renderLevels(); updateSummary(); }, l=>`${l.position!=null ? "#"+l.position+" · " : ""}${l.lvlname}`,
    levels.length ? "No levels match." : "The demon list couldn't be loaded.");
}
function updateSummary(){
  const r = $("#rarity").value, rname = r ? T[r].name : "random rarity";
  $("#summary").replaceChildren(...(player && level
    ? [document.createTextNode("Next pack for "), el("b","",player.name), document.createTextNode(" will contain "), el("b","",level.lvlname), document.createTextNode(` (${rname}).`)]
    : [document.createTextNode("Pick a player and a level.")]));
  $("#add").disabled = !(player && level);
}

/* ---------- guarantees list ---------- */
const when = s => s ? new Date(s).toLocaleString() : "";
function row(g){
  const lv = levelById.get(String(g.level_id)), r = el("div","offer"+(g.used_at?" done":"")), txt = el("div","txt");
  const who = nameById.get(g.user_id) || g.user_id;
  txt.append(el("b","",who), document.createTextNode(" → "), document.createTextNode(lv ? lv.lvlname : `level ${g.level_id}`));
  if(g.rarity){ const t = el("span","tag",T[g.rarity]?.name||g.rarity); t.style.setProperty("--c",T[g.rarity]?.color||"#8da0c8"); txt.append(document.createTextNode(" "),t); }
  const got = g.card ? ` as ${T[g.card.rarity]?.name||g.card.rarity} #${g.card.serial}` : "";   // may differ from the requested rarity if it sold out
  txt.append(el("div","muted", g.used_at ? `Delivered ${when(g.used_at)}${got}` : `Added ${when(g.created_at)}`));
  r.append(txt);
  if(!g.used_at){
    const b = el("button","","Remove");
    b.onclick = async()=>{ b.disabled = true; try{ await api("admin_remove_guarantee",{id:g.id}); toast("Removed."); }catch(e){ toast(e.message); } load(); };
    r.append(b);
  }
  return r;
}
async function load(){
  let list; try{ list = await api("admin_guarantees"); }catch(e){ return toast(e.message); }
  const pend = list.filter(g=>!g.used_at).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const done = list.filter(g=>g.used_at).sort((a,b)=>new Date(b.used_at)-new Date(a.used_at)).slice(0,20);
  const fill = (box,items,empty)=>box.replaceChildren(...(items.length ? items.map(row) : [el("p","muted",empty)]));
  fill($("#pending"),pend,"Nothing queued."); fill($("#done"),done,"Nothing delivered yet.");
}
async function add(){
  $("#add").disabled = true;
  try{
    await api("admin_add_guarantee",{user:player.id, level_id:level.id, rarity:$("#rarity").value || null});
    toast(`Guaranteed ${level.lvlname} for ${player.name}.`);
  }catch(e){ toast(e.message); }
  updateSummary(); load();
}

onUser(async me=>{
  if(!isAdmin(me)){ $("#content").replaceChildren(el("h2","","Not authorised.")); return; }
  [players, levels] = await Promise.all([api("profiles"), levelList()]);
  players.sort((a,b)=>a.name.localeCompare(b.name));
  nameById = new Map(players.map(p=>[p.id,p.name]));
  levelById = new Map(levels.map(l=>[String(l.id),l]));
  $("#rarity").replaceChildren(new Option("Random (whatever the roll gives)",""), ...TIERS.map(t=>new Option(t.name,t.id)));
  $("#rarity").onchange = updateSummary;
  $("#playerFilter").oninput = renderPlayers; $("#levelFilter").oninput = renderLevels; $("#add").onclick = add;
  renderPlayers(); renderLevels(); updateSummary(); load();
});

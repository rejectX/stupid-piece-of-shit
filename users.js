import {$,el,profileUrl,onUser,api} from "./shared.js";

let all = [], myId = null;

function render(){
  const q = $("#userFilter").value.trim().toLowerCase();
  const rows = all.filter(u=>u.name.toLowerCase().includes(q)).map(u=>{
    const row = el("div","offer"), txt = el("div","txt"), name = el("a","",u.name);
    name.href = profileUrl(u.id); txt.append(name);
    if(u.id===myId) txt.append(el("span","muted"," (you)"));
    const view = el("a","btn","View profile"); view.href = profileUrl(u.id);
    row.append(txt,view);
    if(u.id!==myId){ const tr = el("a","btn","Trade"); tr.href = `index.html?trade=${encodeURIComponent(u.id)}`; row.append(tr); }
    return row;
  });
  $("#list").replaceChildren(...(rows.length ? rows : [el("p","muted","No players match that name.")]));
}

onUser(async me=>{
  myId = me.id;
  all = await api("profiles");
  $("#userFilter").oninput = render;
  render();
});

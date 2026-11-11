import {collection,getDocs} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {db} from "./firebase.js";
import {$,el,profileUrl,onUser} from "./shared.js";

let all = [], myUid = null;

function render(){
  const q = $("#userFilter").value.trim().toLowerCase();
  const rows = all.filter(u=>u.name.toLowerCase().includes(q)).map(u=>{
    const row = el("div","offer"), txt = el("div","txt"), name = el("a","",u.name);
    name.href = profileUrl(u.uid); txt.append(name);
    if(u.uid===myUid) txt.append(el("span","muted"," (you)"));
    const view = el("a","btn","View profile"); view.href = profileUrl(u.uid);
    row.append(txt,view);
    if(u.uid!==myUid){ const tr = el("a","btn","Trade"); tr.href = `index.html?trade=${encodeURIComponent(u.uid)}`; row.append(tr); }
    return row;
  });
  $("#list").replaceChildren(...(rows.length ? rows : [el("p","muted","No players match that name.")]));
}

onUser(async me=>{
  myUid = me.uid;
  const s = await getDocs(collection(db,"users"));
  all = s.docs.map(d=>({uid:d.id,name:d.data().name})).filter(u=>u.name)
    .sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  $("#userFilter").oninput = render;
  render();
});

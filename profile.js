import {TIERS,$,el,cardEl,cardsOf,onUser,api} from "./shared.js";

const uid = new URLSearchParams(location.search).get("u");

onUser(async me=>{
  const name$ = $("#pname");
  const u = uid ? await api("profile",{id:uid}) : null;
  if(!u){ name$.textContent = uid ? "Collector not found." : "No collector selected."; return; }
  const own = uid===me.id;
  document.title = `${u.name} – Demon Deck`;
  name$.textContent = own ? `${u.name} (you)` : u.name;

  const cards = await cardsOf(uid);
  const uniq = new Set(cards.map(c=>c.level_id)).size;
  $("#pstats").textContent = cards.length ? `${cards.length} cards · ${uniq} different levels` : "No cards yet.";

  $("#chips").replaceChildren(...TIERS.map(t=>{
    const chip = el("span","chip",`${t.name} ${cards.filter(c=>c.rarity===t.id).length}`);
    chip.style.setProperty("--c",t.color); return chip;
  }));

  $("#grid").replaceChildren(...cards.map(c=>{
    if(own) return cardEl(c);
    const a = el("a","cardlink");                      // click a card to start a trade for it
    a.href = `index.html?trade=${encodeURIComponent(uid)}&want=${encodeURIComponent(c.id)}`;
    a.title = "Trade for this card"; a.append(cardEl(c)); return a;
  }));

  const t = $("#tradeBtn");
  if(!own && cards.length){ t.href = `index.html?trade=${encodeURIComponent(uid)}`; t.hidden = false; }
});

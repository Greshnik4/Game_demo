"use strict";
/* ============================== КВЕСТЫ ============================== */
let gold = +(localStorage.getItem("veront_gold")||0);
let quests = {};
try{ quests = JSON.parse(localStorage.getItem("veront_quests"))||{} }catch(e){ quests = {} }
NPCS.forEach(n => { n.quest = quests[n.id] || null; });
function saveQuests(){
  saveJSON("veront_quests", quests);
  localStorage.setItem("veront_gold", String(gold));
}
function applyQuest(n, q){
  if(!q || typeof q!=="object") return;
  if(q.state==="offer" && (!n.quest || n.quest.status!=="active")){
    n.quest = quests[n.id] = {
      title:String(q.title||"Задание").slice(0,60),
      goal:String(q.goal||"").slice(0,200),
      reward:Math.max(0, Math.min(200, q.reward|0)),
      status:"active",
    };
    toast("📜 Новый квест от " + n.name + ": «" + n.quest.title + "»");
    bumpTick(2);
    saveQuests(); renderJournal();
  } else if(q.state==="complete" && n.quest && n.quest.status==="active"){
    n.quest.status = "done"; gold += n.quest.reward;
    toast("✅ Квест выполнен: «" + n.quest.title + "»  +" + n.quest.reward + " 💰");
    bumpTick(5);
    saveQuests(); renderJournal(); updateGold();
  } else if(q.state==="abandon" && n.quest){
    n.quest = null; delete quests[n.id];
    bumpTick(1);
    saveQuests(); renderJournal();
  }
}
function updateGold(){ el("hudGold").textContent = "💰 " + gold; }
function esc(s){ const d = document.createElement("div"); d.textContent = String(s||""); return d.innerHTML; }
function renderJournal(){
  const list = el("journalList"); list.innerHTML = "";
  const items = NPCS.filter(n=>n.quest);
  if(!items.length){ list.innerHTML = "<div class='qgoal'>Пока нет заданий. Поговори с жителями.</div>"; return; }
  for(const n of items){
    const d = document.createElement("div"); d.className = "qcard " + n.quest.status;
    d.innerHTML = "<h4>" + esc(n.quest.title) + "</h4>" +
      "<div class='qgoal'>" + esc(n.name) + ": " + esc(n.quest.goal) + "</div>" +
      "<div class='qst " + n.quest.status + "'>" +
      (n.quest.status==="done" ? "✔ выполнен" : "● активен") + " · награда " + n.quest.reward + " 💰</div>";
    list.appendChild(d);
  }
}
function toggleJournal(){ el("journal").classList.toggle("hidden"); renderJournal(); }

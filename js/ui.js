"use strict";
/* ============================== ВВОД И UI ============================== */
const el = id => document.getElementById(id);
const keys = new Set();
const keyOrder = []; // порядок нажатия: движение берёт последнюю удерживаемую клавишу
let chatOpen=false, chatNPC=null;

addEventListener("keydown", e => {
  if(e.key==="Escape") closeCtxMenu();
  if(e.key==="Escape" && !el("invWin").classList.contains("hidden")){ closeInvWin(); return; }
  if(chatOpen){
    if(e.key==="Escape") closeChat();
    return;
  }
  const c = e.code; // физические клавиши — работают при любой раскладке
  if(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(c)) e.preventDefault();
  keys.add(c);
  const at = keyOrder.indexOf(c); if(at>=0) keyOrder.splice(at,1);
  keyOrder.push(c);
  if(c==="KeyE"){ const n = nearNPC(); if(n) openChat(n); }
  if(c==="KeyJ"){ toggleJournal(); }
});
addEventListener("keyup", e => { keys.delete(e.code);
  const at = keyOrder.indexOf(e.code); if(at>=0) keyOrder.splice(at,1); });

// подсказки по объектам — из справочника типов (js/data/objects.js)
const OBJ_TIPS = Object.assign({}, GROUND_TIP);
for(const t in OBJ_DEF) if(OBJ_DEF[t].tip) OBJ_TIPS[t] = OBJ_DEF[t].tip;
cv.addEventListener("pointerdown", e => {
  closeCtxMenu();
  const wx = (e.clientX + cam.x)/TILE, wy = (e.clientY + cam.y)/TILE;
  let hit = null;
  for(const n of NPCS) if(Math.hypot(n.x-wx, n.y-wy) < 1.6){ hit = n; break; }
  if(chatOpen){
    if(hit && hit !== chatNPC) openChat(hit);
    else if(hit === chatNPC) return; // клик по собеседнику — чат остаётся
    else closeChat(); // клик вне персонажа — скрываем чат и идём к точке клика
  }
  if(hit){ player.targetNPC = hit; player.target = null; player.path = null; }
  else {
    const ftx = Math.floor(wx), fty = Math.floor(wy);
    // клик по мебели с содержимым: рядом — открыть окно, издалека — подойти и открыть
    const fkey = storageKeyAt(ftx, fty);
    if(fkey){
      const [fx,fy] = fkey.split(",").map(Number);
      if(Math.hypot(player.x-(fx+1), player.y-(fy+1)) < 3.6){
        if(tryFurn(fkey)) openInvWin({kind:"furn", ref:fkey});
      } else {
        const best = nearestWalkableCenter(fx, fy);
        if(best){
          player.pendingFurn = fkey;
          player.target = best; player.targetNPC = null;
          player.path = findPath(player.x, player.y, best.x, best.y);
        } else toast("📦 Не подойти — вокруг препятствия");
      }
      return;
    }
    // предмет на земле: рядом — меню «Забрать», издалека — подойти и открыть меню
    const g = groundAt(ftx, fty);
    if(g){
      if(Math.hypot(player.x-(g.x+1), player.y-(g.y+1)) < 3.6){
        openGroundMenu(ftx, fty);
      } else {
        const best = nearestWalkableCenter(g.x, g.y);
        if(best){
          player.pendingPick = g.x + "," + g.y;
          player.target = best; player.targetNPC = null;
          player.path = findPath(player.x, player.y, best.x, best.y);
        } else toast("📦 Не подойти — вокруг препятствия");
      }
      return;
    }
    // запертая дверь: подойти и попытаться отпереть (открытая — проходима, анимация сама)
    const dkey = doorKeyAt(ftx, fty);
    if(dkey && doorLocked(ftx, fty)){
      const [dx,dy] = dkey.split(",").map(Number);
      if(Math.hypot(player.x-(dx+1), player.y-(dy+1)) < 3.6){ tryDoor(dkey); return; }
      const best = nearestWalkableCenter(dx, dy);
      if(best){
        player.pendingDoor = dkey;
        player.target = best; player.targetNPC = null;
        player.path = findPath(player.x, player.y, best.x, best.y);
      }
      return;
    }
    // объект без инвентаря — показываем подсказку о нём
    const t = tileAt(ftx, fty);
    if(!walkable(wx, wy) && OBJ_TIPS[t]){ showTip(e, OBJ_TIPS[t], 2500); return; }
    if(walkable(wx, wy)){
      player.target = {x:wx, y:wy}; player.targetNPC = null;
      player.path = findPath(player.x, player.y, wx, wy);
    }
  }
});

/* ---- тосты ---- */
let toastT = 0;
function toast(text){
  const t = el("toast"); t.textContent = text; t.classList.remove("hidden");
  clearTimeout(toastT); toastT = setTimeout(()=>t.classList.add("hidden"), 5000);
}

/* ---- контекстное меню предмета: купить/продать/выбросить/взять/забрать ---- */
function openCtxMenu(x, y, items, tipText){
  const m = el("ctxMenu"); m.innerHTML = "";
  for(const it of items){
    const b = document.createElement("button");
    b.textContent = it.label;
    b.onclick = ev => { ev.stopPropagation(); closeCtxMenu(); it.fn(); };
    m.appendChild(b);
  }
  m.classList.remove("hidden");
  const w = m.offsetWidth || 170, h = m.offsetHeight || items.length*34;
  const mx = Math.max(4, Math.min(x, innerWidth - w - 8));
  const my = Math.max(4, Math.min(y, innerHeight - h - 8));
  m.style.left = mx + "px"; m.style.top = my + "px";
  if(tipText){
    // подсказка — вплотную под меню, по его левому краю; если не влезает — так же сверху от меню
    showTip(null, tipText, 0, {x:mx, y:my + h, alt: th => Math.max(4, my - th - 4)});
  }
}
function closeCtxMenu(){ const m = el("ctxMenu"); if(m) m.classList.add("hidden"); }
// меню предмета, лежащего на земле
function openGroundMenu(x, y){
  const g = groundAt(x,y); if(!g) return;
  openCtxMenu(g.x*TILE - cam.x + TILE, g.y*TILE - cam.y,
    [{label:"Забрать", fn:()=>{
      const it = pickUpGround(x,y);
      if(it) toast(it.i + " Подобрано: " + it.n);
    }}],
    ITEMS[g.id].i + " " + ITEMS[g.id].n + "\n" + (ITEMS[g.id].d||""));
}
// попытка открыть запертую дверь (нужен ключ)
function tryDoor(k){
  const [x,y] = k.split(",").map(Number);
  if(!doorLocked(x,y)) return;
  if(invHas(player.inv, "key")){
    setDoorLocked(x,y,false);
    toast("🔑 Замок щёлкнул — дверь открыта");
  } else toast("🚪 Заперто. Нужен ключ");
}
// выбросить предмет из инвентаря перед собой
function doDrop(id){
  const r = dropItem(id);
  if(r && r.ok){ toast(ITEMS[id].i + " Брошено: " + ITEMS[id].n); refreshInvWin(); }
  else if(r && r.none) toast("📦 Некуда бросить — рядом нет свободного места");
  else if(!r) toast("Нет такого предмета");
}

/* ---- чат ---- */
const chatEl = el("chat"), logEl = el("chatLog"), typingEl = el("chatTyping");

function openChat(n){
  chatNPC = n; chatOpen = true;
  chatEl.classList.remove("hidden");
  el("chatName").textContent = n.name + " " + n.mood;
  el("chatRole").textContent = "— " + n.role;
  updateChatInv(n);
  logEl.innerHTML = "";
  if(!n.history.length) addMsg("sys", n.name + " смотрит на тебя.");
  else for(const m of n.history) addMsg(m.role, m.text);
  el("chatInput").focus();
  scrollLog();
}
function closeChat(){ chatOpen=false; chatNPC=null; chatEl.classList.add("hidden"); }
function updateChatInv(n){
  const e = el("chatInv"); if(!e) return;
  e.textContent = "При себе: " + (invListOpen(n).join(", ") || "ничего");
}

/* ---- окно инвентаря: игрок + собеседник/мебель, перенос кликом ---- */
let invTarget = null;
function getInvTarget(){ return invTarget; }
/* всплывающая подсказка о предмете под курсором */
let tipT = 0;
function showTip(e, text, ttl, pos){
  const t = el("itemTip"); if(!t) return;
  t.textContent = text; t.classList.remove("hidden");
  const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  let x, y;
  if(pos){ // явная позиция (меню): ровно по заданной точке, при нехватке места — alt(h)
    x = pos.x; y = pos.y;
    if(y + h > innerHeight - 8) y = typeof pos.alt === "function" ? pos.alt(h) : Math.max(8, innerHeight - h - 8);
    if(x + w > innerWidth - 8) x = Math.max(4, innerWidth - w - 8);
  } else {
    x = e.clientX + pad; y = e.clientY + pad;
    if(x + w > innerWidth - 8) x = e.clientX - w - pad;
    if(y + h > innerHeight - 8) y = e.clientY - h - pad;
  }
  t.style.left = x + "px"; t.style.top = y + "px";
  clearTimeout(tipT);
  if(ttl) tipT = setTimeout(hideTip, ttl); // подсказки по клику сами гаснут
}
function hideTip(){ el("itemTip").classList.add("hidden"); }
function furnLabel(k){
  const [x,y] = k.split(",").map(Number);
  const t = upperAt(x,y);
  return t==="c" ? "Сундук" : t==="B" ? "Шкаф" : "Хранилище";
}
// тултип предмета игрока: название, описание, цена продажи
function itemTipText(id){
  return ITEMS[id].i + " " + ITEMS[id].n + "\n" + (ITEMS[id].d||"") + "\nПродажа: " + sellPrice(id) + " 💰";
}
// общее меню предмета игрока: Продать/Подарить (если есть собеседник) + Выбросить
function playerItemMenu(n, id){
  const items = [];
  if(n) items.push({label:"Продать за " + sellPrice(id) + " 💰", fn:()=>{
    const rr = sellToNpc(n, id);
    if(rr && rr.ok){ toast("💰 Продано: " + itemLabel(id) + " за " + rr.price); refreshInvWin(); }
    else toast(n.name + " не покупает это.");
  }});
  if(n) items.push({label:"Подарить " + n.name, fn:()=>{
    const it = takeItemById(n, id);
    if(it){ toast(it.i + " Подарено " + n.name + ": " + it.n); refreshInvWin(); }
  }});
  items.push({label:"Выбросить", fn:()=>doDrop(id)});
  return items;
}
function refreshInvWin(){ if(!el("invWin").classList.contains("hidden")) renderInvWin(); }
function openInvWin(target){
  hideTip();
  invTarget = target || invTarget;
  el("invWin").classList.remove("hidden");
  renderInvWin();
}
function closeInvWin(){ hideTip(); invTarget = null; el("invWin").classList.add("hidden"); }
function invTile(col, id, count, menu, price, tag){
  const d = document.createElement("div");
  d.className = "itile";
  d.innerHTML = "<span class='em'>" + ITEMS[id].i + "</span>" +
    "<span class='nm'>" + esc(ITEMS[id].n) + "</span>" +
    (count>1 ? "<span class='ct'>×" + count + "</span>" : "") +
    (price!=null ? "<span class='pr'>💰" + price + "</span>" : "");
  const tip = ITEMS[id].i + " " + ITEMS[id].n + "\n" + (ITEMS[id].d||"") +
    (price!=null ? "\n" + tag + ": " + price + " 💰" : "");
  d.onclick = () => {
    if(!menu || !menu.length) return;
    const r = d.getBoundingClientRect();
    openCtxMenu(r.right + 6, r.top, menu, tip);
  };
  d.onmouseenter = e => showTip(e, tip);
  d.onmouseleave = hideTip;
  col.appendChild(d);
}
function renderInvWin(){
  hideTip(); // плитки пересоздаются — старый тултип иначе залипает
  const me = el("invMe"), other = el("invOther");
  me.innerHTML = ""; other.innerHTML = "";
  el("invGold").textContent = "💰 " + gold;
  for(const id in player.inv) if(player.inv[id]>0 && ITEMS[id]){
    const drop = {label:"Выбросить", fn:()=>doDrop(id)};
    if(invTarget && invTarget.kind==="npc"){
      invTile(me, id, player.inv[id], playerItemMenu(invTarget.ref, id), sellPrice(id), "Продажа");
    } else if(invTarget && invTarget.kind==="furn"){
      invTile(me, id, player.inv[id], [
        {label:"Положить в «" + furnLabel(invTarget.ref) + "»", fn:()=>{
          const it = putInFurn(invTarget.ref, id);
          if(it){ toast(it.i + " Убрано: " + it.n); renderInvWin(); }
        }}, drop]);
    } else {
      invTile(me, id, player.inv[id], [drop]);
    }
  }
  if(!me.children.length){ const s=document.createElement("div"); s.className="qgoal"; s.textContent="Пусто"; me.appendChild(s); }
  if(!invTarget){
    // своего собеседника нет — показываем характеристики персонажа
    el("invOtherName").textContent = "Характеристики";
    const s = player.stats;
    let cnt = 0; for(const id in player.inv) cnt += player.inv[id];
    const row = (l,v)=>"<div class='statrow'><span>"+l+"</span><b>"+v+"</b></div>";
    other.innerHTML = "<div class='statsBox'>" + row("❤️ Здоровье", s.hp+"/"+s.hpMax) + row("⚒️ Сила", s.str) +
      row("🏃 Ловкость", s.agi) + row("🗣️ Харизма", s.cha) +
      row("🎒 Предметов", cnt) + row("💰 Золото", gold) + "</div>";
    return;
  }
  if(invTarget.kind==="npc"){
    const n = invTarget.ref;
    el("invOtherName").textContent = n.name + ", " + n.role;
    for(const id in n.inv) if(invHas(n.inv,id) && !isHidden(n,id))
      invTile(other, id, n.inv[id], [
        {label:"Купить за " + ITEMS[id].p + " 💰", fn:()=>{
          const r = buyFromNpc(n, id);
          if(r && r.ok){ toast("💰 Куплено: " + itemLabel(id) + " за " + r.price); renderInvWin(); }
          else if(r && r.need) toast("💰 Мало золота: нужно " + r.need);
          else toast(n.name + " не продаёт это.");
        }}], ITEMS[id].p, "Покупка");
  } else {
    const c = furnContents(invTarget.ref);
    el("invOtherName").textContent = furnLabel(invTarget.ref);
    if(c) for(const id in c) if(c[id]>0 && ITEMS[id]) invTile(other, id, c[id], [
      {label:"Взять", fn:()=>{
        const it = takeFromFurn(invTarget.ref, id);
        if(it){ toast(it.i + " Найдено: " + it.n); renderInvWin(); }
      }}]);
  }
  if(!other.children.length){ const s=document.createElement("div"); s.className="qgoal"; s.textContent="Пусто"; other.appendChild(s); }
}
el("invClose").onclick = closeInvWin;
el("invWin").onclick = e => { if(e.target.id==="invWin") closeInvWin(); };
addEventListener("pointerdown", e => {
  hideTip();
  if(!(e.target && e.target.closest && e.target.closest("#ctxMenu"))) closeCtxMenu(); // любое нажатие вне меню гасит его
}, true);
el("btnInv").onclick = () => openInvWin(chatOpen && chatNPC ? {kind:"npc", ref:chatNPC} : invTarget);
el("invBar").onclick = () => openInvWin(chatOpen && chatNPC ? {kind:"npc", ref:chatNPC} : invTarget);
el("chatInvBtn").onclick = () => { if(chatNPC) openInvWin({kind:"npc", ref:chatNPC}); };
function addMsg(role, text){
  const d = document.createElement("div");
  d.className = "msg " + role; d.textContent = text;
  logEl.appendChild(d);
}
function scrollLog(){ logEl.scrollTop = logEl.scrollHeight; }

el("chatClose").onclick = closeChat;
el("btnJournal").onclick = toggleJournal;
el("journalClose").onclick = () => el("journal").classList.add("hidden");

async function doSend(n, text){
  addMsg("user", text); n.history.push({role:"user", text}); scrollLog();
  bumpTick(1); // реплика — тоже событие мира
  typingEl.classList.remove("hidden"); scrollLog(); // лог сжимается на высоту индикатора — подтягиваем низ
  try{
    const r = await askLLM(n, text);
    if(chatNPC !== n) return;
    if(!r.reply){ addMsg("sys", "⚠ Модель вернула пустой ответ — скорее всего не хватило токенов на размышления, попробуй ещё раз"); return; }
    n.history.push({role:"npc", text:r.reply}); saveMem(n);
    addMsg("npc", r.reply);
    commitKnow(n); // разговор «переварил» накопленные события: черты обновились, pending пуст
    if(r.mood) n.mood = r.mood;
    if(r.status) n.status = String(r.status).slice(0, 40);
    applyAction(n, r.action, r.reply);
    applyQuest(n, r.quest);
    el("chatName").textContent = n.name + " " + n.mood;
    updateChatInv(n);
  }catch(err){
    addMsg("sys", "⚠ LLM недоступен: " + err.message + " — проверь ⚙");
  }finally{
    typingEl.classList.add("hidden"); scrollLog();
  }
}
el("chatForm").onsubmit = async ev => {
  ev.preventDefault();
  const input = el("chatInput");
  const text = input.value.trim();
  if(!text || !chatNPC) return;
  input.value = "";
  await doSend(chatNPC, text);
};

/* ---- настройки LLM ---- */
el("btnSettings").onclick = () => {
  const s = getSettings();
  const sel = el("setProfile");
  sel.innerHTML = "";
  const opt0 = document.createElement("option"); opt0.value = ""; opt0.textContent = "Своё (указано ниже)"; sel.appendChild(opt0);
  for(const p of LCFGS){ const o = document.createElement("option"); o.value = p.name; o.textContent = p.name; sel.appendChild(o); }
  sel.value = s.profile || "";
  el("setBase").value = s.base; el("setModel").value = s.model; el("setKey").value = s.key;
  el("setReasoning").value = s.reasoning || "";
  el("settingsStatus").textContent = "";
  el("settings").classList.remove("hidden");
};
el("setProfile").onchange = () => {
  const p = LCFGS.find(x => x.name === el("setProfile").value);
  if(p){ el("setBase").value = p.endpoint; el("setModel").value = p.model; el("setKey").value = p.apiKey; }
};
el("setSave").onclick = () => {
  localStorage.setItem("veront_llm", JSON.stringify({
    profile: el("setProfile").value,
    base: el("setBase").value.trim() || DEF_SETTINGS.base,
    model: el("setModel").value.trim() || DEF_SETTINGS.model,
    key: el("setKey").value.trim(),
    reasoning: el("setReasoning").value,
  }));
  el("settingsStatus").textContent = "✓ Сохранено";
};
el("setTest").onclick = async () => {
  const s = {base:el("setBase").value.trim(), model:el("setModel").value.trim(), key:el("setKey").value.trim()};
  el("settingsStatus").textContent = "Проверяю…";
  try{
    const b = s.base.replace(/\/+$/,"");
    let testUrl;
    if(/\/responses$/.test(b)) testUrl = b.replace(/\/responses$/, "/models");
    else if(/\/chat\/completions$/.test(b)) testUrl = b.replace(/\/chat\/completions$/, "/models");
    else testUrl = b + "/models";
    const headers = s.key ? {Authorization:"Bearer "+s.key} : {};
    const res = await fetch(testUrl, {headers});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const d = await res.json();
    el("settingsStatus").textContent = "✓ Доступно моделей: " + ((d.data && d.data.length) || "?");
  }catch(e){ el("settingsStatus").textContent = "✗ " + e.message; }
};

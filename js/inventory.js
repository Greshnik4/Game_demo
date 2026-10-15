"use strict";
/* ============================== ИНВЕНТАРЬ ==============================
   Инвентари: игрок, NPC (открытые предметы + скрытые, которые NPC не
   показывает), мебель (сундуки c, бочки/полки B — содержимое динамическое,
   хранится в veront_furn). NPC отдаёт предметы только сам (give в разговоре,
   в т.ч. скрытые — как награда за квест); игрок может дарить NPC и забирать
   из мебели через окно инвентаря. */
const ITEMS = {
  bread:{n:"хлеб", i:"🍞", p:4, cat:"food", d:"Хлеб из деревенской пекарни. Простая, но сытная еда."},
  apple:{n:"яблоко", i:"🍎", p:3, cat:"fruit", d:"Яблоко из чьего-то сада. Хрустит на весь тракт."},
  fish:{n:"рыба", i:"🐟", p:6, cat:"food", d:"Свежая рыба из пруда Веронта."},
  herbs:{n:"трава", i:"🌿", alt:"травы", p:5, cat:"herb", d:"Лечебные травы. Мира знает им цену."},
  potion:{n:"зелье", i:"🧪", p:20, cat:"herb", d:"Зелье травницы. На вкус как болото, но помогает."},
  candle:{n:"свеча", i:"🕯️", p:4, cat:"misc", d:"Свеча для тёмных вечеров и старых историй."},
  book:{n:"книга", i:"📖", p:15, cat:"misc", d:"Старая, но интересная книга. Уголок страниц потёрт."},
  key:{n:"ключ", i:"🗝️", p:10, cat:"misc", d:"Старый ключ. Возможно, от чего-то важного."},
  purse:{n:"кошелёк", i:"👛", p:25, cat:"valuable", d:"Кошелёк с мелочью. Чужая заботливая рука."},
  axe:{n:"топор", i:"🪓", p:30, cat:"tool", d:"Топор — рубить лес и заканчивать споры."},
  hammer:{n:"молот", i:"🔨", p:25, cat:"tool", d:"Молот — инструмент и веский аргумент."},
  nails:{n:"гвоздь", i:"🔩", alt:"гвозди", p:3, cat:"tool", d:"Гвозди — в хозяйстве всегда годятся."},
  flowers:{n:"цветок", i:"💐", alt:"цветы", p:6, cat:"plant", d:"Полевой букет. Пахнет летом у пруда."},
  amulet:{n:"амулет", i:"🧿", p:40, cat:"valuable", d:"Амулет на удачу. Или просто на шею."},
  lantern:{n:"фонарь", i:"🏮", p:12, cat:"misc", d:"Фонарь для ночной дороги у тракта."},
  letter:{n:"письмо", i:"✉️", p:2, cat:"misc", d:"Письмо. Конверт потёрт — несли далеко."},
  rope:{n:"верёвка", i:"🪢", p:8, cat:"tool", d:"Крепкая верёвка. Пригодится всему."},
  cheese:{n:"сыр", i:"🧀", p:7, cat:"food", d:"Кусок деревенского сыра. Срезан аккуратно."},
};
// винительный падеж категории — для обобщённых черт NPC ("ворует фрукты")
const CAT_ACC = {fruit:"фрукты", food:"еду", tool:"инструменты", valuable:"ценности", herb:"травы", plant:"цветы", misc:"вещи"};
const sellPrice = id => Math.ceil((ITEMS[id] && ITEMS[id].p || 0) / 2);
// подпись предмета: "🍎 яблоко" / "🔩 гвоздь ×2" — единый формат для UI и промптов
const itemLabel = (id, k) => ITEMS[id].i + " " + ITEMS[id].n + (k>1 ? " ×"+k : "");
function loadJSON(k, def){ try{ const v = JSON.parse(localStorage.getItem(k)); return v==null ? def : v; }catch(e){ return def; } }
function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)); }

function findItem(q){
  q = norm(q).trim();
  if(!q) return null;
  if(ITEMS[q]) return q;
  const names = it => [it.n, it.alt||""].map(norm).filter(Boolean);
  for(const id in ITEMS) if(names(ITEMS[id]).includes(q)) return id;
  for(const id in ITEMS){
    const ns = names(ITEMS[id]);
    if(ns.some(n => n.includes(q) || q.includes(n))) return id;
  }
  return null;
}
function invAdd(inv, id, k){ inv[id] = (inv[id]||0) + (k||1); if(inv[id]<=0) delete inv[id]; }
function invHas(inv, id){ return (inv[id]||0) > 0; }
function invList(inv){
  const out = [];
  for(const id in inv) if(inv[id]>0 && ITEMS[id]) out.push(itemLabel(id, inv[id]));
  return out;
}

// открытое (витрина) и скрытое (NPC не показывает, но может отдать за квест)
const NPC_INV = {
  bron:  {inv:{hammer:1, nails:2, bread:1, purse:1},   hidden:["purse"]},
  mira:  {inv:{herbs:2, flowers:1, potion:1, amulet:1}, hidden:["potion","amulet"]},
  osgood:{inv:{book:1, candle:1, key:1, amulet:1},     hidden:["key","amulet"]},
  rurik: {inv:{lantern:1, rope:1, letter:1, purse:1},  hidden:["letter","purse"]},
};
// содержимое мебели по умолчанию: ключ "x,y" в новой сетке (anchor 2x2)
const FURN_INV = {
  "26,8":{nails:2, axe:1},   "94,8":{potion:1, herbs:1},
  "28,64":{book:1, amulet:1, key:1}, "94,60":{cheese:1, apple:1, bread:1},
  "26,12":{fish:1},  "82,12":{candle:1}, "28,68":{letter:1},
  "54,32":{rope:1}, "108,60":{fish:2},
};

player.inv = loadJSON("veront_inv", {});
NPCS.forEach(n => {
  const s = loadJSON("veront_ninv_"+n.id, null);
  if(s && s.inv){ n.inv = s.inv; n.hidden = s.hidden || []; }        // новый формат
  else if(s){ n.inv = s; n.hidden = (NPC_INV[n.id]||{}).hidden||[]; } // старый плоский сейв
  else { n.inv = Object.assign({}, (NPC_INV[n.id]||{}).inv||{});
         n.hidden = ((NPC_INV[n.id]||{}).hidden||[]).slice(); }
});
function saveNInv(n){ saveJSON("veront_ninv_"+n.id, {inv:n.inv, hidden:n.hidden}); }
function isHidden(n, id){ return (n.hidden||[]).includes(id); }
function invListOpen(n){
  return invList(Object.fromEntries(Object.entries(n.inv).filter(([id])=>!isHidden(n,id))));
}

// мебель: динамическое содержимое
let furn = loadJSON("veront_furn", null);
if(!furn){
  furn = {};
  for(const k in FURN_INV) furn[k] = Object.assign({}, FURN_INV[k]);
  saveJSON("veront_furn", furn);
} else {
  // миграция старого сейва: полка таверны была на тайле стены (55,30), переехала на (54,30)
  if(furn["55,30"] && !furn["54,30"]){ furn["54,30"] = furn["55,30"]; delete furn["54,30"]; }
  saveJSON("veront_furn", furn);
}
function furnContents(k){
  if(!furn[k]){
    // любой сундук/шкаф на карте открываем, даже без содержимого — его можно заполнить
    const [x,y] = k.split(",").map(Number);
    const t = upperAt(x,y);
    if(t!=="c" && t!=="B") return null;
    furn[k] = {};
    saveJSON("veront_furn", furn);
  }
  return furn[k];
}
// домашние хранилища NPC — случайно заперты или открыты; отпираются предметом «ключ» (как двери),
// а сами NPC могут их открывать и закрывать, подходя к ним
let flocks = loadJSON("veront_flocks", null);
if(!flocks){
  flocks = {};
  for(const p of PLACES) if(p.npc) for(const s of placeStorages(p))
    if(Math.random()<0.5) flocks[s.k] = true;
  saveJSON("veront_flocks", flocks);
} else {
  saveJSON("veront_flocks", flocks);
}
const furnLocked = k => !!flocks[k];
function setFurnLocked(k,v){ if(v) flocks[k]=true; else delete flocks[k]; saveJSON("veront_flocks", flocks); }
// клик по мебели: запертая — пробуем отпереть ключом; возвращает true, если окно можно открывать
function tryFurn(k){
  if(furnLocked(k)){
    if(invHas(player.inv, "key")){ setFurnLocked(k,false); toast("🗝️ Отперто: " + furnLabel(k)); return true; }
    toast("🔒 Заперто — нужен ключ"); return false;
  }
  return true;
}
function takeFromFurn(k, id){
  if(!furn[k] || !invHas(furn[k], id)) return null;
  invAdd(furn[k], id, -1); invAdd(player.inv, id, 1);
  saveJSON("veront_furn", furn); saveJSON("veront_inv", player.inv);
  bumpTick(2); // взял чужое — заметное событие
  const owner = npcOwnsFurn(k);
  if(owner){
    const [wx,wy] = k.split(",").map(Number);
    worldEvent("steal", owner, {item:id, wx:wx+1, wy:wy+1});
  }
  updateInvUI(); return ITEMS[id];
}

// игрок -> мебель (сложить вещь в хранилище)
function putInFurn(k, id){
  if(!furn[k] || !ITEMS[id] || !invHas(player.inv, id)) return null;
  invAdd(player.inv, id, -1); invAdd(furn[k], id, 1);
  saveJSON("veront_furn", furn); saveJSON("veront_inv", player.inv);
  bumpTick(1);
  const owner = npcOwnsFurn(k);
  if(owner){
    const [wx,wy] = k.split(",").map(Number);
    worldEvent("put", owner, {item:id, wx:wx+1, wy:wy+1});
  }
  updateInvUI(); return ITEMS[id];
}

// покупка открытого предмета у NPC (скрытое не продаётся — только подарок/награда)
function buyFromNpc(n, id){
  if(!ITEMS[id] || !invHas(n.inv, id) || isHidden(n, id)) return null;
  const price = ITEMS[id].p || 0;
  if(gold < price) return {need:price};
  gold -= price; invAdd(n.inv, id, -1); invAdd(player.inv, id, 1);
  saveNInv(n); saveQuests(); updateGold(); updateInvUI();
  bumpTick(2);
  return {ok:true, price};
}
// продажа предмета NPC за полцены
function sellToNpc(n, id){
  if(!ITEMS[id] || !invHas(player.inv, id)) return null;
  const price = sellPrice(id);
  gold += price; invAdd(player.inv, id, -1); invAdd(n.inv, id, 1);
  saveNInv(n); saveQuests(); updateGold(); updateInvUI();
  bumpTick(1);
  return {ok:true, price};
}

/* ---- предметы на земле: занимают квадрат ITEM_FOOT×ITEM_FOOT тайлов ---- */
const ITEM_FOOT = 2;
let ground = loadJSON("veront_ground", []); // [{id,x,y}] — x,y anchor
function saveGround(){ saveJSON("veront_ground", ground); }
function groundAt(x,y){
  return ground.find(g => x >= g.x && x < g.x + ITEM_FOOT && y >= g.y && y < g.y + ITEM_FOOT) || null;
}
function freeGroundAnchor(ax,ay){
  for(let dy=0; dy<ITEM_FOOT; dy++)
    for(let dx=0; dx<ITEM_FOOT; dx++){
      const x = ax+dx, y = ay+dy;
      if(!walkable(x+.5, y+.5)) return false;
      if(upperAt(x,y) === "D") return false;
      if(groundAt(x,y)) return false;
    }
  for(const n of NPCS){
    const nx = Math.floor(n.x), ny = Math.floor(n.y);
    if(nx >= ax && nx < ax+ITEM_FOOT && ny >= ay && ny < ay+ITEM_FOOT) return false;
  }
  return true;
}
// выбросить: ближайшая свободная клетка в радиусе 3 старых тайла в полусфере перед игроком
function dropItem(id){
  if(!ITEMS[id] || !invHas(player.inv, id)) return null;
  const dv = {down:[0,1], up:[0,-1], left:[-1,0], right:[1,0]}[player.dir] || [0,1];
  const px = player.x, py = player.y;
  const cands = [];
  const seen = new Set();
  const R = 3 * ITEM_FOOT;
  for(let dy=-R; dy<=R; dy++) for(let dx=-R; dx<=R; dx++){
    let ax = Math.floor(px) + dx;
    let ay = Math.floor(py) + dy;
    ax -= ax & (ITEM_FOOT-1); ay -= ay & (ITEM_FOOT-1);
    const k = ax + "," + ay;
    if(seen.has(k)) continue;
    seen.add(k);
    const cx = ax + ITEM_FOOT/2, cy = ay + ITEM_FOOT/2;
    const d = Math.hypot(cx-px, cy-py);
    if(d < 1 || d > R + 0.01) continue;
    if((cx-px)*dv[0] + (cy-py)*dv[1] <= 0) continue; // строго перед собой
    if(!freeGroundAnchor(ax,ay)) continue;
    cands.push({ax,ay,d});
  }
  if(!cands.length) return {none:true};
  cands.sort((a,b)=> a.d-b.d || a.ay-b.ay || a.ax-b.ax);
  const c = cands[0];
  invAdd(player.inv, id, -1);
  ground.push({id, x:c.ax, y:c.ay});
  saveGround(); saveJSON("veront_inv", player.inv); updateInvUI();
  bumpTick(1);
  return {ok:true, x:c.ax, y:c.ay};
}
function pickUpGround(x,y){
  const g = groundAt(x,y); if(!g) return null;
  ground = ground.filter(q => q!==g);
  invAdd(player.inv, g.id, 1);
  saveGround(); saveJSON("veront_inv", player.inv); updateInvUI();
  bumpTick(1);
  return ITEMS[g.id];
}

// NPC -> игрок (только по воле LLM, включая скрытое — награда за квест)
function giveItemById(n, id){
  if(!ITEMS[id] || !invHas(n.inv, id)) return null;
  invAdd(n.inv, id, -1); invAdd(player.inv, id, 1);
  saveNInv(n); saveJSON("veront_inv", player.inv);
  bumpTick(2);
  updateInvUI(); return ITEMS[id];
}
// игрок -> NPC (подарок)
function takeItemById(n, id){
  if(!ITEMS[id] || !invHas(player.inv, id)) return null;
  invAdd(player.inv, id, -1); invAdd(n.inv, id, 1);
  saveNInv(n); saveJSON("veront_inv", player.inv);
  bumpTick(2);
  worldEvent("gift", n.id, {item:id});
  updateInvUI(); return ITEMS[id];
}
function giveItem(n, q){ const id = findItem(q); return id ? giveItemById(n, id) : null; }
function takeItem(n, q){ const id = findItem(q); return id ? takeItemById(n, id) : null; }

function updateInvUI(){
  const bar = el("invBar"); if(!bar) return;
  bar.innerHTML = "";
  for(const id in player.inv){
    if(player.inv[id]<=0 || !ITEMS[id]) continue;
    const s = document.createElement("span");
    s.className = "ichip";
    s.onmouseenter = e => showTip(e, itemTipText(id));
    s.onmouseleave = hideTip;
    s.onclick = e => {
      const r = s.getBoundingClientRect();
      const items = playerItemMenu(chatOpen ? chatNPC : null, id);
      openCtxMenu(r.left, r.top - 10 - items.length*36, items, itemTipText(id));
    };
    s.innerHTML = ITEMS[id].i + (player.inv[id]>1 ? "<b>"+player.inv[id]+"</b>" : "");
    bar.appendChild(s);
  }
}

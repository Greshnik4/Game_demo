// Детерминированный тест движения: A* обход углов, вход в дом, клик по NPC, клавиатура
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
// модули игры подключаются в index.html обычными <script src=...> — склеиваем в том же порядке
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const js = srcs.map(s => fs.readFileSync(s, "utf8")).join("\n");

const mkEl = () => ({
  classList:{add(){},remove(){},toggle(){},contains(){return true}},
  addEventListener(){}, appendChild(){}, focus(){},
  innerHTML:"", textContent:"", value:"", scrollTop:0, scrollHeight:0, children:[],
  onclick:null, onchange:null,
});
const ctxStub = new Proxy({}, {
  get:(t,p)=> p in t ? t[p] : ()=>{},
  set:(t,p,v)=>{ t[p]=v; return true; },
});
global.document = {
  getElementById: id => id==="cv"
    ? { getContext:()=>ctxStub, addEventListener(name,fn){ (globalThis.__cvH ||= {})[name]=fn; }, width:0, height:0 }
    : mkEl(),
  createElement: mkEl, addEventListener(){},
};
global.window = global;
global.innerWidth = 1280; global.innerHeight = 800; global.devicePixelRatio = 1;
global.localStorage = { _d:{}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } };
global.location = { search:"" };
global.performance = { now:()=>Date.now() };
global.requestAnimationFrame = ()=>{};
global.addEventListener = ()=>{};
global.fetch = async()=>{ throw new Error("no net"); };

const test = `
;globalThis.__T = { update, player, NPCS, keys, walkable, openChat, closeChat, findPath, cam, TILE,
  giveItem, takeItem, takeFromFurn, putInFurn, furnContents, invListOpen, getInvTarget, closeInvWin,
  buyFromNpc, sellToNpc, getGold: () => gold, setGold: v => { gold = v; },
  dropItem, pickUpGround, groundAt, getGround: () => ground,
  doorLocked, setDoorLocked, tryDoor,
  furnLocked, setFurnLocked, tryFurn, traitsFor, commitKnow, npcOwnsFurn,
  openInvWin, playerItemMenu,
  bumpTick, getTick: () => worldTick, ago, ownStorages, getSettings,
  resolvePlace, poiText, localView, placeNames, applyAction, homeFurnText,
  surfaceAt, lowerAt, upperAt,
  isChatOpen: () => chatOpen, getChatNPC: () => chatNPC };
`;
eval('"use strict";\n' + js + test); // без strict объявления из eval утекут в скоуп модуля и столкнутся с const ниже
const T = globalThis.__T;
const { update, player, NPCS, keys, findPath } = T;
const run = (n) => { for(let i=0;i<n;i++) update(0.016, i*0.016); };
const go = (cx,cy) => {
  player.target = {x:cx, y:cy}; player.targetNPC = null;
  player.path = findPath(Math.floor(player.x), Math.floor(player.y), Math.floor(cx), Math.floor(cy));
};

// 1) обход угла дома: из-за стены в точку за его углом
player.x = 65; player.y = 31;
go(33, 7); run(600);
console.log("around-corner:", player.x.toFixed(2), player.y.toFixed(2), "ok:", Math.hypot(player.x-33, player.y-7) < 1.2);

// 2) вход в дом через дверь (цель — интерьер кузницы)
player.x = 65; player.y = 41;
go(17, 11); run(1000);
console.log("enter-house:", player.x.toFixed(2), player.y.toFixed(2), "inside:", player.x > 9 && player.x < 27 && player.y > 7 && player.y < 13);

// 3) клик по NPC внутри дома -> дойти и открыть чат
player.x = 65; player.y = 41;
player.targetNPC = NPCS[0]; player.path = null;
run(1000);
console.log("click-to-npc chatOpen:", T.isChatOpen());

// 4) клавиатура (e.code)
T.closeChat();
player.x = 65; player.y = 49;
player.target=null; player.targetNPC=null; player.path=null;
keys.add("KeyA");
const x0 = player.x;
run(30);
console.log("KeyA moved dx:", (player.x-x0).toFixed(2));
keys.delete("KeyA"); // как это делает keyup в игре

// 5) клик по миру при открытом чате -> чат скрывается; клик по NPC -> остаётся/переключается
const click = (wx, wy) => globalThis.__cvH.pointerdown({ clientX: wx*T.TILE - T.cam.x, clientY: wy*T.TILE - T.cam.y });
T.openChat(NPCS[0]);
click(40, 20);
console.log("world-click closes chat:", !T.isChatOpen(), "target set:", !!player.target);
T.openChat(NPCS[0]);
click(NPCS[0].x, NPCS[0].y);
console.log("npc-click keeps chat:", T.isChatOpen(), "same npc:", T.getChatNPC() === NPCS[0]);
click(NPCS[1].x, NPCS[1].y);
console.log("other-npc switches chat:", T.getChatNPC() === NPCS[1]);

// 6) инвентарь: клик по сундуку открывает окно, забор из мебели, give/take, скрытое
player.x = 93; player.y = 63;
click(95, 61);
console.log("chest click opens inv:", T.getInvTarget() && T.getInvTarget().kind === "furn",
  "no auto-loot:", Object.keys(player.inv).length === 0);
const tk = T.takeFromFurn("94,60", "cheese");
console.log("take cheese from chest:", !!tk && player.inv.cheese === 1);
const bron = NPCS[0];
const g1 = T.giveItem(bron, "молот");
console.log("give hammer:", !!g1, "bron lost it:", !bron.inv.hammer, "player has:", player.inv.hammer === 1);
const t1 = T.takeItem(bron, "сыр");
console.log("give cheese to bron:", !!t1, "player lost:", !player.inv.cheese, "bron has:", bron.inv.cheese === 1);
const g2 = T.giveItem(bron, "кошел"); // скрытый предмет — LLM может отдать наградой
console.log("give hidden purse:", !!g2 && player.inv.purse === 1);
console.log("hidden not in open list:", !T.invListOpen(bron).join(" ").includes("кошел"));

// 7) клик по сундуку издалека — игрок подходит и окно открывается само
T.closeInvWin();
player.x = 65; player.y = 41;
click(95, 61);
run(1500);
console.log("walk-to-chest:", T.getInvTarget() && T.getInvTarget().ref === "94,60",
  "near:", Math.hypot(player.x-95, player.y-61) < 4.4);

// 8) сложить свою вещь в хранилище
const pf = T.putInFurn("94,60", "hammer");
console.log("put hammer into chest:", !!pf && player.inv.hammer===undefined && T.furnContents("94,60").hammer===1);

// 9) пустое хранилище тоже открывается (его можно заполнить обратно)
T.takeFromFurn("94,60","apple"); T.takeFromFurn("94,60","bread"); T.takeFromFurn("94,60","hammer");
player.x = 93; player.y = 63;
click(95, 61);
console.log("empty chest opens:", T.getInvTarget() && T.getInvTarget().ref === "94,60");

// 10) торговля: покупка открытых предметов NPC, продажа за полцены, скрытое не продаётся
T.setGold(100);
const b1 = T.buyFromNpc(bron, "nails");
console.log("buy nails:", b1 && b1.ok && b1.price === 3 && T.getGold() === 97 && player.inv.nails === 1);
console.log("cannot buy hidden:", T.buyFromNpc(bron, "purse") === null);
T.setGold(0);
const b3 = T.buyFromNpc(bron, "nails");
console.log("buy without gold:", b3 && b3.need === 3 && player.inv.nails === 1);
const s1 = T.sellToNpc(bron, "nails");
console.log("sell nails:", s1 && s1.ok && s1.price === 2 && T.getGold() === 2 && !player.inv.nails);

// 11) предметы на земле: сброс перед собой и подбор
player.x = 65; player.y = 41; player.dir = "right";
player.inv.bread = (player.inv.bread||0) + 1;
const dr = T.dropItem("bread");
console.log("drop bread in front:", !!(dr && dr.ok && T.groundAt(dr.x, dr.y) && dr.x > 64 &&
  Math.hypot(dr.x+1-player.x, dr.y+1-player.y) <= 6.1));
const pu = T.pickUpGround(dr.x, dr.y);
console.log("pick up bread:", !!pu && !!player.inv.bread && !T.groundAt(dr.x, dr.y));

// 12) перед игроком нет свободного места (стена леса) — отказ, предмет при себе
player.x = 3; player.y = 3; player.dir = "up";
player.inv.apple = 1;
const dn = T.dropItem("apple");
console.log("drop blocked at wall:", !!(dn && dn.none && player.inv.apple === 1 && T.getGround().length === 0));
delete player.inv.apple;

// 13) запертая дверь: не проходима, без ключа не открыться, с ключом — открыть
console.log("door 88,19 locked:", T.doorLocked(88,19) && !T.walkable(89, 19));
T.tryDoor("88,19");
console.log("still locked without key:", T.doorLocked(88,19));
const gk = T.giveItem(NPCS.find(n => n.id==="osgood"), "ключ");
console.log("got key:", !!gk && player.inv.key >= 1);
T.tryDoor("88,19");
console.log("unlocked with key:", !T.doorLocked(88,19) && T.walkable(89, 19));

// 14) наковальня у стены (щель в 1 старый тайл между ней и стеной): обе стороны достижимы
player.x = 33; player.y = 9; player.targetNPC = null;
go(33, 13); run(600);
console.log("anvil: north->south:", Math.hypot(player.x-33, player.y-13) < 1.2);
const p14 = findPath(32, 8, 31, 12);
console.log("anvil path avoids object tile:", !!p14 && !p14.some(n => {
  const x = Math.floor(n.x), y = Math.floor(n.y);
  return x >= 32 && x <= 33 && y >= 10 && y <= 11;
}));
// проход сквозь щель стена(28,y)—наковальня(32,y): игрок r=0.64 вписывается в 2 новые клетки x=30,31
player.x = 31; player.y = 9; go(31, 13); run(600);
console.log("anvil: through 1-tile gap:", Math.hypot(player.x-31, player.y-13) < 1.2);

// 15) шкаф вплотную к стене: с севера на юг только в обход
player.x = 27; player.y = 11; go(27, 15); run(600);
console.log("shelf at wall: north->south:", Math.hypot(player.x-27, player.y-15) < 1.2);
const p15 = findPath(26, 10, 25, 14);
console.log("shelf path avoids object tile:", !!p15 && !p15.some(n => {
  const x = Math.floor(n.x), y = Math.floor(n.y);
  return x >= 26 && x <= 27 && y >= 12 && y <= 13;
}));

// 16) кровать в углу из двух стен: с востока на юг в обход
player.x = 13; player.y = 9; go(11, 11); run(600);
console.log("bed in corner: east->south:", Math.hypot(player.x-11, player.y-11) < 1.2);

// 17) запертая дверь как объект в стене: сквозь дом пути нет
T.setDoorLocked(88, 19, true);
console.log("locked door blocks through-house path:", findPath(88, 20, 88, 14) === null);
T.setDoorLocked(88, 19, false);

// 18) POI: сжатое знание карты и разрешение имён мест в тайлы
const poi = T.poiText();
console.log("poi has doors/furniture:", poi.includes("дверь(16,19)") && poi.includes("сундук(26,8)") && poi.includes("наковальня(32,10)"));
T.setDoorLocked(88, 19, true);
console.log("poi marks locked door:", T.poiText().includes("дверь(88,19) заперта"));
T.setDoorLocked(88, 19, false);
const r18a = T.resolvePlace("в кузницу"), r18b = T.resolvePlace("на пруду"), r18c = T.resolvePlace("перекрёстке");
console.log("resolve кузница->door:", !!r18a && r18a.x===17 && r18a.y===19.5);
console.log("resolve пруд walkable:", !!r18b && T.walkable(r18b.x, r18b.y));
console.log("resolve перекрёсток walkable:", !!r18c && T.walkable(r18c.x, r18c.y));
console.log("resolve unknown -> null:", T.resolvePlace("кристалл сна") === null);

// 19) именованный move: NPC идёт через A* к таверне (обходит дома, не вязнет в стенах)
const rurik = NPCS.find(n => n.id==="rurik");
rurik.x = 59; rurik.y = 39; rurik.state="wander"; rurik.path=null;
T.applyAction(rurik, {type:"move", to:"таверна"});
console.log("named move sets path:", rurik.state==="move" && Array.isArray(rurik.path) && rurik.path.length>0);
for(let i=0;i<2000 && rurik.state==="move";i++) update(0.016, i*0.016); // прибытие переключает state в wander
console.log("npc walked to tavern door:", Math.hypot(rurik.x-101, rurik.y-67.5) < 3.2);
T.applyAction(rurik, {type:"move", to:"башня дракона"});
console.log("unknown place -> bubble:", !!rurik.bubble && rurik.bubble.text.includes("Не знаю"));

// 20) локальное окно 9x9: тайлы вокруг NPC, игрок помечен @
const bron20 = NPCS[0];
bron20.x = 21; bron20.y = 11; player.x = 23; player.y = 11;
const lv = T.localView(bron20, player).split("\n");
console.log("localView 9x9:", lv.length===10 && lv.slice(0,9).every(r=>r.length===9),
  "center is npc tile:", lv[4][4]==="H", "player marked:", lv[4][5]==="@",
  "legend only seen chars:", lv[9].includes("H пол") && !lv[9].includes("~"));

// 21) NPC знает, что лежит у него дома в сундуках/шкафах (живое содержимое)
const hf = T.homeFurnText(bron20);
console.log("bron knows home storage:", hf.includes("сундук: 🔩 гвоздь ×2, 🪓 топор") && hf.includes("шкаф: 🐟 рыба"));
T.takeFromFurn("26,8","axe");
console.log("knowledge follows looted chest:", !T.homeFurnText(bron20).includes("топор"));

// 22) замки хранилищ (старт случайный — фиксируем явно): ключ отпирает, без ключа — отказ
T.setFurnLocked("26,8",true); T.setFurnLocked("28,64",true); T.setFurnLocked("94,60",false);
console.log("home chests locked, tavern not:", T.furnLocked("26,8") && T.furnLocked("28,64") && !T.furnLocked("94,60"));
const keySave = player.inv.key; delete player.inv.key;
console.log("locked without key:", T.tryFurn("26,8")===false && T.furnLocked("26,8"));
player.inv.key = keySave || 1;
console.log("key unlocks:", T.tryFurn("26,8")===true && !T.furnLocked("26,8"));

// 23) знание о мире: событие кражи накапливается у владельца, ближайшие видят, дальние — нет
player.x = 21; player.y = 11;
rurik.x = 27; rurik.y = 27;
T.takeFromFurn("26,8","nails");
console.log("owner queued steal:", bron20.know.pending.some(e=>e.kind==="steal" && e.item==="nails"));
console.log("nearby npc witnessed:", rurik.know.pending.some(e=>e.kind==="saw" && e.item==="nails"));
console.log("far npc silent:", NPCS.find(n=>n.id==="mira").know.pending.length===0);
console.log("public chest has no owner:", T.npcOwnsFurn("94,60")===null);
// 24) обобщение черт: две кражи фруктов -> "ворует фрукты", разные категории -> "всё подряд"
bron20.know.thefts = [{item:"apple",t:Date.now()},{item:"apple",t:Date.now()}];
console.log("trait generalizes by category:", T.traitsFor(bron20.know).some(t=>t.includes("фрукт")));
bron20.know.thefts.push({item:"axe",t:Date.now()});
console.log("mixed categories:", T.traitsFor(bron20.know).some(t=>t.includes("всё подряд")));
T.commitKnow(bron20);
console.log("commit: pending cleared, traits persisted:",
  bron20.know.pending.length===0 && bron20.know.traits.some(t=>t.includes("фрукт")));

// 25) время мира = события: бакеты давности и вес действий
const tk0 = T.getTick();
T.bumpTick(2);
const te = T.getTick();
console.log("tick advanced:", te===tk0+2);
console.log("buckets:", T.ago(te)==="только что" && T.ago(te-3)==="только что" &&
  T.ago(te-4)==="недавно" && T.ago(te-10)==="недавно" &&
  T.ago(te-11)==="раньше" && T.ago(te-25)==="раньше" &&
  T.ago(te-26)==="давно" && T.ago(te-60)==="давно" && T.ago(te-61)==="очень давно");
// вход в дом = событие (+1), пребывание внутри — нет
player.x = 65; player.y = 41; player.target=null; player.targetNPC=null; player.path=null;
update(0.016, 100000);
const tk1 = T.getTick();
player.x = 17; player.y = 11;
update(0.016, 100001);
console.log("enter house +1:", T.getTick()===tk1+1);
update(0.016, 100002);
console.log("staying inside: no bump:", T.getTick()===tk1+1);
// время событий кражи — в тиках мира, не в Date.now
const th = bron20.know.thefts[bron20.know.thefts.length-1];
console.log("event time is tick-based:", th.t < 10000);

// 26) NPC не статичны: старт в центре тайла, блуждание сдвигает с места; свои хранилища известны
console.log("own storages:", T.ownStorages(NPCS[0]).map(s=>s.k).join(",") === "26,8,26,12");
// путь (сумма перемещений), а не смещение: NPC с малым радиусом может вернуться к старту
const trail = NPCS.map(()=>0);
for(let i=0;i<1800;i++){
  const prev = NPCS.map(n=>[n.x,n.y]);
  update(0.016, i*0.016);
  NPCS.forEach((n,j)=>{ trail[j] += Math.hypot(n.x-prev[j][0], n.y-prev[j][1]); });
}
console.log("npcs wander:", trail.every(t=>t>3.0), trail.map(t=>t.toFixed(1)).join(" "));
// упёршийся NPC не должен вечно впираться в стену: цель сбрасывается
const stuckN = NPCS.find(n=>n.id==="osgood");
stuckN.x = 5; stuckN.y = 41; stuckN.tx = 1; stuckN.ty = 41; stuckN.state="move"; stuckN.path=null; // сквозь лесной край
run(300);
console.log("stuck npc retargets:", stuckN.state==="wander");

// 27) follow: обход стены по A* (игрок в кузнице, NPC снаружи восточной стены)
player.x = 17; player.y = 11; player.target=null; player.targetNPC=null; player.path=null;
const ru27 = NPCS.find(n=>n.id==="rurik");
ru27.x = 31; ru27.y = 15; ru27.state="follow"; ru27.followUntil = 1e9; ru27.path=null;
run(1500);
console.log("follow around wall:", Math.hypot(ru27.x-player.x, ru27.y-player.y) < 3.2);
// 28) длинный wander: все в проходимых тайлах, дальний NPC возвращается домой по пути
ru27.state="wander"; ru27.path=null;
run(3000);
console.log("wander keeps walkable:", NPCS.every(n=>T.walkable(n.x,n.y)));
console.log("far npc returns home area:", Math.hypot(ru27.x-(ru27.home.x+1), ru27.y-(ru27.home.y+1)) < 8);

// 29) галлюцинация дальних координат перекрывается местом из реплики; короткие — нет
const ru29 = NPCS.find(n=>n.id==="rurik");
ru29.x = 41; ru29.y = 51; ru29.state="wander"; ru29.path=null;
T.applyAction(ru29, {type:"move", x:2, y:2}, "Проверю-ка я свою будку");
console.log("far coords overridden by place in reply:",
  ru29.state==="move" && Math.hypot(ru29.tx-59, ru29.ty-37.5) < 3);
T.applyAction(ru29, {type:"move", x:44, y:50}, "step");
console.log("short coords kept:", Math.abs(ru29.tx-44.5)<.01 && Math.abs(ru29.ty-50.5)<.01);

// 30) подарок NPC: предмет переходит и событие gift записано; настройка reasoning доступна
player.inv.flowers = 1;
const gi = T.takeItem(bron20, "цветок");
console.log("gift to npc:", !!gi && bron20.inv.flowers===1 && !player.inv.flowers &&
  bron20.know.pending.some(e=>e.kind==="gift" && e.item==="flowers"));
console.log("reasoning setting present:", "reasoning" in T.getSettings());

// 31) окно инвентаря с NPC и общее меню предмета: 3 пункта (Продать/Подарить/Выбросить)
T.openInvWin({kind:"npc", ref:NPCS[0]});
const menu31 = T.playerItemMenu(NPCS[0], "bread");
console.log("npc inv menu:", T.getInvTarget() && T.getInvTarget().kind==="npc" &&
  menu31.length===3 && menu31[0].label.includes("Продать") &&
  menu31[1].label.includes("Подарить") && menu31[2].label.includes("Выбросить"));
console.log("menu without npc: only drop:", T.playerItemMenu(null, "bread").length===1);
T.closeInvWin();

// 32) два слоя с наложением: дерево сверху, трава снизу; сундук сверху, пол снизу
console.log("overlay tree over grass:",
  T.surfaceAt(48,20) === "." && T.upperAt(48,20) === "T" && T.lowerAt(48,20) === null);
console.log("overlay chest over floor:",
  T.surfaceAt(94,60) === "H" && T.upperAt(94,60) === "c" && T.lowerAt(94,60) === null);

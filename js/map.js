"use strict";
/* ============================== КАРТА (движок) ==============================
   Собирает мир из ресурсов: js/data/objects.js (свойства типов) и
   js/data/map.js (что где стоит). Сетка 16×16 px; у объекта два пятна:
   визуальное (vw×vh) и коллизионное (cw×ch со смещением ox,oy) — дерево
   рисуется на 2×2, а стоит на одном тайле. Одинаковые семена склеиваются
   (merge) в один объект: 4 камня -> глыба 2×2, ряд штакетин -> забор. */
const MW = MAP_DATA.w, MH = MAP_DATA.h;

/* ---- поверхность ---- */
const GROUND = Array.from({length:MH}, () => Array(MW).fill("."));
function grect(x0,y0,x1,y1,c){
  for(let y=y0; y<=y1; y++) for(let x=x0; x<=x1; x++) GROUND[y][x] = c;
}
for(const [x0,y0,x1,y1,c] of MAP_DATA.ground) grect(x0,y0,x1,y1,c);

/* ---- объекты ---- */
const OBJECTS = [];
const UP_AT  = Array.from({length:MH}, () => Array(MW).fill(null));
const LOW_AT = Array.from({length:MH}, () => Array(MW).fill(null));
const SOLID  = Array.from({length:MH}, () => Array(MW).fill(false));

// w,h — по умолчанию из OBJ_DEF (vw,vh); opt переопределяет коллизионное пятно
function addObj(t, x, y, w, h, opt={}){
  const d = OBJ_DEF[t];
  w = w ?? d.vw ?? 1; h = h ?? d.vh ?? 1;
  const o = {
    t, x, y, w, h,
    cx: opt.cx ?? x + (d.ox ?? 0), cy: opt.cy ?? y + (d.oy ?? 0),
    cw: opt.cw ?? d.cw ?? w,       ch: opt.ch ?? d.ch ?? h,
    layer: d.layer, solid: d.solid !== false,
  };
  OBJECTS.push(o);
  const grid = d.layer === "upper" ? UP_AT : LOW_AT;
  for(let yy=y; yy<y+h; yy++) for(let xx=x; xx<x+w; xx++)
    if(xx>=0 && yy>=0 && xx<MW && yy<MH) grid[yy][xx] = o;
  if(o.solid) for(let yy=o.cy; yy<o.cy+o.ch; yy++) for(let xx=o.cx; xx<o.cx+o.cw; xx++)
    if(xx>=0 && yy>=0 && xx<MW && yy<MH) SOLID[yy][xx] = true;
  return o;
}

/* Склейка семян одного типа: жадно растим кластер до merge.w × merge.h. */
function mergeSeeds(seeds, t){
  const m = OBJ_DEF[t].merge;
  const left = new Set(seeds.map(([x,y]) => x + "," + y));
  const order = [...left].map(k => k.split(",").map(Number)).sort((a,b)=> a[1]-b[1] || a[0]-b[0]);
  for(const [sx,sy] of order){
    if(!left.has(sx + "," + sy)) continue;
    let w = 1;
    while(w < m.w && left.has((sx+w) + "," + sy)) w++;
    let h = 1;
    outer: while(h < m.h){
      for(let dx=0; dx<w; dx++) if(!left.has((sx+dx) + "," + (sy+h))) break outer;
      h++;
    }
    for(let dy=0; dy<h; dy++) for(let dx=0; dx<w; dx++) left.delete((sx+dx) + "," + (sy+dy));
    addObj(t, sx, sy, w, h);
  }
}

/* ---- дома: крыша одним объектом, стены по тайлу, дверь 2×1, вход снизу ---- */
const HOUSES = MAP_DATA.houses;
for(const h of HOUSES){
  addObj(h.roof, h.x0, h.y0-2, h.x1-h.x0+1, 2);
  grect(h.x0+1, h.y0+1, h.x1-1, h.y1-1, "H");
  for(let x=h.x0; x<=h.x1; x++){
    addObj("#", x, h.y0);                       // верхняя стена — всегда глухая
    if(x>=h.door && x<h.door+2) continue;       // вход только снизу, через дверь
    addObj("#", x, h.y1);
  }
  for(let y=h.y0+1; y<=h.y1-1; y++){ addObj("#", h.x0, y); addObj("#", h.x1, y); }
  addObj("D", h.door, h.y1, 2, 1);
}

/* ---- одиночные объекты и склейки ---- */
for(const [t,x,y,w,h] of MAP_DATA.objects) addObj(t, x, y, w, h);
for(const {t, seeds} of MAP_DATA.merge) mergeSeeds(seeds, t);

// вода непроходима
for(let y=0; y<MH; y++) for(let x=0; x<MW; x++)
  if(GROUND[y][x] === "~") SOLID[y][x] = true;

/* ---- доступ к слоям ---- */
function surfaceAt(x,y){
  if(x<0 || y<0 || x>=MW || y>=MH) return ".";
  return GROUND[y][x];
}
function lowerAt(x,y){
  if(x<0 || y<0 || x>=MW || y>=MH) return null;
  return LOW_AT[y][x] ? LOW_AT[y][x].t : null;
}
function upperAt(x,y){
  if(x<0 || y<0 || x>=MW || y>=MH) return null;
  return UP_AT[y][x] ? UP_AT[y][x].t : null;
}
function objUpperAt(x,y){
  if(x<0 || y<0 || x>=MW || y>=MH) return null;
  return UP_AT[y][x];
}
function tileAt(x,y){
  if(x<0 || y<0 || x>=MW || y>=MH) return "L";
  const u = upperAt(x,y);
  if(u) return u;
  const l = lowerAt(x,y);
  if(l) return l;
  return surfaceAt(x,y);
}
function storageKeyAt(x,y){
  const o = objUpperAt(x,y);
  return (o && OBJ_DEF[o.t].storage) ? (o.x + "," + o.y) : null;
}
function doorKeyAt(x,y){
  const o = objUpperAt(x,y);
  return (o && o.t === "D") ? (o.x + "," + o.y) : null;
}

// нормализация строк для нечёткого поиска (реги/ё) — общая для предметов и мест
const norm = s => String(s||"").toLowerCase().replace(/ё/g,"е");

/* Двери: могут быть заперты (veront_doors) и анимируются при подходе (doorAnim 0..1).
   По умолчанию заперта дверь дома Миры (88,19) — ключ можно найти у старейшины. */
const MAP_SAVE_VERSION = "3";
if(localStorage.getItem("veront_map_version") !== MAP_SAVE_VERSION){
  // карта переработана: старые привязки к тайлам больше не действительны
  for(const k of ["veront_furn","veront_flocks","veront_doors","veront_ground"]) localStorage.removeItem(k);
}
let doorLocks = null;
try{ doorLocks = JSON.parse(localStorage.getItem("veront_doors")); }catch(e){}
if(!doorLocks) doorLocks = {"88,19":true};
const saveDoors = () => localStorage.setItem("veront_doors", JSON.stringify(doorLocks));
saveDoors();

function doorKey(x,y){
  const o = objUpperAt(Math.floor(x), Math.floor(y));
  return (o && o.t === "D") ? (o.x + "," + o.y) : (Math.floor(x) + "," + Math.floor(y));
}
const doorLocked = (x,y) => !!doorLocks[doorKey(x,y)];
function setDoorLocked(x,y,v){
  const k = doorKey(x,y);
  if(v) doorLocks[k] = true; else delete doorLocks[k];
  saveDoors();
}
const doorAnim = {}; // "x,y" -> 0..1, только в рантайме
const DOOR_TILES = OBJECTS.filter(o => o.t === "D").map(o => [o.x, o.y]);

/* ---- проходимость: движение поклеточное, тайл проходим, если в его центре
   нет препятствия и дверь не заперта ---- */
const walkable = (x,y) => {
  const tx = Math.floor(x), ty = Math.floor(y);
  if(tx<0 || ty<0 || tx>=MW || ty>=MH) return false;
  const o = UP_AT[ty][tx];
  if(o && o.t === "D") return !doorLocked(o.x, o.y);
  return !SOLID[ty][tx];
};
const tileWalkable = (x,y) => walkable(x+0.5, y+0.5);
// пятно сущности 2×1 (две клетки по горизонтали): проходимо, если проходимы обе
const blockClear = (ox,oy) => tileWalkable(ox,oy) && tileWalkable(ox+1,oy);

function lowerBlocks(x,y){
  if(x<0 || y<0 || x>=MW || y>=MH) return true;
  const o = LOW_AT[y][x];
  return !!(o && o.solid);
}
function hasLOS(x0,y0,x1,y1){
  const tx = Math.floor(x1), ty = Math.floor(y1);
  const dist = Math.hypot(x1-x0, y1-y0);
  const steps = Math.max(1, Math.ceil(dist * 4));
  for(let i=1; i<steps; i++){
    const x = Math.floor(x0 + (x1-x0) * i / steps);
    const y = Math.floor(y0 + (y1-y0) * i / steps);
    if(x === tx && y === ty) continue;
    if(lowerBlocks(x,y)) return false;
  }
  return true;
}

/* ---- время мира = число событий игрока, взвешенных по значимости ----
   NPC переживает «как давно» не в секундах, а бакетами прошедших событий:
   <=3 только что, <=10 недавно, <=25 раньше, <=60 давно, дальше очень давно.
   Веса: вход в дом +1, поднять/бросить/положить +1, продажа +1, подарок +2,
   кража +2, покупка +2, реплика в диалоге +1, квест: предложен +2, выполнен +5. */
let worldTick = parseInt(localStorage.getItem("veront_tick")||"0",10) || 0;
function bumpTick(w){ worldTick += w; localStorage.setItem("veront_tick", String(worldTick)); }

/* ---- POI: сжатое знание карты для LLM ---- */
const FURN_NAME = {};
for(const t in OBJ_DEF) if(OBJ_DEF[t].furn || OBJ_DEF[t].storage) FURN_NAME[t] = OBJ_DEF[t].llm;
FURN_NAME.u = "ковёр";
const PLACES = MAP_DATA.places;
let POND = null;
for(let y=0; y<MH; y++) for(let x=0; x<MW; x++){
  if(GROUND[y][x] !== "~") continue;
  if(!POND) POND = {x0:x,y0:y,x1:x,y1:y};
  POND.x0=Math.min(POND.x0,x); POND.y0=Math.min(POND.y0,y);
  POND.x1=Math.max(POND.x1,x); POND.y1=Math.max(POND.y1,y);
}
const SIGN = OBJECTS.find(o => o.t === "S") || null;
const EXTRA_PLACES = [
 {name:"пруд",        alt:["пруд"], x:POND?POND.x0-1:86, y:POND?((POND.y0+POND.y1)>>1):26},
 {name:"перекрёсток", alt:["перекрест","перекрёст","дорог","тракт"], x:64, y:40},
 ...(SIGN ? [{name:"указатель", alt:["указател","столб"], x:SIGN.x, y:SIGN.y+2}] : []),
];
function poiText(){
  const L = ["МЕСТА (тайлы x→,y↓):"];
  for(const p of PLACES){
    const f = OBJECTS
      .filter(o => FURN_NAME[o.t] && o.x>=p.x0 && o.x<=p.x1 && o.y>=p.y0 && o.y<=p.y1)
      .sort((a,b)=> a.y-b.y || a.x-b.x)
      .map(o => FURN_NAME[o.t] + "(" + o.x + "," + o.y + ")");
    for(const [x,y] of p.extra||[]){
      const o = objUpperAt(x,y);
      if(o && FURN_NAME[o.t]) f.push(FURN_NAME[o.t] + "(" + o.x + "," + o.y + ")");
    }
    for(let y=p.y0; y<=p.y1; y++) for(let x=p.x0; x<=p.x1; x++)
      if(GROUND[y][x] === "u"){ f.push("ковёр("+x+","+y+")"); break; }
    L.push(p.name+": x"+p.x0+"-"+p.x1+" y"+p.y0+"-"+p.y1+", дверь("+p.door[0]+","+p.door[1]+")"+
      (doorLocked(p.door[0],p.door[1])?" заперта":"")+"; "+f.join(" "));
  }
  if(POND) L.push("пруд x"+POND.x0+"-"+POND.x1+" y"+POND.y0+"-"+POND.y1+" · перекрёсток(64,40) · указатель("+SIGN.x+","+SIGN.y+") · главная дорога y=40");
  return L.join("\n");
}
// ближайший проходимый центр пятна 2×1 — цель для «подойти к объекту»:
// перебираем пятна вокруг точки и берём то, чей центр ближе всего
function nearestWalkableCenter(x,y){
  const cx0 = Math.round(x)-1, cy0 = Math.round(y-0.5);
  let best = null, bd = Infinity;
  for(let dy=-4; dy<=4; dy++)
    for(let dx=-4; dx<=4; dx++){
      const cx = cx0+dx, cy = cy0+dy;
      if(cx<0 || cy<0 || cx+1>=MW || cy>=MH) continue;
      if(!blockClear(cx,cy)) continue;
      const d = Math.hypot(cx+1-x, cy+0.5-y);
      if(d < bd){ bd = d; best = {x:cx+1, y:cy+0.5}; }
    }
  return best;
}
// сундуки/шкафы (storage) в прямоугольнике места
function placeStorages(p){
  return OBJECTS
    .filter(o => OBJ_DEF[o.t].storage && o.x>=p.x0 && o.x<=p.x1 && o.y>=p.y0 && o.y<=p.y1)
    .sort((a,b)=> a.y-b.y || a.x-b.x)
    .map(o => ({k:o.x+","+o.y, x:o.x, y:o.y, t:o.t}));
}
// "кузницу", "на пруду", "в таверну" -> место; цель — центр двери дома или берег пруда
function matchPlace(q){
  q = norm(q).trim();
  if(!q) return null;
  const hit = p => [norm(p.name), ...(p.alt||[])].some(a => q.includes(a) || (a.length>2 && a.includes(q)));
  return PLACES.find(hit) || EXTRA_PLACES.find(hit) || null;
}
function placeTarget(p){
  if(p.door){
    const [dx,dy] = p.door;
    return walkable(dx+1,dy+.5) ? {x:dx+1, y:dy+.5} : nearestWalkableCenter(dx,dy+2);
  }
  return nearestWalkableCenter(p.x,p.y);
}
function resolvePlace(q){ const p = matchPlace(q); return p ? placeTarget(p) : null; }
function placeNames(){ return PLACES.map(p=>p.name).concat(EXTRA_PLACES.map(p=>p.name)).join(", "); }
// в каком месте (здании) стоит точка; null — вне
function placeAt(x,y){ return PLACES.find(p => x>=p.x0 && x<=p.x1 && y>=p.y0 && y<=p.y1) || null; }
// сундуки/шкафы в доме NPC — их NPC открывают и закрывают
function ownStorages(n){
  const p = PLACES.find(pl => pl.npc === n.id);
  return p ? placeStorages(p) : [];
}
// что NPC хранит дома в сундуках/шкафах (содержимое берётся из живого furn)
function homeFurnText(n){
  const p = PLACES.find(pl => pl.npc === n.id);
  if(!p) return "";
  return placeStorages(p).map(s=>{
    const c = furn[s.k];
    const items = c ? Object.keys(c).filter(k=>c[k]>0 && ITEMS[k]).map(k=>itemLabel(k, c[k])).join(", ") : "";
    return (FURN_NAME[s.t]||"хранилище")+": "+(items||"пусто");
  }).join(" · ");
}
// локальное окно 9x9 (по 2 тайла на клетку обзора) вокруг сущности: обзор с учётом нижних блокираторов
function localView(e, other){
  const ecx = Math.floor(e.x), ecy = Math.floor(e.y);
  const cx = Math.floor(e.x / 2), cy = Math.floor(e.y / 2), R = 4;
  const chars = new Set(), rows = [];
  for(let gy=cy-R; gy<=cy+R; gy++){
    let row = "";
    for(let gx=cx-R; gx<=cx+R; gx++){
      const ax = gx * 2, ay = gy * 2;
      if(ax<0 || ay<0 || ax>=MW || ay>=MH){ row += "?"; continue; }
      const visible = hasLOS(ecx, ecy, ax+1, ay+1);
      if(other && Math.floor(other.x / 2) === gx && Math.floor(other.y / 2) === gy && visible){
        row += "@"; chars.add("@"); continue;
      }
      if(!visible){ row += "?"; continue; }
      let t = null;
      for(let dy=0; dy<2 && !t; dy++)
        for(let dx=0; dx<2 && !t; dx++)
          if(UP_AT[ay+dy][ax+dx]) t = UP_AT[ay+dy][ax+dx].t;
      for(let dy=0; dy<2 && !t; dy++)
        for(let dx=0; dx<2 && !t; dx++)
          if(LOW_AT[ay+dy][ax+dx]) t = LOW_AT[ay+dy][ax+dx].t;
      if(!t) t = GROUND[ay][ax];
      row += t; chars.add(t);
    }
    rows.push(row);
  }
  const LEG = {".":"трава", ",":"тропа", "H":"пол", "u":"ковёр", "~":"вода", "?":"не видно", "@":"игрок"};
  for(const t in OBJ_DEF) LEG[t] = OBJ_DEF[t].llm;
  return rows.join("\n")+"\n"+[...chars].map(c=>c+" "+(LEG[c]||"?")).join(" ");
}

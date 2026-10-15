"use strict";
/* ============================== СУЩНОСТИ ============================== */
const WORLD_LORE = "Мир: деревня Веронт у старого тракта. Кузница, дома травницы и старейшины, будка стражника и таверна — все дома заходимые: войди через дверь (тайл D) внутрь, там мебель и ковры. Большой пруд, указатель у перекрёстка. Карта 128x80 тайлов, игрок бродит по деревне.";

const NPCS = [
 { id:"bron", name:"Брон", role:"кузнец", home:{x:20,y:10}, r:2,
   shirt:"#8a3b2e", skin:"#d9a06b", hair:"#3a2a1a", mood:"⚒️", status:"🍺 хочу выпить",
   persona:"Брон — кузнец Веронта. Грубоват, прямолинеен, но добрый внутри. Гордится своим делом, любит выпить, тоскует по уехавшей дочери. Говорит коротко, по-простонародному. Ненавидит налоговиков." },
 { id:"mira", name:"Мира", role:"травница", home:{x:86,y:10}, r:2,
   shirt:"#3e7d5a", skin:"#e8c39a", hair:"#7a3b2e", mood:"🌿", status:"🌿 ищу травы",
   persona:"Мира — травница, живёт у дома у пруда. Жизнерадостная, болтливая, знает все сплетни деревни. Любит растения, кошек и загадки. Слегка суеверна." },
 { id:"osgood", name:"Осгуд", role:"старейшина", home:{x:16,y:74}, r:4,
   shirt:"#5a5a72", skin:"#cfa87c", hair:"#cfcfcf", mood:"🕯️", status:"📖 помню старое",
   persona:"Осгуд — старейшина Веронта. Говорит медленно, загадочно, любит притчи и намёки на древнюю историю места. Помнит старые легенды. Добрая, но хитрая душа." },
 { id:"rurik", name:"Рурик", role:"стражник", home:{x:58,y:38}, r:6,
   shirt:"#4a5f8a", skin:"#d9b48f", hair:"#2a2a2a", mood:"🛡️", status:"📝 пишу стихи",
   persona:"Рурик — стражник тракта. Подозрительный, формальный, всё записывает в книжечку. Мечтает о повышении. В глубине души романтик и тайно пишет плохие стихи." },
];
NPCS.forEach(n => {
  // старт у дома; пятно коллизии сущности 2×1 (две клетки по горизонтали),
  // gx/gy — левая клетка пятна, x,y — его центр
  n.gx = n.home.x; n.gy = n.home.y;
  n.x = n.gx + 1; n.y = n.gy + 0.5;
  n.speed = 3.4; n.step = null;
  n.dir="down"; n.state="wander"; n.tx=n.x; n.ty=n.y; n.path=null; n.chore=null; n.stuckT=0;
  n.wanderT=Math.random()*3; n.bubble=null; n.followUntil=0; n.history=loadMem(n.id); });

function loadMem(id){ try{ return JSON.parse(localStorage.getItem("veront_mem_"+id))||[] }catch(e){ return [] } }
function saveMem(n){ localStorage.setItem("veront_mem_"+n.id, JSON.stringify(n.history.slice(-20))); }

const player = { x:65, y:41.5, gx:64, gy:41, speed:8, step:null,
  dir:"down", moving:false, anim:0,
  stats:{ hp:100, hpMax:100, str:6, agi:5, cha:4 } };

/* ---- поклеточное движение: сущность занимает пятно 2×1 (две клетки по
   горизонтали) и перешагивает им в соседнюю клетку (вверх/вниз/влево/вправо),
   если обе клетки нового пятна проходимы ---- */
function syncGrid(e){ if(!e.step){ e.gx = Math.round(e.x)-1; e.gy = Math.round(e.y-0.5); } }
function tryStep(e, dx, dy){
  if(e.step || (dx && dy)) return false;
  syncGrid(e);
  const nx = e.gx + dx, ny = e.gy + dy;
  if(!blockClear(nx, ny)) return false;
  e.step = {dx, dy, rem:1};
  e.gx = nx; e.gy = ny;
  e.dir = dx>0 ? "right" : dx<0 ? "left" : dy>0 ? "down" : "up";
  return true;
}
function advanceStep(e, dt){
  if(!e.step) return;
  // позиция ушла далеко от целевой клетки (телепорт/отладка) — шаг отменяем
  if(Math.hypot(e.x-(e.gx+1), e.y-(e.gy+0.5)) > 1.6){ e.step = null; syncGrid(e); return; }
  const s = Math.min(e.step.rem, e.speed * dt);
  e.x += e.step.dx * s; e.y += e.step.dy * s;
  e.step.rem -= s;
  if(e.step.rem <= 0){ e.step = null; e.x = e.gx + 1; e.y = e.gy + 0.5; } // финал — точно в центр пятна
}
// шаг к узлу пути (соседний origin пятна); false — упёрся, путь надо перекладывать
function stepAlong(e, node){
  const dx = Math.sign(node.x - 1 - e.gx), dy = Math.sign(node.y - 0.5 - e.gy);
  if(!dx && !dy) return true;
  return tryStep(e, dx, dy);
}
function faceDir(dx,dy,cur){
  if(Math.abs(dx) > Math.abs(dy)) return dx>0 ? "right" : dx<0 ? "left" : cur;
  return dy>0 ? "down" : dy<0 ? "up" : cur;
}

class MinHeap{
  constructor(){ this.items = []; }
  get size(){ return this.items.length; }
  push(item){
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while(i > 0){
      const p = (i - 1) >> 1;
      if(a[p].f <= a[i].f) break;
      const t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  }
  pop(){
    const a = this.items;
    if(!a.length) return null;
    const top = a[0];
    const last = a.pop();
    if(a.length){
      a[0] = last;
      let i = 0;
      while(true){
        const l = i*2 + 1, r = l + 1;
        let s = i;
        if(l < a.length && a[l].f < a[s].f) s = l;
        if(r < a.length && a[r].f < a[s].f) s = r;
        if(s === i) break;
        const t = a[s]; a[s] = a[i]; a[i] = t;
        i = s;
      }
    }
    return top;
  }
}

// A* по origin-клеткам пятна 2×1, 4 направления — ровно те шаги, что умеет сущность;
// аргументы — точки (центры/клики), они приводятся к origin ближайшего пятна
function findPath(sx,sy,tx,ty){
  const scx = Math.round(sx)-1, scy = Math.round(sy-0.5);
  const tcx = Math.round(tx)-1, tcy = Math.round(ty-0.5);
  if(!blockClear(tcx,tcy)) return null;
  if(scx===tcx&&scy===tcy) return [];
  const key=(x,y)=>y*MW+x;
  const open=new MinHeap();
  open.push({x:scx,y:scy,g:0,f:0});
  const gs=new Map([[key(scx,scy),0]]);
  const came=new Map();
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(open.size){
    const c=open.pop();
    const ck=key(c.x,c.y);
    if(gs.get(ck) !== c.g) continue;
    if(c.x===tcx&&c.y===tcy){
      const path=[]; let k=key(c.x,c.y);
      while(came.has(k)){
        const px=k%MW, py=(k-px)/MW;
        path.push({x:px+1, y:py+0.5});
        const p=came.get(k); k=key(p.x,p.y);
      }
      return path.reverse();
    }
    for(const [dx,dy] of dirs){
      const nx=c.x+dx, ny=c.y+dy;
      if(nx<0||ny<0||nx+1>=MW||ny>=MH) continue;
      if(!blockClear(nx,ny)) continue;
      const ng=c.g+1, k=key(nx,ny);
      if(gs.has(k)&&gs.get(k)<=ng) continue;
      gs.set(k,ng); came.set(k,c);
      open.push({x:nx,y:ny,g:ng,f:ng+Math.abs(tcx-nx)+Math.abs(tcy-ny)});
    }
  }
  return null;
}

function nearNPC(){
  let best=null, bd=3.0;
  for(const n of NPCS){
    const d = Math.hypot(n.x-player.x, n.y-player.y);
    if(d < bd){ bd=d; best=n; }
  }
  return best;
}

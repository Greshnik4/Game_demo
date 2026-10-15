"use strict";
/* ============================== ОБНОВЛЕНИЕ ============================== */
function update(dt, now){
  updatePlayer(dt);
  updateDoors(dt);
  updateNPCs(dt, now);
  updateWorld();
}
function updatePlayer(dt){
  player.moving = false;
  syncGrid(player);
  if(chatOpen){ player.target = null; player.targetNPC = null; player.path = null; player.pendingFurn = null; player.pendingDoor = null; player.pendingPick = null; }
  else {
    // направление — из удерживаемых клавиш берётся последняя нажатая; шаг только по одной оси
    let dx=0, dy=0;
    for(const c of keyOrder){
      if(!keys.has(c)) continue;
      if(c==="KeyW"||c==="ArrowUp"){ dy=-1; break; }
      if(c==="KeyS"||c==="ArrowDown"){ dy=1; break; }
      if(c==="KeyA"||c==="ArrowLeft"){ dx=-1; break; }
      if(c==="KeyD"||c==="ArrowRight"){ dx=1; break; }
    }
    if(dx||dy){
      player.target = null; player.targetNPC = null; player.path = null; player.pendingFurn = null;
      tryStep(player, dx, dy);
    } else if(!dx && !dy && (keys.has("KeyW")||keys.has("KeyA")||keys.has("KeyS")||keys.has("KeyD")||
               keys.has("ArrowUp")||keys.has("ArrowDown")||keys.has("ArrowLeft")||keys.has("ArrowRight"))){
      // keyOrder пуст (например, в тестах) — берём любую удерживаемую клавишу
      if(keys.has("KeyW")||keys.has("ArrowUp")) dy=-1; else if(keys.has("KeyS")||keys.has("ArrowDown")) dy=1;
      else if(keys.has("KeyA")||keys.has("ArrowLeft")) dx=-1; else dx=1;
      player.target = null; player.targetNPC = null; player.path = null; player.pendingFurn = null;
      tryStep(player, dx, dy);
    } else if(player.targetNPC || player.target){
      if(player.targetNPC){
        const dn = Math.hypot(player.targetNPC.x-player.x, player.targetNPC.y-player.y);
        if(dn < 2.5){ const n = player.targetNPC; player.targetNPC=null; player.target=null; player.path=null; openChat(n); }
        else {
          player.repath = (player.repath||0) - dt;
          if(player.repath <= 0){
            player.repath = 0.5;
            player.path = findPath(player.x, player.y, player.targetNPC.x, player.targetNPC.y);
          }
        }
      }
      if(player.targetNPC || player.target){
        if(!player.step){
          if(player.path && player.path.length){
            if(!stepAlong(player, player.path[0])){
              // упёрся (путь устарел) — перекладываем
              const g2 = player.targetNPC || player.target;
              const np = findPath(player.x, player.y, g2.x, g2.y);
              if(np && np.length) player.path = np;
              else { player.target=null; player.targetNPC=null; player.path=null; arrivePlayer(); }
            }
          } else {
            // путь кончился — дошли до ближайшей клетки к цели
            player.target = null; player.path = null;
            arrivePlayer();
          }
        }
      }
    }
  }
  if(player.step){ player.anim += dt*10; player.moving = true; }
  advanceStep(player, dt);
  if(!player.step && player.path && player.path.length &&
     Math.hypot(player.path[0].x-player.x, player.path[0].y-player.y) < 0.05) player.path.shift();
}
// дошли до цели клика: открыть сундук/дверь/меню предмета, к которому шли
function arrivePlayer(){
  if(player.pendingFurn){
    const k = player.pendingFurn; player.pendingFurn = null;
    const [fx,fy] = k.split(",").map(Number);
    if(Math.hypot(player.x-(fx+1), player.y-(fy+1)) < 4.4 && tryFurn(k)) openInvWin({kind:"furn", ref:k});
  }
  if(player.pendingDoor){
    const k = player.pendingDoor; player.pendingDoor = null;
    tryDoor(k);
  }
  if(player.pendingPick){
    const k = player.pendingPick; player.pendingPick = null;
    const [fx,fy] = k.split(",").map(Number);
    if(Math.hypot(player.x-(fx+1), player.y-(fy+1)) < 4.4) openGroundMenu(fx,fy);
  }
}
function updateDoors(dt){
  // двери: плавно открываются, когда к ним подходит игрок или любой NPC,
  // и закрываются следом
  for(const [dx,dy] of DOOR_TILES){
    const k = dx+","+dy;
    let near = Math.hypot(player.x-(dx+1), player.y-(dy+.5)) < 3.4;
    if(!near) for(const n of NPCS)
      if(Math.hypot(n.x-(dx+1), n.y-(dy+.5)) < 3.4){ near = true; break; }
    const open = !doorLocked(dx,dy) && near;
    doorsWish[k] = open;
  }
  // плавное открытие/закрытие дверей: ease-in-out (разгон и мягкая остановка),
  // без рывка на последних кадрах; закрывается заметно медленнее, чем открывается
  for(const k in doorsWish){
    const open = doorsWish[k];
    const sp = (open ? 3.0 : 2.2) * dt;
    let a = doorAnim[k]||0;
    if(open) a = Math.min(1, a + sp); else a = Math.max(0, a - sp);
    if(!open && a <= 0) delete doorAnim[k]; else doorAnim[k] = a;
  }
}
function updateNPCs(dt, now){
  for(const n of NPCS){
    syncGrid(n);
    if(n.state==="follow"){
      if(now > n.followUntil){ n.state="wander"; n.tx=n.x; n.ty=n.y; n.path=null; }
      const d = Math.hypot(player.x-n.x, player.y-n.y);
      if(d > 2.5){
        // следовать тоже по A* — иначе NPC упирается в стену дома, когда игрок её обошёл
        n.repath = (n.repath||0) - dt;
        if(n.repath <= 0){
          n.repath = 0.5;
          n.path = findPath(n.x, n.y, player.x, player.y);
        }
        if(!n.step && n.path && n.path.length && !stepAlong(n, n.path[0])) n.path = null;
      } else if(!n.step){
        n.dir = faceDir(player.x-n.x, player.y-n.y, n.dir);
      }
    } else if(n.state==="move" || n.state==="wander"){
      const gtx = Math.round(n.tx)-1, gty = Math.round(n.ty-0.5);
      if((!n.path || !n.path.length) && (gtx!==n.gx || gty!==n.gy)){
        n.path = findPath(n.x, n.y, n.tx, n.ty);
        if(!n.path){ n.tx=n.x; n.ty=n.y; n.chore=null; } // цель недостижима — сброс
      }
      if(!n.step && n.path && n.path.length){
        if(!stepAlong(n, n.path[0])){
          // упёрся в перекрывшийся путь — цель сбрасываем, дальше wander сам найдёт новую
          n.path = null; n.tx=n.x; n.ty=n.y; n.chore=null;
          if(n.state==="move") n.state="wander";
        }
      }
      if((!n.path || !n.path.length) && n.gx===gtx && n.gy===gty){
        if(n.state==="move") n.state = "wander";
        if(n.chore){ setFurnLocked(n.chore, Math.random()<0.5); n.chore=null; } // дошёл до своего хранилища — открыл/закрыл
      }
      // wander: новая цель по таймеру (1.5-5 c). Ключевое: NPC всегда «домашний» —
      // цель берётся вокруг дома (не вокруг текущей позиции), иначе за долгий
      // променад он уносится далеко от своих мест и не возвращается.
      // Если путь ещё строится или впереди шаги — цель не подменяем.
      if(n.state==="wander" && !(n.path && n.path.length) && !n.step){
        n.wanderT -= dt;
        if(n.wanderT <= 0){
          n.wanderT = 1.5 + Math.random()*3.5;
          n.chore = null; n.path = null;
          if(Math.random() < 0.3){ // иногда — «проверить хранилище»
            const st = ownStorages(n);
            if(st.length){
              const s = st[(Math.random()*st.length)|0];
              const near = nearestWalkableCenter(s.x, s.y+2);
              if(near){ n.tx = near.x; n.ty = near.y; n.chore = s.k; }
            }
          }
          if(!n.chore){
            for(let tries=0; tries<8; tries++){
              const a = Math.random()*Math.PI*2, r = Math.random()*n.r;
              const tx = Math.round(n.home.x + Math.cos(a)*r), ty = Math.round(n.home.y + Math.sin(a)*r);
              if(blockClear(tx-1,ty)){ n.tx = tx; n.ty = ty+0.5; break; } // цель — центр пятна 2×1
            }
          }
        }
      }
    }
    if(n.step) n.anim = (n.anim||0) + dt*10;
    advanceStep(n, dt);
    if(!n.step && n.path && n.path.length && Math.hypot(n.path[0].x-n.x, n.path[0].y-n.y) < 0.05) n.path.shift();
    if(n.bubble){ n.bubble.t -= dt; if(n.bubble.t<=0) n.bubble=null; }
  }
}
function updateWorld(){
  // вход в дом — событие мира (+1): следим, в каком здании стоит игрок
  {
    const p = placeAt(Math.floor(player.x), Math.floor(player.y));
    const key = p ? p.name : null;
    if(key !== player.inPlace){ player.inPlace = key; if(key) bumpTick(1); }
  }
  // рефлексия: если событий накопилось много (>=3) или старейшее отдалилось (>=8 событий мира) —
  // NPC обновляет знание о мире и может начать действовать (не чаще раза в 5 событий на NPC)
  if(!chatOpen){
    for(const n of NPCS){
      const k = n.know;
      if(k && k.pending.length && (k.pending.length>=3 || worldTick-k.pending[0].t>=8) && worldTick-(n.reflectTick||0)>=5){
        n.reflectTick = worldTick;
        reflect(n).catch(()=>{});
      }
    }
  }
}

/* ============================== ЦИКЛ И ОТРИСОВКА КАДРА ============================== */
function render(now){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.imageSmoothingEnabled = false;
  const vw = innerWidth, vh = innerHeight;
  const tw = MW*TILE, th = MH*TILE;
  const kx = Math.max(0, Math.min(tw - vw, player.x*TILE - vw/2));
  const ky = Math.max(0, Math.min(th - vh, player.y*TILE - vh/2));
  if(cam.x < 0){ cam.x = kx; cam.y = ky; } // первый кадр — сразу на цель, без чёрных полей
  cam.x += (kx-cam.x)*.12; cam.y += (ky-cam.y)*.12;
  if(tw < vw) cam.x = (tw-vw)/2;
  if(th < vh) cam.y = (th-vh)/2;

  ctx.fillStyle = "#0d0f0b"; ctx.fillRect(0,0,vw,vh);
  ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

  const x0 = Math.floor(cam.x/TILE), y0 = Math.floor(cam.y/TILE);
  const x1 = x0 + Math.ceil(vw/TILE) + 2, y1 = y0 + Math.ceil(vh/TILE) + 2;

  // поверхность — тайлами 16px
  for(let y=y0; y<y1; y++) for(let x=x0; x<x1; x++){
    if(x<0 || y<0 || x>=MW || y>=MH){ drawVoidArt(x,y); continue; }
    drawSurfaceArt(surfaceAt(x,y), x, y, now);
  }

  /* Порядок рисования: всё, что стоит на земле (предметы, объекты, сущности),
     сортируется по нижней кромке: у объекта это y+h его пятна, у сущности —
     её «ноги» (y+0.6). Кто южнее — рисуется позже и перекрывает северного:
     игрок за деревом скрыт кроной, но идёт поверх стены, стоя под ней.
     При равных кромках сущность рисуется позже объекта (не прячется в нём). */
  const drawList = [];
  for(const o of OBJECTS){
    if(o.x+o.w < x0 || o.x >= x1 || o.y+o.h < y0 || o.y >= y1) continue;
    drawList.push({y:o.y+o.h, ent:0, f:()=>drawObjArt(o, now)});
  }
  for(const g of ground){
    if(g.x+2 < x0 || g.x >= x1 || g.y+2 < y0 || g.y >= y1) continue;
    drawList.push({y:g.y+2, ent:0, f:()=>drawGroundItem(g, now)});
  }
  for(const n of NPCS) drawList.push({y:n.y+0.6, ent:1, f:()=>{ drawHuman(n,n.shirt,n.skin,n.hair,false); drawNPCLabel(n); }});
  drawList.push({y:player.y+0.6, ent:1, f:()=>drawHuman(player,"#4a6a3a","#e0b088","#4a3520",true)});
  drawList.sort((a,b)=> a.y-b.y || a.ent-b.ent).forEach(o=>o.f());
  for(const n of NPCS) drawBubble(n);

  ctx.restore();

  // виньетка привязана к диагонали — при любом размере окна края затемняются
  // одинаково слабо и не превращаются в светлые/тёмные «полосы»
  const diag = Math.hypot(vw, vh);
  const vg = ctx.createRadialGradient(vw/2, vh/2, diag*0.45, vw/2, vh/2, diag*0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(12,9,6,0.30)");
  ctx.fillStyle = vg; ctx.fillRect(0,0,vw,vh);

  const near = chatOpen ? null : nearNPC();
  const pr = el("prompt");
  if(near){ pr.classList.remove("hidden"); el("promptName").textContent = near.name; }
  else pr.classList.add("hidden");
}

let last = performance.now();
function loop(t){
  const dt = Math.min(.05, (t-last)/1000); last = t;
  const now = t/1000;
  update(dt, now);
  render(now);
  requestAnimationFrame(loop);
}

/* ---- отладочные хуки URL ---- */
const qp = name => new URLSearchParams(location.search).get(name);
// телепорт: ?tp=x,y
const tpP = qp("tp");
if(tpP){
  const [tx, ty] = tpP.split(",").map(Number);
  const gy = Math.round(ty-0.5);
  if(blockClear(tx-1, gy)){ player.gx=tx-1; player.gy=gy; player.x=tx; player.y=gy+0.5; }
}
// путь мышью: ?goto=x,y
const gotoP = qp("goto");
if(gotoP){
  const [gx, gy] = gotoP.split(",").map(Number);
  if(blockClear(gx-1, Math.round(gy-0.5))){
    player.target = {x:gx, y:gy};
    player.path = findPath(player.x, player.y, gx, gy);
  }
}
// профиль LLM: ?llm=0|1
const llmIdx = qp("llm");
if(llmIdx !== null && LCFGS[llmIdx|0]){
  const p = LCFGS[llmIdx|0];
  localStorage.setItem("veront_llm", JSON.stringify({profile:p.name, base:p.endpoint, model:p.model, key:p.apiKey, reasoning:getSettings().reasoning||""}));
}
// автооткрытие чата: ?chat (&q=текст||текст — автоотправка реплик, &journal — открыть журнал)
if(location.search.includes("chat")) setTimeout(async ()=>{
  openChat(NPCS[0]);
  const q = qp("q");
  if(q){
    for(const part of q.split("||")){
      await doSend(NPCS[0], part.trim());
      await new Promise(r=>setTimeout(r,400));
    }
  }
  if(location.search.includes("journal")) toggleJournal();
}, 300);

// стартовый инвентарь для отладки вида: ?inv=axe,herbs,potion
const invP = qp("inv");
if(invP){
  for(const id of invP.split(",")) if(ITEMS[id]) invAdd(player.inv, id, 1);
  saveJSON("veront_inv", player.inv);
}
// окно инвентаря для отладки: ?invwin (характеристики), ?invwin=npc (собеседник), ?furn=x,y (мебель)
if(location.search.includes("invwin")) setTimeout(()=>{
  const v = qp("invwin");
  openInvWin(v==="npc" ? {kind:"npc", ref:NPCS[0]} : null);
}, 600);
const furnP = qp("furn");
if(furnP) setTimeout(()=>openInvWin({kind:"furn", ref:furnP}), 600);
// предметы на земле для отладки вида: ?ground=x,y:id;x,y:id
const grP = qp("ground");
if(grP){
  for(const part of grP.split(";")){
    const [c, id] = part.split(":");
    const [gx,gy] = c.split(",").map(Number);
    if(ITEMS[id] && !groundAt(gx,gy)) ground.push({id, x:gx, y:gy});
  }
  saveGround();
}
// открытая дверь под игроком для отладки вида: ?door=x,y
const doorP = qp("door");
if(doorP){
  const [dx,dy] = doorP.split(",").map(Number);
  doorAnim[dx+","+dy] = 1;
  player.gx = dx; player.gy = dy+1; player.x = dx+1; player.y = dy+1.5;
}
// начальная «локация» игрока — чтобы вход в дом считался событием только при пересечении
{
  const p = placeAt(Math.floor(player.x), Math.floor(player.y));
  player.inPlace = p ? p.name : null;
}
updateGold();
updateInvUI();
localStorage.setItem("veront_map_version", MAP_SAVE_VERSION);
requestAnimationFrame(loop);

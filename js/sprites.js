"use strict";
/* ============================== ОТРИСОВКА ==============================
   Весь визуальный слой игры: тайлы поверхности, объекты, сущности, подписи.
   Логики здесь нет — только рисование на canvas по состоянию мира.

   СОГЛАШЕНИЯ
   - Сетка 16×16 px (TILE). Тайловые координаты — ax, ay; пиксели на экране — x, y.
   - Поверхность рисуется тайлами, объекты — своим пятном w×h: один и тот же тип
     меняет картинку по итоговому размеру (камень 1×1, 2×1, 2×2), а «нарисованное»
     пятно может быть больше коллизионного (дерево, указатель).
   - Объект o приходит из мира: x,y — левый верх визуального пятна, w,h — его
     размеры в тайлах; cx,cy,cw,ch — коллизионный прямоугольник внутри пятна
     (справочник типов — js/data/objects.js).
   - time/now — секунды с запуска страницы, нужны только для анимаций
     (вода, качание деревьев, эмодзи на земле).
   - Все основания и тени рисуются на общей «линии земли» — см. GROUND_OFF. */

/** Размер тайла в пикселях (логические пиксели, без учёта DPR). */
const TILE = 16;
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
/** Коэффициент масштабирования под HiDPI-экраны (целое: 1 или 2). */
let DPR = 1;
/** Пересчитывает размер буфера canvas под текущее окно и DPR. Вызывается при старте и на resize. */
function resize(){
  // только целый DPR: при дробном (Windows 125%/150%) тайловые границы попадают
  // на дробные пиксели экрана и браузер размазывает их — по экрану идут «полосы»
  DPR = Math.min(Math.max(1, Math.round(window.devicePixelRatio || 1)), 2);
  cv.width = Math.floor(innerWidth * DPR);
  cv.height = Math.floor(innerHeight * DPR);
}
addEventListener("resize", resize); resize();

/**
 * Детерминированный «шум»: одно и то же (x, y, s) всегда даёт одно и то же число,
 * поэтому трава, тропа и прочая фактура не «мерцают» между кадрами.
 * @param {number} x тайловая координата X
 * @param {number} y тайловая координата Y
 * @param {number} s «семя» — разные детали одного тайла берут разные s, чтобы не совпадать
 * @returns {number} число в диапазоне [0, 1)
 */
function hash(x,y,s){ let h = (x*374761393 + y*668265263 + s*1442695041) >>> 0;
  h = (h ^ (h>>13)) * 1274126177 >>> 0; return (h ^ (h>>16)) / 4294967296; }

/** Палитра игры. Массивы — варианты оттенков одного материала (выбираются по hash). */
const PAL = {
  grass:["#4d7c46","#5c8b53","#3f6a3d","#689a5e"],
  path:["#c2a06b","#a9875a","#d3b784"],
  water:["#35689f","#4a7cb2","#7fa8d4"],
  sand:"#d6c091", foam:"#e8f0f6",
  plaster:"#e8d8b6", plasterShade:"#d3bf95",
  beam:"#6a4a2c", beamLo:"#54381e",
  floor:["#96704a","#7d5c3c","#a5805a"],
  gold:"#e8c76a",
};
/** Символ поверхности — травяной (обычная трава или цветы)? */
const isGrass = t => t==="." || t==="F";
/** Есть ли вода в тайле (x, y)? */
const isWater = (x,y) => surfaceAt(x,y) === "~";

/**
 * Базовый тайл травы: фон + редкие пятна оттенков и отдельные травинки.
 * @param {number} x,y пиксели левого верхнего угла тайла
 * @param {number} tx,ty тайловые координаты (нужны для стабильного «шума»)
 */
function drawGrass(x,y,tx,ty){
  ctx.fillStyle = PAL.grass[0]; ctx.fillRect(x,y,TILE,TILE);
  ctx.fillStyle = PAL.grass[1];
  for(let i=0;i<2;i++){
    const hx = hash(tx,ty,i)*TILE|0, hy = hash(tx,ty,i+20)*TILE|0;
    ctx.fillRect(x+hx, y+hy, 2, 2);
  }
  ctx.fillStyle = PAL.grass[2];
  if(hash(tx,ty,31)>.55){
    const hx = hash(tx,ty,32)*TILE|0, hy = hash(tx,ty,33)*TILE|0;
    ctx.fillRect(x+hx, y+hy, 2, 2);
  }
  if(hash(tx,ty,44)>.82){ // отдельные травинки
    const hx = (hash(tx,ty,45)*12|0)+2, hy = (hash(tx,ty,46)*12|0)+2;
    ctx.fillStyle = PAL.grass[3]; ctx.fillRect(x+hx, y+hy, 1, 3); ctx.fillRect(x+hx+2, y+hy+1, 1, 2);
  }
}

/**
 * «Тёмный лес» за краями карты — чтобы при большом окне вокруг мира
 * была не чёрная пустота, а читаемое продолжение частокола.
 * @param {number} ax,ay тайловые координаты клетки за пределами карты
 */
function drawVoidArt(ax,ay){
  const x = ax*TILE, y = ay*TILE;
  ctx.fillStyle = "#1a2718"; ctx.fillRect(x,y,TILE,TILE);
  ctx.fillStyle = "#141f13";
  if(hash(ax,ay,1)>.45){
    ctx.beginPath();
    ctx.arc(x+8+(hash(ax,ay,2)*8-4), y+8+(hash(ax,ay,3)*8-4), 5+hash(ax,ay,4)*3, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = "#233421";
  if(hash(ax,ay,5)>.7) ctx.fillRect(x+4,y+11,2,2);
  if(hash(ax,ay,6)>.8) ctx.fillRect(x+10,y+5,2,2);
}

/**
 * Тайл поверхности по его символу:
 * "~" — вода (волны, песчаная кромка берега, пенные блики),
 * "," — тропа (трава наступает на неё внахлёст),
 * "H" — дощатый пол, "u" — ковёр с золотым ромбом,
 * "F" — трава с цветами; всё остальное — обычная трава.
 * @param {string} t символ поверхности (из surfaceAt)
 * @param {number} ax,ay тайловые координаты
 * @param {number} time секунды с запуска (анимация волн)
 */
function drawSurfaceArt(t, ax, ay, time){
  const x = ax*TILE, y = ay*TILE;
  if(t==="~"){
    ctx.fillStyle = PAL.water[0]; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = PAL.water[1];
    for(let i=0;i<2;i++)
      ctx.fillRect(x, y + i*8 + 3 + Math.sin(time*2+ax+ay)*1.5, TILE, 2);
    ctx.fillStyle = PAL.water[2];
    if(hash(ax,ay,9) > .72) ctx.fillRect(x+4,y+6,4,2);
    // песчаная кромка берега + пенные блики
    ctx.fillStyle = PAL.sand;
    if(!isWater(ax,ay-1)) ctx.fillRect(x,y,TILE,4);
    if(!isWater(ax,ay+1)) ctx.fillRect(x,y+TILE-4,TILE,4);
    if(!isWater(ax-1,ay)) ctx.fillRect(x,y,4,TILE);
    if(!isWater(ax+1,ay)) ctx.fillRect(x+TILE-4,y,4,TILE);
    ctx.fillStyle = PAL.foam;
    if(!isWater(ax,ay-1)) for(let i=0;i<2;i++) ctx.fillRect(x+(hash(ax,ay,i)*12|0), y+4, 3, 1);
    if(!isWater(ax,ay+1)) for(let i=0;i<2;i++) ctx.fillRect(x+(hash(ax,ay,i+9)*12|0), y+TILE-5, 3, 1);
  } else if(t===","){
    ctx.fillStyle = PAL.path[0]; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = PAL.path[1];
    for(let i=0;i<3;i++){
      const hx = hash(ax,ay,i)*TILE|0, hy = hash(ax,ay,i+40)*TILE|0;
      ctx.fillRect(x+hx, y+hy, 2, 2);
    }
    ctx.fillStyle = PAL.path[2];
    if(hash(ax,ay,11)>.6) ctx.fillRect(x+2,y+2,2,2);
    // трава наступает на тропу внахлёст
    ctx.fillStyle = PAL.grass[0];
    if(isGrass(surfaceAt(ax,ay-1))) for(let i=0;i<3;i++) if(hash(ax,ay,i+50)>.45) ctx.fillRect(x+i*5+(hash(ax,ay,i+51)*3|0), y, 3, 2);
    if(isGrass(surfaceAt(ax,ay+1))) for(let i=0;i<3;i++) if(hash(ax,ay,i+60)>.45) ctx.fillRect(x+i*5+(hash(ax,ay,i+61)*3|0), y+TILE-2, 3, 2);
  } else if(t==="H"){
    ctx.fillStyle = PAL.floor[0]; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = PAL.floor[1];
    for(let i=0;i<2;i++) ctx.fillRect(x, y+i*8+7, TILE, 1);
    ctx.fillRect(x+((ax*13+ay*7)%12)+2, y+(ay%2)*8, 1, 8); // стык досок
    if(hash(ax,ay,7)>.7){ ctx.fillStyle = PAL.floor[2]; ctx.fillRect(x+(hash(ax,ay,8)*12|0)+2, y+(hash(ax,ay,9)*12|0)+2, 3, 2); }
  } else if(t==="u"){
    ctx.fillStyle = PAL.floor[0]; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = "#8a3b4e"; ctx.fillRect(x+1,y+1,TILE-2,TILE-2);
    ctx.fillStyle = "#6e2c3c";
    ctx.fillRect(x+1,y+1,TILE-2,2); ctx.fillRect(x+1,y+TILE-3,TILE-2,2);
    ctx.fillRect(x+1,y+1,2,TILE-2); ctx.fillRect(x+TILE-3,y+1,2,TILE-2);
    ctx.fillStyle = PAL.gold; // ромб по центру
    ctx.fillRect(x+7,y+7,2,2);
  } else if(t==="F"){
    drawGrass(x,y,ax,ay);
    const cols = ["#e8e05a","#d96a8f","#e6e9f0","#b07ad0"];
    for(let i=0;i<2;i++){
      const fx = x+3+(hash(ax,ay,i)*10|0), fy = y+4+(hash(ax,ay,i+60)*8|0);
      ctx.fillStyle = PAL.grass[2]; ctx.fillRect(fx+1,fy+2,1,3);
      ctx.fillStyle = cols[(hash(ax,ay,i+70)*4)|0]; ctx.fillRect(fx,fy,3,3);
      ctx.fillStyle = "#fff7d8"; ctx.fillRect(fx+1,fy+1,1,1);
    }
  } else {
    drawGrass(x,y,ax,ay);
  }
}

/**
 * Стена дома: линия толщиной ровно в тайл, стыкуется с соседними сегментами —
 * балочный каркас рисуется со стороны соседних стен, одинокий тайл — рамка со всех сторон.
 * @param {number} ax,ay тайловые координаты клетки
 */
function drawWallCell(ax, ay){
  const x = ax*TILE, y = ay*TILE;
  const left  = lowerAt(ax-1,ay) === "#";
  const right = lowerAt(ax+1,ay) === "#";
  const up    = lowerAt(ax,ay-1) === "#";
  const down  = lowerAt(ax,ay+1) === "#";
  const horiz = left || right;
  const vert  = up || down;

  ctx.fillStyle = PAL.plaster;
  ctx.fillRect(x,y,TILE,TILE);

  ctx.fillStyle = PAL.plasterShade;
  ctx.fillRect(x,y+TILE-2,TILE,2);

  ctx.fillStyle = PAL.beam;
  if(horiz){
    ctx.fillRect(x,y,TILE,2);
    ctx.fillRect(x,y+TILE-2,TILE,2);
  }
  if(vert){
    ctx.fillRect(x,y,2,TILE);
    ctx.fillRect(x+TILE-2,y,2,TILE);
  }
  if(!horiz && !vert){
    ctx.fillRect(x,y,TILE,2);
    ctx.fillRect(x,y+TILE-2,TILE,2);
    ctx.fillRect(x,y,2,TILE);
    ctx.fillRect(x+TILE-2,y,2,TILE);
  }

  ctx.fillStyle = "rgba(0,0,0,.16)";
  if(horiz) ctx.fillRect(x,y+TILE-1,TILE,1);
  if(vert)  ctx.fillRect(x+TILE-1,y,1,TILE);
}

/* ============================== ОБЪЕКТЫ ==============================
   Вид зависит от пятна объекта: одиночный камень, пара, глыба 2×2 — разные картинки.
   Функция рисования типа задаётся в справочнике OBJ_DEF (js/data/objects.js). */
/** Справочник «имя из поля draw в OBJ_DEF → рисовальщик». */
const OBJ_DRAW = {
  drawWallCell: (o) => drawWallCell(o.x, o.y),
  drawRoof, drawRock, drawSign, drawForest, drawTree, drawDoor, drawFence,
  drawAnvil, drawBed, drawTable, drawChest, drawShelf,
};
/**
 * Рисует объект, выбирая функцию рисования по его типу (OBJ_DEF[o.t].draw).
 * @param {object} o объект мира (x,y,w,h,cx,cy,cw,ch,t)
 * @param {number} time секунды с запуска (для анимированных объектов)
 */
function drawObjArt(o, time){
  const f = OBJ_DRAW[OBJ_DEF[o.t].draw];
  if(f) f(o, time);
}

// общая линия земли: ноги сущности — центр ряда +11px, то есть на 3 px НИЖЕ
// нижней кромки коллизионного ряда; все основания и тени объектов рисуются там же
const GROUND_OFF = -3;

/**
 * Крыша — один объект на весь прямоугольник дома.
 * "R" — красная черепица, "r" — серая; швы вразбежку, свес с тенью снизу.
 * @param {object} o объект крыши (w,h покрывают весь дом)
 */
function drawRoof(o){
  const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
  const red = o.t === "R";
  ctx.fillStyle = red ? "#b8503f" : "#5d6b7a"; ctx.fillRect(x,y,w,h);
  ctx.fillStyle = red ? "#8f3a2c" : "#46525e";
  for(let i=0;i<h/8;i++) ctx.fillRect(x, y+i*8+6, w, 2);
  for(let i=0;i<w/8;i++){ // вертикальные швы черепицы вразбежку
    const sx = ((i%2)*8 + (hash(o.x+i,o.y,3)*8|0)) % w;
    ctx.fillRect(x+sx, y+(i%2)*8, 1, 6);
  }
  ctx.fillStyle = red ? "#cf6a58" : "#75849a"; ctx.fillRect(x,y,w,3);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x,y+h-2,w,2); // свес
}

/**
 * Камень: картинка подстраивается под размер пятна (1×1, 2×1, 2×2),
 * низ — по линии земли. У большой глыбы (≥2×2) — отдельный выступ-«склейка».
 * @param {object} o объект камня
 */
function drawRock(o){
  const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
  const bb = y + h - GROUND_OFF; // линия земли
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath(); ctx.ellipse(x+w/2, bb, w*0.40, Math.max(3,h*0.12), 0, 0, 7); ctx.fill();
  const big = w>=2*TILE && h>=2*TILE;
  const top = y+Math.round(h*0.25), bh = bb-2-top;
  ctx.fillStyle = "#6f7378";
  ctx.beginPath(); ctx.roundRect(x+2, top, w-4, bh, big?7:4); ctx.fill();
  ctx.fillStyle = "#8b9096";
  ctx.beginPath(); ctx.roundRect(x+Math.round(w*0.18), y+Math.round(h*0.18), Math.round(w*0.5), Math.round(h*0.38), big?6:3); ctx.fill();
  ctx.fillStyle = "#4e5257";
  ctx.fillRect(x+Math.round(w*0.6), y+Math.round(h*0.5), Math.round(w*0.28), Math.round(h*0.28));
  ctx.fillStyle = "#a7adb3";
  ctx.fillRect(x+Math.round(w*0.25), y+Math.round(h*0.22), big?5:3, 2);
  if(big){ // у большой глыбы — отдельный выступ, чтобы читалась «склейка»
    ctx.fillStyle = "#5d6166";
    ctx.beginPath(); ctx.roundRect(x+w-12, bb-13, 9, 11, 3); ctx.fill();
  }
}

/**
 * Указатель: доска 2×3 над одним тайлом-основанием.
 * Доска шире клетки (свес допустим), но стойка, тень и основание — на коллизионной клетке.
 * @param {object} o объект указателя (vw=2, vh=3, cw=1, ch=1)
 */
function drawSign(o){
  const x = o.x*TILE, y = o.y*TILE, h = o.h*TILE;
  const bx = x + (o.cx - o.x + 0.5) * TILE; // стойка по центру коллизионной клетки
  ctx.fillStyle = "rgba(0,0,0,.2)";
  ctx.beginPath(); ctx.ellipse(bx, y+h-GROUND_OFF, 8, 3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#6b4a2b"; ctx.fillRect(bx-2, y+10, 4, h-GROUND_OFF-10);
  ctx.fillStyle = "#54381e"; ctx.fillRect(bx-2, y+10, 1, h-GROUND_OFF-10);
  // доска шире клетки (свес допустим), но стойка, тень и основание — на коллизионной клетке
  ctx.fillStyle = "#9c7b4f"; ctx.fillRect(bx-11, y+2, 22, 12);
  ctx.fillStyle = "#b08d5c"; ctx.fillRect(bx-11, y+2, 22, 2);
  ctx.fillStyle = "#5d4630"; ctx.fillRect(bx-8, y+6, 10, 2); ctx.fillRect(bx-8, y+9, 7, 2);
}

/**
 * Плотный лес: граница мира — колючий частокол крон по всему пятну,
 * нижняя кромка леса — по линии земли.
 * @param {object} o объект леса (w,h — всё пятно)
 */
function drawForest(o){
  const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
  ctx.fillStyle = "#27401f"; ctx.fillRect(x,y,w,h);
  for(let ty=0; ty<o.h; ty++) for(let tx=0; tx<o.w; tx++){
    const ax = o.x+tx, ay = o.y+ty;
    ctx.fillStyle = "#1d3318";
    ctx.beginPath(); ctx.arc(ax*TILE+8+(hash(ax,ay,2)*8-4), ay*TILE+8+(hash(ax,ay,3)*8-4), 6+hash(ax,ay,4)*3, 0, 7); ctx.fill();
    ctx.fillStyle = "#35562b";
    if(hash(ax,ay,5)>.55) ctx.fillRect(ax*TILE+3, ay*TILE+3, 4, 3);
    if(hash(ax,ay,6)>.75) ctx.fillRect(ax*TILE+10, ay*TILE+11, 3, 2);
  }
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x,y+h-GROUND_OFF,w,2); // кромка леса по линии земли
}

/**
 * Дерево: крона 2×2, ствол и тень — по центру коллизионного ряда 2×1.
 * Крона слегка покачивается; ствол центрирован над коллизионным рядом.
 * @param {object} o объект дерева (vw=2, vh=2, cw=2, ch=1)
 * @param {number} time секунды с запуска (фаза покачивания)
 */
function drawTree(o, time){
  const x = o.x*TILE, y = o.y*TILE;
  // центр нижнего края ствола: середина коллизионного ряда, абсолютные координаты
  const bx = x + (o.cx - o.x + o.cw/2) * TILE, by = y + (o.cy - o.y + 1) * TILE - GROUND_OFF;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(bx, by, 11, 4, 0, 0, 7); ctx.fill();
  const sw = Math.sin(time*1.3 + o.x*0.7 + o.y*0.4)*1.2;
  ctx.fillStyle = "#6b4a2b"; ctx.fillRect(bx-3, by-15, 6, 15);
  ctx.fillStyle = "#54381e"; ctx.fillRect(bx-3, by-15, 2, 15);
  // крона центрирована над стволом
  const cx = bx, cy = by - TILE*1.25;
  ctx.fillStyle = "#274f2b"; ctx.beginPath(); ctx.arc(cx+sw, cy, 13, 0, 7); ctx.fill();
  ctx.fillStyle = "#356b36"; ctx.beginPath(); ctx.arc(cx-5+sw, cy-3, 8, 0, 7); ctx.arc(cx+6+sw, cy-1, 7, 0, 7); ctx.fill();
  ctx.fillStyle = "#4c8f4c"; ctx.beginPath(); ctx.arc(cx-2+sw, cy-7, 5, 0, 7); ctx.fill();
  ctx.fillStyle = "#5fa355"; ctx.fillRect(cx-4+sw, cy-9, 4, 3);
}

/**
 * Дверь: 2×1 в тонкой стене. Перспектива, не вид сверху: створка на левой
 * петле «отваливается» на камеру — горизонталь укорачивается (cos),
 * ближний край опускается и становится крупнее (ниже — ближе к зрителю).
 * @param {object} o объект двери; состояние берётся из doorAnim (0..1) и doorLocked
 * @param {number} time секунды с запуска (в расчёте не участвует — анимация идёт через doorAnim)
 */
function drawDoor(o, time){
  const x = o.x*TILE, y = o.y*TILE;
  const a = doorAnim[o.x+","+o.y]||0, locked = doorLocked(o.x,o.y);
  const quad = (x1,y1,x2,y2,x3,y3,x4,y4) => {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
    ctx.lineTo(x3,y3); ctx.lineTo(x4,y4); ctx.closePath(); ctx.fill();
  };
  ctx.fillStyle = PAL.plaster; ctx.fillRect(x,y,2*TILE,TILE);
  ctx.fillStyle = PAL.beam;
  ctx.fillRect(x,y,2*TILE,2); ctx.fillRect(x,y+TILE-2,2*TILE,2);
  ctx.fillRect(x,y,2,TILE); ctx.fillRect(x+2*TILE-2,y,2,TILE);
  ctx.fillStyle = PAL.beamLo; ctx.fillRect(x+3,y+2,26,12); // коробка
  // проём: закрытый — тёмный, открытый — светлый пол за дверью
  if(a > 0.05){
    ctx.fillStyle = PAL.floor[0]; ctx.fillRect(x+5,y+3,22,10);
    ctx.fillStyle = PAL.floor[1];
    ctx.fillRect(x+5,y+6,22,1); ctx.fillRect(x+5,y+10,22,1);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x+5,y+3,22,2); // тень от притолоки
  } else {
    ctx.fillStyle = "#241a10"; ctx.fillRect(x+5,y+3,22,10);
  }
  // створка: a=0 лежит в проёме, a=1 открыта на ~50° на зрителя —
  // панель остаётся широкой, а не схлопывается в «палку»
  const th = a * 0.9;
  const cs = Math.cos(th), sn = Math.sin(th);
  const hx = x+5, hy0 = y+3, hy1 = y+13, L = 22, e = 4*sn;
  const fx = hx + L*cs;                 // свободный край: укорочен перспективой
  const fy0 = hy0 + L*sn*0.8 - e;       // его верх опущен и приподнят за счёт близости
  const fy1 = hy1 + L*sn*1.2 + e;       // низ — сильнее: ближний край крупнее
  // тень полотна на полу/траве
  ctx.fillStyle = "rgba(0,0,0,.18)";
  quad(hx+2, hy0+4, fx+3, fy0+4, fx+3, fy1+4, hx+2, hy1+4);
  // контур и полотно
  ctx.fillStyle = "#241a10";
  quad(hx-1, hy0-1, fx+1, fy0-1, fx+1, fy1+1, hx-1, hy1+1);
  ctx.fillStyle = "#75512b";
  quad(hx, hy0, fx, fy0, fx, fy1, hx, hy1);
  // светлая верхняя кромка — грань полотна
  ctx.fillStyle = "#8a6238";
  quad(hx, hy0, fx, fy0, fx, fy0+2, hx, hy0+2);
  // доски параллельно краю петли
  if(a < 0.6){
    ctx.fillStyle = "#5d3a1e";
    for(const f of [0.33, 0.66]){
      const px0 = hx + L*f, px1 = hx + L*f*cs;
      quad(px0-1, hy0, px0+1, hy0, px1+1, fy1, px1-1, fy1);
    }
  }
  // ручка на свободном краю
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(Math.round(fx)-4, Math.round((fy0+fy1)/2)-1, 2, 2);
  if(locked && a<.05){ // железная полоса с замком — дверь заперта
    ctx.fillStyle = "#3a3f46"; ctx.fillRect(x+5,y+7,22,3);
    ctx.fillStyle = "#22262b"; ctx.fillRect(x+14,y+7,4,5);
    ctx.fillStyle = PAL.gold; ctx.fillRect(x+15,y+8,2,2);
  }
  ctx.fillStyle = "#b9a06f"; ctx.fillRect(x+5,y+TILE-GROUND_OFF,22,1); // порог по линии земли
}

/**
 * Забор: один объект на весь ряд — сплошные перекладины, столб в каждом тайле.
 * Ряд может быть горизонтальным (w×1) или вертикальным (1×h).
 * @param {object} o объект забора
 */
function drawFence(o){
  const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
  if(o.h === 1){
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(x+w/2, y+h-GROUND_OFF, w*0.45, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#6b4a2b";
    for(let i=0; i<o.w; i++){ ctx.fillRect(x+i*TILE+5, y+4, 6, h-GROUND_OFF-4); }
    ctx.fillStyle = "#8a6238";
    ctx.fillRect(x, y+6, w, 3);
    ctx.fillRect(x, y+12, w, 3);
    ctx.fillStyle = "#54381e";
    for(let i=0; i<o.w; i++){ ctx.fillRect(x+i*TILE+5, y+4, 1, h-GROUND_OFF-4); }
    ctx.fillStyle = "#a8814f";
    ctx.fillRect(x, y+6, w, 1);
    ctx.fillRect(x, y+12, w, 1);
  } else {
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(x+w/2, y+h-GROUND_OFF, w*0.45, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#6b4a2b";
    for(let i=0; i<o.h; i++){ ctx.fillRect(x+4, y+i*TILE+5, w-8, 6); }   // столбы
    ctx.fillStyle = "#8a6238";
    ctx.fillRect(x+5, y, 3, h-GROUND_OFF);                               // продольные
    ctx.fillRect(x+11, y, 3, h-GROUND_OFF);
    ctx.fillStyle = "#54381e";
    for(let i=0; i<o.h; i++){ ctx.fillRect(x+4, y+i*TILE+5, w-8, 1); }
    ctx.fillStyle = "#a8814f";
    ctx.fillRect(x+5, y, 1, h-GROUND_OFF);
    ctx.fillRect(x+11, y, 1, h-GROUND_OFF);
  }
}

/** Наковальня на деревянной колоде; низ — по общей линии земли. */
function drawAnvil(o){
  const x = o.x*TILE, y = o.y*TILE + 8; // низ — по общей линии земли (низ ряда +3)
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x+16,y+27,10,4,0,0,7); ctx.fill();
  ctx.fillStyle = "#6b4a2b"; ctx.fillRect(x+11,y+22,10,5);
  ctx.fillStyle = "#54381e"; ctx.fillRect(x+11,y+22,10,2);
  ctx.fillStyle = "#555c66"; ctx.fillRect(x+5,y+12,22,7);
  ctx.fillStyle = "#767e8a"; ctx.fillRect(x+5,y+12,22,2);
  ctx.fillStyle = "#474d56"; ctx.fillRect(x+2,y+13,4,4);
}
/** Кровать: тёмный контур (мебель не сливается с полом), одеяло и подушка. */
function drawBed(o){
  const x = o.x*TILE, y = o.y*TILE + 8;
  ctx.fillStyle = "#241a0f"; ctx.fillRect(x+2,y+4,28,23); // контур — мебель не сливается с полом
  ctx.fillStyle = "#4a2f1d"; ctx.fillRect(x+3,y+5,26,22);
  ctx.fillStyle = "#33200f"; ctx.fillRect(x+3,y+5,26,3);
  ctx.fillStyle = "#e8e0cc"; ctx.fillRect(x+6,y+9,20,17);
  ctx.fillStyle = "#a83a4a"; ctx.fillRect(x+6,y+14,20,11);
  ctx.fillStyle = "#7e2a38"; ctx.fillRect(x+6,y+14,20,2);
  ctx.fillStyle = "#f7f2e4"; ctx.fillRect(x+7,y+10,8,4);
  ctx.fillStyle = PAL.gold; ctx.fillRect(x+6,y+24,20,1);
}
/** Стол: светлая столешница, ножки, синяя тарелка. */
function drawTable(o){
  const x = o.x*TILE, y = o.y*TILE + 8;
  ctx.fillStyle = "#241a0f"; ctx.fillRect(x+2,y+5,28,22);
  ctx.fillStyle = "#3a2a18"; ctx.fillRect(x+6,y+10,4,17); ctx.fillRect(x+22,y+10,4,17);
  ctx.fillStyle = "#c9b28a"; ctx.fillRect(x+3,y+7,26,10); // светлая столешница
  ctx.fillStyle = "#e0cda6"; ctx.fillRect(x+3,y+7,26,3);
  ctx.fillStyle = "#8a6f4d"; ctx.fillRect(x+3,y+15,26,2);
  ctx.fillStyle = "#3e6b8f"; ctx.beginPath(); ctx.arc(x+16,y+11,3,0,7); ctx.fill(); // синяя тарелка
}
/** Сундук: запертый — с висячим замком, открытый — с тёмным проёмом приоткрытой крышки. */
function drawChest(o){
  const x = o.x*TILE, y = o.y*TILE + 8, k = o.x+","+o.y;
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x+16,y+27,11,4,0,0,7); ctx.fill();
  ctx.fillStyle = "#241a0f"; ctx.fillRect(x+4,y+9,24,18); // контур
  ctx.fillStyle = "#3e5d4f"; ctx.fillRect(x+5,y+10,22,17); // крашеный сундук — зелёно-синий
  ctx.fillStyle = "#4f7263"; ctx.fillRect(x+5,y+10,22,6);
  ctx.fillStyle = "#2c443a"; ctx.fillRect(x+5,y+15,22,2);
  ctx.fillStyle = "#2c443a"; ctx.fillRect(x+9,y+10,2,17); ctx.fillRect(x+21,y+10,2,17);
  ctx.fillStyle = PAL.gold; ctx.fillRect(x+14,y+14,4,5);
  if(furnLocked(k)){
    ctx.fillStyle = "#22262b"; ctx.fillRect(x+13,y+17,6,6); // висячий замок — заперт
    ctx.fillStyle = "#3a3f46"; ctx.fillRect(x+13,y+17,6,2);
    ctx.fillStyle = PAL.gold; ctx.fillRect(x+15,y+19,2,3);
  } else {
    ctx.fillStyle = "#16211c"; ctx.fillRect(x+7,y+11,18,3); // приоткрытая крышка — тёмный проём
  }
}
/** Шкаф: два ряда ярких корешков; запертый — с замком на дверце, открытый — со щелью дверцы. */
function drawShelf(o){
  const x = o.x*TILE, y = o.y*TILE + 8, k = o.x+","+o.y;
  ctx.fillStyle = "#241a0f"; ctx.fillRect(x+5,y+5,22,22);
  ctx.fillStyle = "#3a2a18"; ctx.fillRect(x+6,y+6,20,21);
  ctx.fillStyle = "#2a1c0e"; ctx.fillRect(x+6,y+6,20,2);
  const bk = ["#c05a4a","#4a7ba8","#7aa05a","#d0a84a"]; // яркие корешки
  for(let s=0;s<2;s++){
    const sy = y+9+s*9;
    for(let i=0;i<4;i++){ ctx.fillStyle = bk[(hash(o.x+i,o.y,s*4+i)*4)|0]; ctx.fillRect(x+8+i*4, sy, 3, 7); }
    ctx.fillStyle = "#2a1c0e"; ctx.fillRect(x+6, sy+7, 20, 2);
  }
  if(furnLocked(k)){
    ctx.fillStyle = "#22262b"; ctx.fillRect(x+14,y+17,5,6); // замок на дверце
    ctx.fillStyle = PAL.gold; ctx.fillRect(x+16,y+19,1,3);
  } else {
    ctx.fillStyle = "#12100a"; ctx.fillRect(x+7,y+7,2,21); // приоткрытая дверца
  }
}

/**
 * Человечек (игрок или NPC): контур, ботинки, пояс, лёгкий подпрыгивающий шаг.
 * Глаза смещаются по направлению взгляда (e.dir).
 * @param {object} e сущность: x,y — тайловые координаты, dir, moving, anim (фаза шага)
 * @param {string} shirt цвет рубашки
 * @param {string} skin цвет кожи
 * @param {string} hair цвет волос
 * @param {boolean} isPlayer рисовать ли шляпу игрока
 */
function drawHuman(e, shirt, skin, hair, isPlayer){
  const px = e.x*TILE, py = e.y*TILE;
  const step = e.moving ? Math.sin(e.anim||0)*2 : 0;
  const bob = e.moving ? Math.abs(Math.sin(e.anim||0)) : 0;
  const top = py - bob;
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath();
  ctx.ellipse(px, py+11, 10, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#33291d";
  ctx.fillRect(px-5, top+2+step, 4, 9-step); ctx.fillRect(px+1, top+2-step, 4, 9+step);
  ctx.fillStyle = "#241c12";
  ctx.fillRect(px-5, top+9+step, 4, 2); ctx.fillRect(px+1, top+9-step, 4, 2);
  ctx.fillStyle = "#1d160d"; ctx.fillRect(px-8, top-9, 16, 14); // контур туловища
  ctx.fillStyle = shirt; ctx.fillRect(px-7, top-8, 14, 12);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(px-7, top+1, 14, 3); // пояс
  ctx.fillStyle = skin;
  ctx.fillRect(px-10, top-6+step*.5, 3, 8); ctx.fillRect(px+7, top-6-step*.5, 3, 8);
  ctx.fillStyle = "#1d160d"; ctx.fillRect(px-7, top-21, 14, 14); // контур головы
  ctx.fillStyle = skin; ctx.fillRect(px-6, top-20, 12, 12);
  ctx.fillStyle = hair; ctx.fillRect(px-6, top-21, 12, 5);
  if(isPlayer){ ctx.fillStyle = "#7a5a2e"; ctx.fillRect(px-8, top-22, 16, 3); ctx.fillRect(px-5, top-25, 10, 3); }
  ctx.fillStyle = "#222";
  const ex = e.dir==="left" ? -3 : e.dir==="right" ? 1 : -3;
  const ey = e.dir==="up" ? -16 : -14;
  if(e.dir!=="up"){ ctx.fillRect(px+ex, top+ey, 2, 2); ctx.fillRect(px+ex+4, top+ey, 2, 2); }
}

/**
 * Переносит текст по словам — для «пузырей» речи.
 * @param {string} t исходный текст
 * @param {number} max максимальная длина строки в символах
 * @returns {string[]} не более 3 строк, остальное отбрасывается
 */
function wrapText(t, max){
  const words = t.split(/\s+/); const lines=[]; let cur="";
  for(const w of words){
    if((cur+" "+w).trim().length > max){ if(cur) lines.push(cur); cur=w; }
    else cur = (cur?cur+" ":"")+w;
    if(lines.length>=3) break;
  }
  if(cur && lines.length<3) lines.push(cur);
  return lines;
}
/**
 * «Пузырь мысли» над NPC: тёмный скруглённый, золотая окантовка, без хвостика.
 * Временный emote (n.bubble) перекрывает постоянное состояние (n.status).
 * @param {object} n NPC: x,y, bubble {text, t} или status
 */
function drawBubble(n){
  // временный emote перекрывает постоянное состояние (настроение/желание)
  const text = n.bubble ? n.bubble.text : n.status;
  if(!text) return;
  const lines = wrapText(text, 22);
  ctx.font = "12px 'Segoe UI', sans-serif";
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 18;
  const h = lines.length*15 + 12;
  const bx = n.x*TILE - w/2, by = n.y*TILE - 40 - h;
  ctx.globalAlpha = n.bubble ? Math.min(1, n.bubble.t) : 0.92;
  // «пузырь мысли»: тёмный скруглённый, золотая окантовка, без хвостика —
  // не читается как кусок стены на фоне фасада
  ctx.fillStyle = "rgba(20,14,7,0.88)";
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, 10); ctx.fill();
  ctx.strokeStyle = "rgba(232,199,106,0.55)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bx+.75, by+.75, w-1.5, h-1.5, 9); ctx.stroke();
  ctx.fillStyle = "#f0e2c0";
  lines.forEach((l,i) => ctx.fillText(l, bx+9, by+17+i*15));
  ctx.globalAlpha = 1;
}
/** Табличка над NPC: имя + эмодзи настроения. */
function drawNPCLabel(n){
  ctx.font = "11px 'Pixelify Sans','Segoe UI',sans-serif";
  const label = n.name + " " + n.mood;
  const w = ctx.measureText(label).width;
  const bx = n.x*TILE - w/2 - 5, by = n.y*TILE - 37;
  ctx.fillStyle = "rgba(20,14,7,.85)"; ctx.fillRect(bx, by, w+10, 16);
  ctx.strokeStyle = "#a8814f"; ctx.lineWidth = 1; ctx.strokeRect(bx+.5, by+.5, w+9, 15);
  ctx.fillStyle = "#e8c76a"; ctx.fillText(label, n.x*TILE - w/2, by+12);
}

/**
 * Предмет, лежащий на земле: тень + слегка покачивающаяся иконка (эмодзи из ITEMS).
 * @param {object} g запись предмета на земле: x,y,id
 * @param {number} now секунды с запуска (фаза покачивания)
 */
function drawGroundItem(g, now){
  const x = g.x*TILE, y = g.y*TILE;
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(x+16,y+25,7,3,0,0,7); ctx.fill();
  const bob = Math.sin(now*2.4 + g.x*0.85 + g.y*0.5)*1.5;
  // белый fill перед текстом: монохромный фолбэк эмодзи иначе наследует полупрозрачную тень
  ctx.fillStyle = "#ffffff";
  ctx.font = "16px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ITEMS[g.id].i, x+16, y+17+bob);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

/**
 * Камера в пикселях экрана: x,y — левый верх видимой области мира.
 * x < 0 означает «ещё не инициализирована»: первый кадр встаёт сразу на игрока.
 * Плавно следует за игроком (сглаживание — в render() в main.js).
 */
let cam = {x: -1, y: -1};

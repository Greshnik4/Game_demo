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

/** Палитра игры. Массивы — варианты оттенков одного материала (выбираются по hash).
    Стиль — тёплый «сказочный пиксель»: сочная зелень, мёд и терракота, мягкие тени. */
const PAL = {
  grass:["#578c4f","#6aa060","#487a43","#7ab56c"],
  flower:["#f0df6c","#ea7fa0","#f3f0da","#bd86dd","#7fb2e8"],
  path:["#cbaa74","#b28f5f","#dcc290","#9e7d52"],
  water:["#3d7ab4","#5b93c9","#8fbde4","#b9dcf2"],
  sand:"#dfca9c", sandLo:"#cbb281", foam:"#eef5fa",
  plaster:"#f0e0bd", plasterShade:"#dbc69c", plasterHi:"#f8ecd2",
  beam:"#7a5533", beamLo:"#5e3f22", beamHi:"#96703f",
  floor:["#a37c52","#8a6642","#b58e63"],
  wood:"#8a6238", woodHi:"#a8814f", woodLo:"#5d3a1e", woodDk:"#241a10",
  outline:"#1d160d",
  stone:["#7d8288","#99a0a7","#5c6167","#b3bac1"],
  leaf:["#2f6233","#3f7d41","#57a052","#6db95f"],
  trunk:["#795530","#5b3d20"],
  gold:"#eecb72", goldLo:"#b98f3e",
  roofRed:["#c25b47","#94382b","#dd7a61"],
  roofGray:["#67768a","#4b5866","#8496ad"],
  iron:["#454b54","#2c3138"],
  doorFace:"#9c6f3f", doorPlank:"#7d552f", doorHi:"#b98a52",
  carpet:"#93404f", carpetLo:"#712c3a",
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
  if(hash(tx,ty,44)>.82){ // отдельные травинки: стебелёк + боковой листик
    const hx = (hash(tx,ty,45)*12|0)+2, hy = (hash(tx,ty,46)*12|0)+2;
    ctx.fillStyle = PAL.grass[3]; ctx.fillRect(x+hx, y+hy, 1, 3); ctx.fillRect(x+hx+2, y+hy+1, 1, 2);
  }
  if(hash(tx,ty,90)>.9){ // точечный блик-росинка
    const hx = (hash(tx,ty,91)*14|0)+1, hy = (hash(tx,ty,92)*14|0)+1;
    ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(x+hx, y+hy, 1, 1);
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
    // вода: два тона глубины + две бегущие волновые линии + редкие блики
    ctx.fillStyle = PAL.water[0]; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = PAL.water[1];
    for(let i=0;i<2;i++)
      ctx.fillRect(x, y + i*8 + 3 + Math.sin(time*2+ax+ay)*1.5, TILE, 2);
    ctx.fillStyle = PAL.water[2];
    if(hash(ax,ay,9) > .72){
      const bx = (hash(ax,ay,10)*10|0)+3, by = (hash(ax,ay,11)*10|0)+3;
      ctx.fillRect(x+bx, y+by, 4, 2); ctx.fillRect(x+bx+1, y+by-1, 2, 1);
    }
    // песчаная кромка берега: мокрый песок у воды + пенная линия по фазе волны
    ctx.fillStyle = PAL.sand;
    if(!isWater(ax,ay-1)) ctx.fillRect(x,y,TILE,4);
    if(!isWater(ax,ay+1)) ctx.fillRect(x,y+TILE-4,TILE,4);
    if(!isWater(ax-1,ay)) ctx.fillRect(x,y,4,TILE);
    if(!isWater(ax+1,ay)) ctx.fillRect(x+TILE-4,y,4,TILE);
    ctx.fillStyle = PAL.sandLo;
    if(!isWater(ax,ay-1)) ctx.fillRect(x,y+3,TILE,1);
    if(!isWater(ax,ay+1)) ctx.fillRect(x,y+TILE-4,TILE,1);
    if(!isWater(ax-1,ay)) ctx.fillRect(x+3,y,1,TILE);
    if(!isWater(ax+1,ay)) ctx.fillRect(x+TILE-4,y,1,TILE);
    ctx.fillStyle = PAL.foam;
    const fo = Math.round(Math.sin(time*1.6+ax*0.7+ay*0.9)*1.5);
    if(!isWater(ax,ay-1)) ctx.fillRect(x, y+4+Math.min(1,Math.max(-1,fo)), TILE, 1);
    if(!isWater(ax,ay+1)) ctx.fillRect(x, y+TILE-5-Math.min(1,Math.max(-1,fo)), TILE, 1);
  } else if(t===","){
    ctx.fillStyle = PAL.path[0]; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = PAL.path[1];
    for(let i=0;i<3;i++){
      const hx = hash(ax,ay,i)*TILE|0, hy = hash(ax,ay,i+40)*TILE|0;
      ctx.fillRect(x+hx, y+hy, 2, 2);
    }
    ctx.fillStyle = PAL.path[2];
    if(hash(ax,ay,11)>.6) ctx.fillRect(x+2,y+2,2,2);
    ctx.fillStyle = PAL.path[3]; // редкие тёмные крупинки гравия
    if(hash(ax,ay,12)>.75) ctx.fillRect(x+(hash(ax,ay,13)*14|0)+1, y+(hash(ax,ay,14)*14|0)+1, 1, 1);
    // трава наступает на тропу внахлёст
    ctx.fillStyle = PAL.grass[0];
    if(isGrass(surfaceAt(ax,ay-1))) for(let i=0;i<3;i++) if(hash(ax,ay,i+50)>.45) ctx.fillRect(x+i*5+(hash(ax,ay,i+51)*3|0), y, 3, 2);
    if(isGrass(surfaceAt(ax,ay+1))) for(let i=0;i<3;i++) if(hash(ax,ay,i+60)>.45) ctx.fillRect(x+i*5+(hash(ax,ay,i+61)*3|0), y+TILE-2, 3, 2);
  } else if(t==="H"){
    // дощатый пол: доска на тайл, стык со «швом», лёгкая выработка
    ctx.fillStyle = PAL.floor[0]; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = PAL.floor[1];
    ctx.fillRect(x, y+7, TILE, 1);           // шов между досками
    ctx.fillRect(x+((ax*13+ay*7)%12)+2, y+(ay%2)*8, 1, 7); // поперечный стык
    ctx.fillStyle = PAL.floor[2];
    ctx.fillRect(x, y+8, TILE, 1);           // светлая фаска нижней доски
    if(hash(ax,ay,7)>.7){ ctx.fillRect(x+(hash(ax,ay,8)*12|0)+2, y+(hash(ax,ay,9)*12|0)+2, 3, 2); }
  } else if(t==="u"){
    // ковёр: бордюр со светлой нитью, поле с диагональным узором и золотым ромбом
    ctx.fillStyle = PAL.floor[0]; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = PAL.carpet; ctx.fillRect(x+1,y+1,TILE-2,TILE-2);
    ctx.fillStyle = PAL.carpetLo;
    ctx.fillRect(x+1,y+1,TILE-2,2); ctx.fillRect(x+1,y+TILE-3,TILE-2,2);
    ctx.fillRect(x+1,y+1,2,TILE-2); ctx.fillRect(x+TILE-3,y+1,2,TILE-2);
    ctx.fillStyle = "rgba(255,255,255,.10)"; // диагональная сетка плетения
    for(let i=0;i<4;i++) ctx.fillRect(x+3+i*3, y+3+((i+ay)%4)*2, 1, 1);
    ctx.fillStyle = PAL.gold; // ромб по центру
    ctx.fillRect(x+7,y+7,2,2);
    ctx.fillStyle = PAL.goldLo;
    ctx.fillRect(x+6,y+8,1,1); ctx.fillRect(x+9,y+8,1,1);
  } else if(t==="F"){
    drawGrass(x,y,ax,ay);
    const cols = PAL.flower;
    for(let i=0;i<2;i++){
      const fx = x+3+(hash(ax,ay,i)*10|0), fy = y+4+(hash(ax,ay,i+60)*8|0);
      ctx.fillStyle = PAL.grass[2]; ctx.fillRect(fx+1,fy+2,1,3);   // стебелёк
      ctx.fillStyle = cols[(hash(ax,ay,i+70)*cols.length)|0];
      ctx.fillRect(fx,fy,3,2); ctx.fillRect(fx+1,fy+2,1,1);        // лепестки крестиком
      ctx.fillStyle = "#fff7d8"; ctx.fillRect(fx+1,fy,1,1);        // сердцевина
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
  // фактура штукатурки: редкие вкрапления и светлая «набелка» сверху
  ctx.fillStyle = PAL.plasterShade;
  if(hash(ax,ay,61)>.5) ctx.fillRect(x+(hash(ax,ay,62)*13|0)+1, y+(hash(ax,ay,63)*13|0)+1, 2, 1);
  ctx.fillStyle = PAL.plasterHi;
  ctx.fillRect(x,y,TILE,1);
  ctx.fillRect(x,y+TILE-2,TILE,2);

  ctx.fillStyle = PAL.beam;
  if(horiz){
    ctx.fillRect(x,y,TILE,3);
    ctx.fillRect(x,y+TILE-3,TILE,3);
    ctx.fillStyle = PAL.beamHi;                       // светлая грань бруса сверху
    if(up)   ctx.fillRect(x,y,TILE,1);
    if(down) ctx.fillRect(x,y+TILE-3,TILE,1);
    ctx.fillStyle = PAL.beamLo;
    if(up)   ctx.fillRect(x,y+2,TILE,1);              // тень под верхним брусом
    if(down) ctx.fillRect(x,y+TILE-1,TILE,1);
  }
  if(vert){
    ctx.fillStyle = PAL.beam;
    ctx.fillRect(x,y,3,TILE);
    ctx.fillRect(x+TILE-3,y,3,TILE);
    ctx.fillStyle = PAL.beamHi;
    if(left)  ctx.fillRect(x,y,1,TILE);
    if(right) ctx.fillRect(x+TILE-3,y,1,TILE);
    ctx.fillStyle = PAL.beamLo;
    if(left)  ctx.fillRect(x+2,y,1,TILE);
    if(right) ctx.fillRect(x+TILE-1,y,1,TILE);
  }
  if(!horiz && !vert){ // одинокий тайл — рамка со всех сторон + «сращение» углов
    ctx.fillStyle = PAL.beam;
    ctx.fillRect(x,y,TILE,3); ctx.fillRect(x,y+TILE-3,TILE,3);
    ctx.fillRect(x,y,3,TILE); ctx.fillRect(x+TILE-3,y,3,TILE);
    ctx.fillStyle = PAL.beamLo;
    ctx.fillRect(x+3,y+3,2,2); ctx.fillRect(x+TILE-5,y+3,2,2);
    ctx.fillRect(x+3,y+TILE-5,2,2); ctx.fillRect(x+TILE-5,y+TILE-5,2,2);
  } else {
    ctx.fillStyle = PAL.beamLo; // нагели (чёрточки крепления) на брусьях
    if(horiz && hash(ax,ay,64)>.5) ctx.fillRect(x+7, y+(up?0:TILE-3), 2, 3);
    if(vert  && hash(ax,ay,65)>.5) ctx.fillRect(x+(left?0:TILE-3), y+7, 3, 2);
  }
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
 * "R" — красная черепица, "r" — серая; ряды черепицы с фаской, конёк, свес с тенью.
 * @param {object} o объект крыши (w,h покрывают весь дом)
 */
function drawRoof(o){
  const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
  const red = o.t === "R";
  const c = red ? PAL.roofRed : PAL.roofGray; // [лицо, тень, свет]
  ctx.fillStyle = c[0]; ctx.fillRect(x,y,w,h);
  // ряды черепицы: каждые 8 px — тёмный шов + светлая фаска следующего ряда
  for(let i=0;i<h/8;i++){
    ctx.fillStyle = c[1]; ctx.fillRect(x, y+i*8+6, w, 2);
    if(i*8+8 < h){ ctx.fillStyle = c[2]; ctx.fillRect(x, y+i*8+8, w, 1); }
  }
  ctx.fillStyle = c[1]; // вертикальные стыки черепицы вразбежку
  for(let i=0;i<w/8;i++){
    const sx = ((i%2)*8 + (hash(o.x+i,o.y,3)*8|0)) % w;
    ctx.fillRect(x+sx, y+(i%2)*8, 1, 6);
  }
  ctx.fillStyle = c[2]; ctx.fillRect(x,y,w,3);   // конёк
  ctx.fillStyle = c[1]; ctx.fillRect(x,y+2,w,1);
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
  ctx.fillStyle = PAL.stone[0];
  ctx.beginPath(); ctx.roundRect(x+2, top, w-4, bh, big?7:4); ctx.fill();
  ctx.fillStyle = PAL.stone[1]; // освещённая «шапка»
  ctx.beginPath(); ctx.roundRect(x+Math.round(w*0.18), y+Math.round(h*0.18), Math.round(w*0.5), Math.round(h*0.38), big?6:3); ctx.fill();
  ctx.fillStyle = PAL.stone[2]; // тёмная грань снизу справа
  ctx.fillRect(x+Math.round(w*0.6), y+Math.round(h*0.5), Math.round(w*0.28), Math.round(h*0.28));
  ctx.fillStyle = PAL.stone[3]; // блик
  ctx.fillRect(x+Math.round(w*0.25), y+Math.round(h*0.22), big?5:3, 2);
  if(big){ // у большой глыбы — отдельный выступ, чтобы читалась «склейка»
    ctx.fillStyle = PAL.stone[2];
    ctx.beginPath(); ctx.roundRect(x+w-12, bb-13, 9, 11, 3); ctx.fill();
    ctx.fillStyle = PAL.stone[1]; ctx.fillRect(x+w-10, bb-12, 4, 2);
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
  ctx.fillStyle = PAL.trunk[0]; ctx.fillRect(bx-2, y+10, 4, h-GROUND_OFF-10); // стойка
  ctx.fillStyle = PAL.trunk[1]; ctx.fillRect(bx-2, y+10, 1, h-GROUND_OFF-10);
  ctx.fillStyle = PAL.woodDk; ctx.fillRect(bx-12, y+1, 24, 14);               // контур доски
  ctx.fillStyle = "#9c7b4f";   ctx.fillRect(bx-11, y+2, 22, 12);
  ctx.fillStyle = PAL.woodHi;  ctx.fillRect(bx-11, y+2, 22, 2);               // светлая верхняя планка
  ctx.fillStyle = PAL.woodLo;  ctx.fillRect(bx-11, y+12, 22, 2);              // нижняя планка
  ctx.fillStyle = "#5d4630";   ctx.fillRect(bx-8, y+6, 10, 2); ctx.fillRect(bx-8, y+9, 7, 2); // текст-штрихи
  ctx.fillStyle = PAL.gold;    ctx.fillRect(bx-11, y+4, 1, 1); ctx.fillRect(bx+10, y+4, 1, 1); // гвозди
}

/**
 * Плотный лес: граница мира — колючий частокол крон по всему пятну,
 * нижняя кромка леса — по линии земли.
 * @param {object} o объект леса (w,h — всё пятно)
 */
function drawForest(o){
  const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
  ctx.fillStyle = "#223a1b"; ctx.fillRect(x,y,w,h);
  for(let ty=0; ty<o.h; ty++) for(let tx=0; tx<o.w; tx++){
    const ax = o.x+tx, ay = o.y+ty;
    ctx.fillStyle = "#1b3015"; // глубокая тень между кронами
    ctx.beginPath(); ctx.arc(ax*TILE+8+(hash(ax,ay,2)*8-4), ay*TILE+8+(hash(ax,ay,3)*8-4), 7+hash(ax,ay,4)*3, 0, 7); ctx.fill();
    ctx.fillStyle = "#2c4a22";
    ctx.beginPath(); ctx.arc(ax*TILE+8+(hash(ax,ay,7)*6-3), ay*TILE+7+(hash(ax,ay,8)*6-3), 5+hash(ax,ay,4)*2, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a6130"; // подсветка кроны сверху
    if(hash(ax,ay,5)>.55) ctx.fillRect(ax*TILE+3, ay*TILE+3, 4, 3);
    if(hash(ax,ay,6)>.75) ctx.fillRect(ax*TILE+10, ay*TILE+11, 3, 2);
  }
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x,y+h-GROUND_OFF,w,2); // кромка леса по линии земли
}

/**
 * Дерево: крона из трёх ярусов зелени, ствол с корнями и дуплом, тень — по линии земли.
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
  ctx.fillStyle = PAL.trunk[0]; ctx.fillRect(bx-3, by-15, 6, 15);      // ствол
  ctx.fillStyle = PAL.trunk[1]; ctx.fillRect(bx-3, by-15, 2, 15);      // теневая сторона
  ctx.fillRect(bx-5, by-2, 10, 2);                                     // корни
  ctx.fillStyle = PAL.woodDk; ctx.fillRect(bx+1, by-9, 2, 3);           // дупло
  // крона центрирована над стволом: тёмное ядро → средние лопасти → светлые блики
  const cx = bx, cy = by - TILE*1.25;
  ctx.fillStyle = PAL.leaf[0]; ctx.beginPath(); ctx.arc(cx+sw, cy, 13, 0, 7); ctx.fill();
  ctx.fillStyle = PAL.leaf[1]; ctx.beginPath(); ctx.arc(cx-5+sw, cy-3, 8, 0, 7); ctx.arc(cx+6+sw, cy-1, 7, 0, 7); ctx.fill();
  ctx.fillStyle = PAL.leaf[2]; ctx.beginPath(); ctx.arc(cx-2+sw, cy-7, 5, 0, 7); ctx.fill();
  ctx.fillStyle = PAL.leaf[3]; ctx.fillRect(cx-4+sw, cy-9, 4, 3);
  if(hash(o.x,o.y,80)>.6){ // редкие плоды/листочки-акценты
    ctx.fillStyle = "#d86a52";
    ctx.fillRect(cx+5+sw, cy+2, 2, 2); ctx.fillRect(cx-7+sw, cy-2, 2, 2);
  }
}

/**
 * Дверь: 2×1 в тонкой стене. Стиль — «дверь съезжает в толщу стены»:
 * закрытая створка полностью заполняет проём (щелей нет), при открытии
 * полотно уходит ВЛЕВО вдоль стены и прячется за боковую стойку, справа
 * остаётся тёплый свет прихожей. Никаких «открытых дыр раньше створки».
 * @param {object} o объект двери; состояние берётся из doorAnim (0..1) и doorLocked
 */
function drawDoor(o, time){
  const x = o.x*TILE, y = o.y*TILE;
  const a = doorAnim[o.x+","+o.y]||0, locked = doorLocked(o.x,o.y);
  const ea = a*a*(3-2*a);              // ease-in-out: мягкие старт и финиш
  const INX = x+5, INTOP = y+3, INW = 22, INH = 10; // внутренний проём
  // стена вокруг проёма — как соседние тайлы стены, но без балок поперёк двери
  ctx.fillStyle = PAL.plaster; ctx.fillRect(x,y,2*TILE,TILE);
  ctx.fillStyle = PAL.plasterHi; ctx.fillRect(x,y,2*TILE,1);
  ctx.fillStyle = PAL.beam;
  ctx.fillRect(x,y+TILE-3,2*TILE,3);                          // нижняя обвязка
  ctx.fillRect(x,y,2,TILE); ctx.fillRect(x+2*TILE-2,y,2,TILE); // боковые стойки
  ctx.fillStyle = PAL.beamLo; ctx.fillRect(x,y+TILE-1,2*TILE,1);
  ctx.fillStyle = PAL.beamLo; ctx.fillRect(x+3,y+2,26,12);    // коробка проёма
  // 1) прихожая: тёмная глубина + светлый пол + тёплый свет, струящийся к порогу
  ctx.fillStyle = "#241a0f"; ctx.fillRect(INX,INTOP,INW,INH);
  ctx.fillStyle = PAL.floor[1]; ctx.fillRect(INX,INTOP+7,INW,3);       // пол в тени
  ctx.fillStyle = PAL.floor[0]; ctx.fillRect(INX+8,INTOP+7,INW-8,3);   // пол на свету
  const glow = 0.12 + ea*0.30;                                         // чем шире вход — тем больше света
  ctx.fillStyle = "rgba(255,214,140,"+glow.toFixed(3)+")";
  ctx.beginPath();                                                     // трапеция света у порога
  ctx.moveTo(INX+6, INTOP); ctx.lineTo(INX+INW, INTOP);
  ctx.lineTo(INX+INW, INTOP+INH); ctx.lineTo(INX+2, INTOP+INH); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(INX,INTOP,INW,2);    // тень притолоки
  if(!locked && ea < 0.999){
    ctx.fillStyle = "rgba(255,224,150,.10)";                           // отблеск света на траве перед дверью
    ctx.fillRect(INX+Math.round(INW*(1-ea)), INTOP+INH, Math.max(2, Math.round(INW*ea*0.5)), 3);
  }
  // 2) полотно: сдвигается влево, последняя треть уходит за левую стойку (эффект «слайдера»)
  const visW = Math.max(0, Math.round(INW*(1 - Math.min(1, ea*1.12))));
  if(visW >= 1){
    const dx0 = INX + (INW - visW);          // правый край полотна = граница света
    ctx.fillStyle = PAL.woodDk; ctx.fillRect(dx0-1, INTOP-1, visW+2, INH+2); // контур
    ctx.fillStyle = PAL.doorFace; ctx.fillRect(dx0, INTOP, visW, INH);
    ctx.fillStyle = PAL.doorHi;  ctx.fillRect(dx0, INTOP, visW, 1);          // светлая верхняя кромка
    ctx.fillStyle = PAL.doorPlank;                                            // вертикальные доски
    for(const f of [0.3, 0.65]) if(visW > 6) ctx.fillRect(Math.round(dx0+visW*f), INTOP, 1, INH);
    ctx.fillStyle = PAL.doorLoShade || "rgba(0,0,0,.22)";
    ctx.fillRect(dx0, INTOP+INH-2, visW, 2);                                  // тень у низа полотна
    if(visW >= 6){                                                            // ручка только когда за неё есть что держаться
      ctx.fillStyle = PAL.goldLo; ctx.fillRect(dx0+visW-4, INTOP+4, 3, 2);
      ctx.fillStyle = PAL.gold;   ctx.fillRect(dx0+visW-4, INTOP+4, 2, 1);
    }
  } else if(ea > 0.05){
    // полотно полностью спрятано в стене — виден только торец у стойки
    ctx.fillStyle = PAL.woodLo; ctx.fillRect(INX-2, INTOP, 2, INH);
  }
  // 3) железная полоса с висячим замком — дверь заперта (поверх закрытого полотна)
  if(locked && a<.05){
    ctx.fillStyle = PAL.iron[0]; ctx.fillRect(INX,INTOP+4,INW,3);
    ctx.fillStyle = PAL.iron[1]; ctx.fillRect(x+14,INTOP+4,4,6);
    ctx.fillStyle = PAL.gold; ctx.fillRect(x+15,INTOP+6,2,2);
  }
  ctx.fillStyle = PAL.woodHi; ctx.fillRect(x+5,y+TILE-GROUND_OFF,22,1); // порог по линии земли
}
/**
 * Забор: один объект на весь ряд. Стиль — штакетник «в три четверти»:
 * доска с торцом-грани, скошенная верхушка, две перекладины в прорезях,
 * тень у основания каждой доски. Горизонтальный ряд (w×1) — вид спереди;
 * вертикальный (1×h) — тот же штакетник, повёрнутый: видимые грани досок
 * идут лесенкой по глубине (южнее доска — ближе к зрителю), перекладины
 * превращаются в поперечные бруски вдоль ряда.
 * @param {object} o объект забора
 */
function drawFence(o){
  const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
  if(o.h === 1){
    // ---- горизонтальный ряд: вид спереди ----
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(x+w/2, y+h-GROUND_OFF, w*0.45, 4, 0, 0, 7); ctx.fill();
    for(let i=0; i<o.w; i++){
      const px = x+i*TILE+5;                       // левый край доски
      // тень у основания
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(px-1, y+h-GROUND_OFF-2, 9, 2);
      // торец-грань справа (доска повёрнута к свету левой стороной)
      ctx.fillStyle = PAL.woodLo;  ctx.fillRect(px+6, y+3, 2, h-GROUND_OFF-3);
      // лицо доски + контур
      ctx.fillStyle = PAL.woodDk;  ctx.fillRect(px-1, y+3, 8, h-GROUND_OFF-3);
      ctx.fillStyle = PAL.wood;    ctx.fillRect(px,   y+4, 6, h-GROUND_OFF-4);
      ctx.fillStyle = PAL.woodHi;  ctx.fillRect(px,   y+4, 1, h-GROUND_OFF-4);
      // скошенная верхушка: ступеньки 4→2 пикселя
      ctx.fillStyle = PAL.woodDk;  ctx.fillRect(px,   y+2, 6, 2); ctx.fillRect(px+1, y+1, 4, 1);
      ctx.fillStyle = PAL.wood;    ctx.fillRect(px+1, y+2, 4, 2); ctx.fillRect(px+2, y+1, 2, 1);
      ctx.fillStyle = PAL.woodHi;  ctx.fillRect(px+1, y+2, 1, 1);
    }
    // перекладины поверх штакетников, со светлой и теневой гранями
    ctx.fillStyle = PAL.woodDk; ctx.fillRect(x, y+5, w, 5); ctx.fillRect(x, y+11, w, 5);
    ctx.fillStyle = PAL.wood;   ctx.fillRect(x, y+6, w, 3); ctx.fillRect(x, y+12, w, 3);
    ctx.fillStyle = PAL.woodHi; ctx.fillRect(x, y+6, w, 1); ctx.fillRect(x, y+12, w, 1);
    ctx.fillStyle = PAL.woodLo; ctx.fillRect(x, y+8, w, 1); ctx.fillRect(x, y+14, w, 1);
  } else {
    // ---- вертикальный ряд: штакетник повёрнут, смотрим «с торца» ----
    // Каждая доска стоит поперёк взгляда: её лицо — узкая вертикальная полоса,
    // а ширина ряда (16px) читается как глубина. Южнее доска — ближе к нам,
    // поэтому рисуем С СЕВЕРА НА ЮГ и каждая следующая перекрывает предыдущую
    // лишь слегка: получается лесенка острых верхов и сплошной частокол.
    const dx = 3;                                  // шаг досок по глубине
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(x+w/2, y+h-GROUND_OFF, Math.max(6,w*0.45), 4, 0, 0, 7); ctx.fill();
    for(let i=0; i<o.h; i++){
      const py = y + i*dx;                         // верх этой доски
      const bottom = y + h - GROUND_OFF;           // общая линия земли
      const bx = x + 2;                            // все доски в одной коллизионной колонне
      // основание: пятно земли под доской
      ctx.fillStyle = "rgba(0,0,0,.20)"; ctx.fillRect(bx-1, bottom-2, 12, 2);
      // торец (правая грань, обращена от света)
      ctx.fillStyle = PAL.woodLo; ctx.fillRect(bx+8, py+2, 3, bottom-py-2);
      // контур + лицо
      ctx.fillStyle = PAL.woodDk; ctx.fillRect(bx-1, py+1, 10, bottom-py-1);
      ctx.fillStyle = PAL.wood;   ctx.fillRect(bx,   py+2, 8, bottom-py-2);
      ctx.fillStyle = PAL.woodHi; ctx.fillRect(bx,   py+2, 2, bottom-py-2);
      // скошенный верх: чем доска «ближе», тем ниже скос начинается
      ctx.fillStyle = PAL.woodDk; ctx.fillRect(bx, py, 8, 2);
      ctx.fillStyle = PAL.wood;   ctx.fillRect(bx+1, py, 6, 2); ctx.fillRect(bx+2, py-1, 4, 1);
      ctx.fillStyle = PAL.woodHi; ctx.fillRect(bx+1, py, 1, 1);
    }
    // поперечные бруски (это «торцы» двух горизонтальных перекладин):
    // два тёмных среза, идущих сквозь ряд с лёгким смещением по глубине
    for(const off of [5, 11]){
      ctx.fillStyle = PAL.woodDk; ctx.fillRect(x+1, y+off, w-2, 4);
      ctx.fillStyle = PAL.wood;   ctx.fillRect(x+1, y+off+1, w-2, 2);
      ctx.fillStyle = PAL.woodHi; ctx.fillRect(x+1, y+off+1, w-2, 1);
    }
  }
}
/** Наковальня на деревянной колоде; низ — по общей линии земли. */
function drawAnvil(o){
  const x = o.x*TILE, y = o.y*TILE + 8; // низ — по общей линии земли (низ ряда +3)
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x+16,y+27,10,4,0,0,7); ctx.fill();
  ctx.fillStyle = PAL.trunk[0]; ctx.fillRect(x+11,y+22,10,5);
  ctx.fillStyle = PAL.trunk[1]; ctx.fillRect(x+11,y+22,10,2);
  ctx.fillStyle = PAL.stone[0]; ctx.fillRect(x+5,y+12,22,7);
  ctx.fillStyle = "#8b93a0"; ctx.fillRect(x+5,y+12,22,2);
  ctx.fillStyle = PAL.stone[2]; ctx.fillRect(x+2,y+13,4,4);
}
/** Кровать: тёмный контур (мебель не сливается с полом), одеяло и подушка. */
function drawBed(o){
  const x = o.x*TILE, y = o.y*TILE + 8;
  ctx.fillStyle = PAL.woodDk; ctx.fillRect(x+2,y+4,28,23); // контур — мебель не сливается с полом
  ctx.fillStyle = "#5a3a22"; ctx.fillRect(x+3,y+5,26,22);
  ctx.fillStyle = "#3d2814"; ctx.fillRect(x+3,y+5,26,3);
  ctx.fillStyle = "#efe6cf"; ctx.fillRect(x+6,y+9,20,17);
  ctx.fillStyle = "#b04558"; ctx.fillRect(x+6,y+14,20,11);
  ctx.fillStyle = "#8a3143"; ctx.fillRect(x+6,y+14,20,2);
  ctx.fillStyle = "#fbf6e8"; ctx.fillRect(x+7,y+10,8,4);
  ctx.fillStyle = PAL.gold; ctx.fillRect(x+6,y+24,20,1);
}
/** Стол: светлая столешница, ножки, синяя тарелка. */
function drawTable(o){
  const x = o.x*TILE, y = o.y*TILE + 8;
  ctx.fillStyle = PAL.woodDk; ctx.fillRect(x+2,y+5,28,22);
  ctx.fillStyle = "#4a3620"; ctx.fillRect(x+6,y+10,4,17); ctx.fillRect(x+22,y+10,4,17);
  ctx.fillStyle = "#d3bb92"; ctx.fillRect(x+3,y+7,26,10); // светлая столешница
  ctx.fillStyle = "#ead7ae"; ctx.fillRect(x+3,y+7,26,3);
  ctx.fillStyle = "#96794f"; ctx.fillRect(x+3,y+15,26,2);
  ctx.fillStyle = "#4a7ba8"; ctx.beginPath(); ctx.arc(x+16,y+11,3,0,7); ctx.fill(); // синяя тарелка
}
/** Сундук: запертый — с висячим замком, открытый — с тёмным проёмом приоткрытой крышки. */
function drawChest(o){
  const x = o.x*TILE, y = o.y*TILE + 8, k = o.x+","+o.y;
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x+16,y+27,11,4,0,0,7); ctx.fill();
  ctx.fillStyle = PAL.woodDk; ctx.fillRect(x+4,y+9,24,18); // контур
  ctx.fillStyle = "#3e5d4f"; ctx.fillRect(x+5,y+10,22,17); // крашеный сундук — зелёно-синий
  ctx.fillStyle = "#4f7263"; ctx.fillRect(x+5,y+10,22,6);
  ctx.fillStyle = "#2c443a"; ctx.fillRect(x+5,y+15,22,2);
  ctx.fillStyle = "#2c443a"; ctx.fillRect(x+9,y+10,2,17); ctx.fillRect(x+21,y+10,2,17);
  ctx.fillStyle = PAL.gold; ctx.fillRect(x+14,y+14,4,5);
  if(furnLocked(k)){
    ctx.fillStyle = PAL.iron[1]; ctx.fillRect(x+13,y+17,6,6); // висячий замок — заперт
    ctx.fillStyle = PAL.iron[0]; ctx.fillRect(x+13,y+17,6,2);
    ctx.fillStyle = PAL.gold; ctx.fillRect(x+15,y+19,2,3);
  } else {
    ctx.fillStyle = "#16211c"; ctx.fillRect(x+7,y+11,18,3); // приоткрытая крышка — тёмный проём
  }
}
/** Шкаф: два ряда ярких корешков; запертый — с замком на дверце, открытый — со щелью дверцы. */
function drawShelf(o){
  const x = o.x*TILE, y = o.y*TILE + 8, k = o.x+","+o.y;
  ctx.fillStyle = PAL.woodDk; ctx.fillRect(x+5,y+5,22,22);
  ctx.fillStyle = "#4a3620"; ctx.fillRect(x+6,y+6,20,21);
  ctx.fillStyle = "#2a1c0e"; ctx.fillRect(x+6,y+6,20,2);
  const bk = ["#d1604d","#4a7ba8","#7aa05a","#e8bd55","#a86ac0"]; // яркие корешки
  for(let s=0;s<2;s++){
    const sy = y+9+s*9;
    for(let i=0;i<4;i++){ ctx.fillStyle = bk[(hash(o.x+i,o.y,s*4+i)*4)|0]; ctx.fillRect(x+8+i*4, sy, 3, 7); }
    ctx.fillStyle = "#2a1c0e"; ctx.fillRect(x+6, sy+7, 20, 2);
  }
  if(furnLocked(k)){
    ctx.fillStyle = PAL.iron[1]; ctx.fillRect(x+14,y+17,5,6); // замок на дверце
    ctx.fillStyle = PAL.gold; ctx.fillRect(x+16,y+19,1,3);
  } else {
    ctx.fillStyle = "#12100a"; ctx.fillRect(x+7,y+7,2,21); // приоткрытая дверца
  }
}

/**
 * Человечек (игрок или NPC). Три вида: анфас (dir down), со спины (up) и
 * РЕЗКИЙ ПРОФИЛЬ (left/right) — именно при движении вбок персонаж должен
 * читаться лучше всего: развёрнутый корпус, одна рука и нога с явным замахом,
 * лицо смотрит по ходу (глаз и нос у края головы), волосы собраны в узел
 * с противоположной стороны. Ноги шагают «ножницами» вокруг бедра, ступни
 * разворачиваются по направлению движения.
 * @param {object} e сущность: x,y — тайловые координаты, dir, moving, anim (фаза шага)
 */
function drawHuman(e, shirt, skin, hair, isPlayer){
  const px = e.x*TILE, py = e.y*TILE;
  const side = (e.dir==="left" || e.dir==="right");
  const face = e.dir==="left" ? -1 : 1;         // куда «смотрит» профиль
  const step = e.moving ? Math.sin(e.anim||0) : 0;       // -1..1 фаза шага
  const bob  = e.moving ? Math.abs(Math.sin(e.anim||0)) : 0;
  const top  = py - bob;
  // тень «прижата» к ногам
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath();
  ctx.ellipse(px, py+11, side?7:10, 4, 0, 0, 7); ctx.fill();

  if(side){
    /* ---------------- ПРОФИЛЬ ---------------- */
    const swing = step*4;                        // замах ноги, px
    // задняя нога (дальше от зрителя — темнее и уже)
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(px-2-face*swing*0.5, top+2-Math.max(0,-swing)*0.5, 5, 9);
    ctx.fillStyle = "#3a2d1c";
    ctx.fillRect(px-1-face*swing*0.5, top+3-Math.max(0,-swing)*0.5, 3, 6);
    ctx.fillStyle = "#241b10";                               // ботинок задней ноги
    ctx.fillRect(px-2-face*swing*0.5+face, top+9-Math.max(0,-swing)*0.5, 4, 2);
    // передняя нога: штанина наклоняется по ходу замаха, ступня смотрит вперёд
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(px-2+face*swing*0.5-1, top+1, 6, 10-Math.max(0,swing)*0.5);
    ctx.fillStyle = "#4a3a26";
    ctx.fillRect(px-1+face*swing*0.5-1, top+2, 4, 7-Math.max(0,swing)*0.5);
    ctx.fillStyle = "#2e2418";
    ctx.fillRect(px-2+face*(swing*0.5+2), top+9, 6, 3);      // ступня вытянута по направлению
    ctx.fillStyle = "#161009";
    ctx.fillRect(px-2+face*(swing*0.5+2), top+11, 6, 1);     // подошва
    // задняя рука: маячит в противофазе, прячется за корпус
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(px-1-face*swing*0.7, top-6+Math.round(step*1), 4, 9);
    ctx.fillStyle = shirt;
    ctx.fillRect(px-face*swing*0.7, top-5+Math.round(step*1), 2, 5);
    ctx.fillStyle = skin;
    ctx.fillRect(px-face*swing*0.7, top+2+Math.round(step*1), 2, 2); // кисть
    // корпус: боковой силуэт — грудь по ходу, спина сзади; скруглён сверху
    ctx.fillStyle = PAL.outline; ctx.fillRect(px-6, top-9, 12, 14);
    ctx.fillStyle = shirt;       ctx.fillRect(px-5, top-8, 10, 12);
    ctx.fillStyle = "rgba(255,255,255,.10)";                 // свет на «груди»
    ctx.fillRect(px + (face>0?1:-4), top-8, 3, 10);
    ctx.fillStyle = "rgba(0,0,0,.22)";                       // тень на спине
    ctx.fillRect(px + (face>0?-5:3), top-8, 2, 12);
    ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.fillRect(px-5, top+1, 10, 3); // пояс
    if(isPlayer){ ctx.fillStyle = PAL.gold; ctx.fillRect(px + (face>0?2:-3), top+1, 2, 3); }
    // голова в профиле: кожа, затылок под волосами, «подбородок» выступает по ходу
    ctx.fillStyle = PAL.outline; ctx.fillRect(px-6, top-20, 12, 13);
    ctx.fillStyle = skin;        ctx.fillRect(px-5, top-19, 10, 11);
    ctx.fillRect(px + face*4, top-14, 2, 3);                 // нос/подбородок у края
    ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(px - face*5, top-19, 2, 11); // тень дальней стороны
    // волосы: масса на затылке + чёлка у лица + узел
    ctx.fillStyle = hair;
    ctx.fillRect(px-6, top-21, 12, 5);                       // верх
    ctx.fillRect(px - face*5, top-16, 3, 7);                 // затылок
    ctx.fillRect(px + face*3, top-17, 2, 2);                 // чёлка
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(px - face*6, top-13, 2, 3);                 // контур узла
    ctx.fillStyle = hair;
    ctx.fillRect(px - face*6, top-12, 2, 2);
    // глаз — один, ближе к краю лица; моргает в конце цикла шага
    const blink = e.moving && step > 0.92;
    ctx.fillStyle = "#2a2016";
    ctx.fillRect(px + face*2, top-13, 2, blink?1:2);
    ctx.fillStyle = "#f4ead8";
    if(!blink) ctx.fillRect(px + face*2, top-13, 1, 1);
    if(isPlayer){                                            // шляпа следопыта: поля торчат вперёд и назад
      ctx.fillStyle = PAL.outline;
      ctx.fillRect(px-9, top-22, 18, 3); ctx.fillRect(px-4, top-27, 8, 6);
      ctx.fillStyle = "#6d5233";
      ctx.fillRect(px-8, top-22, 16, 2); ctx.fillRect(px-3, top-26, 6, 5);
      ctx.fillStyle = "#8a6a44";
      ctx.fillRect(px-3, top-26, 6, 1); ctx.fillRect(px-8, top-22, 16, 1);
      ctx.fillStyle = PAL.goldLo; ctx.fillRect(px-3, top-21, 6, 1);
    }
    return;
  }

  /* ---------------- АНФАС / СО СПИНЫ ---------------- */
  const st = e.moving ? Math.sin(e.anim||0)*2 : 0;
  // ноги: штанина → ботинок со светлой подошвой; при замахе нога короче
  ctx.fillStyle = PAL.outline;
  ctx.fillRect(px-6, top+1+st, 5, 10-st); ctx.fillRect(px+1, top+1-st, 5, 10+st);
  ctx.fillStyle = "#4a3a26";
  ctx.fillRect(px-5, top+2+st, 3, 7-st); ctx.fillRect(px+2, top+2-st, 3, 7+st);
  ctx.fillStyle = "#2e2418";
  ctx.fillRect(px-6, top+9+st, 5, 3); ctx.fillRect(px+1, top+9-st, 5, 3); // ботинки
  ctx.fillStyle = "#161009";
  ctx.fillRect(px-6, top+11+st, 5, 1); ctx.fillRect(px+1, top+11-st, 5, 1); // подошва
  // руки — лёгкий мах в противофазе ног, кисти чуть светлее кожи
  ctx.fillStyle = PAL.outline;
  ctx.fillRect(px-11, top-7-Math.round(st*.5), 4, 10); ctx.fillRect(px+7, top-7+Math.round(st*.5), 4, 10);
  ctx.fillStyle = shirt;
  ctx.fillRect(px-10, top-6-Math.round(st*.5), 2, 6); ctx.fillRect(px+8, top-6+Math.round(st*.5), 2, 6);
  ctx.fillStyle = skin;
  ctx.fillRect(px-10, top+1-Math.round(st*.5), 2, 2); ctx.fillRect(px+8, top+1+Math.round(st*.5), 2, 2);
  // туловище: контур, лицо рубашки, тень на дальней стороне, пояс
  ctx.fillStyle = PAL.outline; ctx.fillRect(px-8, top-9, 16, 14);
  ctx.fillStyle = shirt; ctx.fillRect(px-7, top-8, 14, 12);
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(px+3, top-8, 4, 12);
  ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.fillRect(px-7, top+1, 14, 3); // пояс
  if(isPlayer){ ctx.fillStyle = PAL.gold; ctx.fillRect(px-1, top+1, 2, 3); } // пряжка у игрока
  // голова: контур, кожа, полутень, волосы с висками
  ctx.fillStyle = PAL.outline; ctx.fillRect(px-7, top-21, 14, 14);
  ctx.fillStyle = skin; ctx.fillRect(px-6, top-20, 12, 12);
  ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(px+3, top-20, 3, 12);
  ctx.fillStyle = hair; ctx.fillRect(px-6, top-21, 12, 5);
  ctx.fillRect(px-6, top-16, 2, 5); ctx.fillRect(px+4, top-16, 2, 5); // виски
  if(e.dir==="down"){
    // глаза: два ряда — тёмная строка + светлый блик
    ctx.fillStyle = "#2a2016";
    ctx.fillRect(px-3, top-13, 2, 2); ctx.fillRect(px+1, top-13, 2, 2);
    ctx.fillStyle = "#f4ead8";
    ctx.fillRect(px-3, top-13, 1, 1); ctx.fillRect(px+1, top-13, 1, 1);
    ctx.fillStyle = "rgba(160,70,60,.35)";                      // румянец
    ctx.fillRect(px-5, top-11, 2, 1); ctx.fillRect(px+3, top-11, 2, 1);
  } else {
    ctx.fillStyle = hair; ctx.fillRect(px-5, top-15, 10, 3); // вид с затылка
  }
  if(isPlayer){ // широкополая шляпа следопыта
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(px-8, top-22, 16, 3); ctx.fillRect(px-5, top-27, 10, 6);
    ctx.fillStyle = "#6d5233";
    ctx.fillRect(px-7, top-22, 14, 2); ctx.fillRect(px-4, top-26, 8, 5);
    ctx.fillStyle = "#8a6a44";
    ctx.fillRect(px-4, top-26, 8, 1); ctx.fillRect(px-7, top-22, 14, 1);
    ctx.fillStyle = PAL.goldLo; ctx.fillRect(px-4, top-21, 8, 1); // лента
  }
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

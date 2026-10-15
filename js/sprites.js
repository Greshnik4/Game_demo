"use strict";
/* ============================== ОТРИСОВКА (V2: УЮТНЫЙ СВЕТ) ==============================
Переработанный визуальный слой. Добавлены объём, микро-градиенты, контактные тени 
и динамические эффекты (блики на воде, свечение предметов). 
Сетка 16x16 сохранена. */

const TILE = 16;
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

let DPR = 1;
function resize(){
    DPR = Math.min(Math.max(1, Math.round(window.devicePixelRatio || 1)), 2);
    cv.width = Math.floor(innerWidth * DPR);
    cv.height = Math.floor(innerHeight * DPR);
    ctx.imageSmoothingEnabled = false; // Для чётких пикселей, если где-то используется масштабирование
}
addEventListener("resize", resize); resize();

function hash(x,y,s){ let h = (x*374761393 + y*668265263 + s*1442695041) >>> 0;
    h = (h ^ (h>>13)) * 1274126177 >>> 0; return (h ^ (h>>16)) / 4294967296; }

// Палитра стала мягче, "жиже" и насыщеннее
const PAL = {
    grass:  ["#5b8c5a", "#6a9e68", "#4a7549", "#7eb57a"],
    path:   ["#c4a47c", "#b08f66", "#d6bc96"],
    water:  ["#2d6a9f", "#4185c2", "#8bb5e0", "#aee0f5"],
    sand:   "#e3d1a8", foam: "#f4f9fc",
    plaster:"#f0e6d2", plasterShade: "#d8c7ab",
    beam:   "#7a5635", beamLo: "#5c3e24", beamHi: "#946b45",
    floor:  ["#a8825a", "#8f6b45", "#b8926a"],
    gold:   "#f5d77b",
};

const isGrass = t => t==="." || t==="F";
const isWater = (x,y) => surfaceAt(x,y) === "~";

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ОБЪЁМА ---
// Рисует "контактную тень" (Ambient Occlusion) под объектом
function drawContactShadow(x, y, w, h, alpha = 0.3) {
    ctx.fillStyle = `rgba(15, 20, 15, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x + w/2, y + h, w * 0.45, Math.max(2, h * 0.15), 0, 0, Math.PI * 2);
    ctx.fill();
}
// Рисует блик и тень для создания 3D-толщины у прямоугольников (мебель, стены)
function drawBevel(x, y, w, h, hiColor = "rgba(255,255,255,0.2)", shadeColor = "rgba(0,0,0,0.25)") {
    ctx.fillStyle = hiColor;
    ctx.fillRect(x, y, w, 1); // Верхний блик
    ctx.fillRect(x, y, 1, h); // Левый блик
    ctx.fillStyle = shadeColor;
    ctx.fillRect(x, y + h - 1, w, 1); // Нижняя тень
    ctx.fillRect(x + w - 1, y, 1, h); // Правая тень
}

// ============================== ПОВЕРХНОСТЬ ==============================

function drawGrass(x,y,tx,ty){
    // Базовый цвет с легким градиентом для объёма тайла
    const grad = ctx.createLinearGradient(x, y, x, y + TILE);
    grad.addColorStop(0, PAL.grass[1]);
    grad.addColorStop(1, PAL.grass[0]);
    ctx.fillStyle = grad; 
    ctx.fillRect(x,y,TILE,TILE);
    
    // Детали
    ctx.fillStyle = PAL.grass[2];
    for(let i=0;i<2;i++){
        const hx = hash(tx,ty,i)*TILE|0, hy = hash(tx,ty,i+20)*TILE|0;
        ctx.fillRect(x+hx, y+hy, 2, 2);
    }
    if(hash(tx,ty,44)>.82){ 
        const hx = (hash(tx,ty,45)*12|0)+2, hy = (hash(tx,ty,46)*12|0)+2;
        ctx.fillStyle = PAL.grass[3]; 
        ctx.fillRect(x+hx, y+hy, 1, 3); 
        ctx.fillRect(x+hx+2, y+hy+1, 1, 2);
    }
}

function drawVoidArt(ax,ay){
    const x = ax*TILE, y = ay*TILE;
    ctx.fillStyle = "#142112"; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle = "#0d160b";
    if(hash(ax,ay,1)>.45){
        ctx.beginPath();
        ctx.arc(x+8+(hash(ax,ay,2)*8-4), y+8+(hash(ax,ay,3)*8-4), 5+hash(ax,ay,4)*3, 0, 7);
        ctx.fill();
    }
}

function drawSurfaceArt(t, ax, ay, time){
    const x = ax*TILE, y = ay*TILE;
    if(t==="~"){
        // ВОДА: Глубокая, с динамическими бликами
        ctx.fillStyle = PAL.water[0]; ctx.fillRect(x,y,TILE,TILE);
        
        // Волны
        ctx.fillStyle = PAL.water[1];
        for(let i=0;i<2;i++) {
            const wy = y + i*8 + 3 + Math.sin(time*1.5+ax*0.5+ay*0.3)*1.5;
            ctx.fillRect(x, wy, TILE, 2);
        }
        
        // Мерцающие блики (солнечные зайчики)
        ctx.fillStyle = PAL.water[3];
        const sparkle1 = Math.sin(time*3 + ax*2.1 + ay*1.7) * 0.5 + 0.5;
        const sparkle2 = Math.cos(time*2.5 + ax*1.3 + ay*2.4) * 0.5 + 0.5;
        if(sparkle1 > 0.8) ctx.fillRect(x + (hash(ax,ay,9)*12|0), y + (hash(ax,ay,10)*12|0), 2, 1);
        if(sparkle2 > 0.85) ctx.fillRect(x + (hash(ax,ay,11)*10|0)+2, y + (hash(ax,ay,12)*10|0)+3, 1, 1);

        // Песчаная кромка
        ctx.fillStyle = PAL.sand;
        if(!isWater(ax,ay-1)) ctx.fillRect(x,y,TILE,3);
        if(!isWater(ax,ay+1)) ctx.fillRect(x,y+TILE-3,TILE,3);
        if(!isWater(ax-1,ay)) ctx.fillRect(x,y,3,TILE);
        if(!isWater(ax+1,ay)) ctx.fillRect(x+TILE-3,y,3,TILE);
        
        // Пена
        ctx.fillStyle = PAL.foam;
        if(!isWater(ax,ay-1)) for(let i=0;i<2;i++) ctx.fillRect(x+(hash(ax,ay,i)*12|0), y+3, 3, 1);
        if(!isWater(ax,ay+1)) for(let i=0;i<2;i++) ctx.fillRect(x+(hash(ax,ay,i+9)*12|0), y+TILE-4, 3, 1);
    } 
    else if(t===","){
        ctx.fillStyle = PAL.path[0]; ctx.fillRect(x,y,TILE,TILE);
        ctx.fillStyle = PAL.path[1];
        for(let i=0;i<3;i++){
            const hx = hash(ax,ay,i)*TILE|0, hy = hash(ax,ay,i+40)*TILE|0;
            ctx.fillRect(x+hx, y+hy, 2, 2);
        }
        // Градиент для тропы, чтобы она казалась вогнутой
        const pathGrad = ctx.createLinearGradient(x, y, x, y+TILE);
        pathGrad.addColorStop(0, "rgba(0,0,0,0.1)");
        pathGrad.addColorStop(0.5, "rgba(0,0,0,0)");
        pathGrad.addColorStop(1, "rgba(0,0,0,0.15)");
        ctx.fillStyle = pathGrad; ctx.fillRect(x,y,TILE,TILE);

        ctx.fillStyle = PAL.grass[0];
        if(isGrass(surfaceAt(ax,ay-1))) for(let i=0;i<3;i++) if(hash(ax,ay,i+50)>.45) ctx.fillRect(x+i*5+(hash(ax,ay,i+51)*3|0), y, 3, 2);
        if(isGrass(surfaceAt(ax,ay+1))) for(let i=0;i<3;i++) if(hash(ax,ay,i+60)>.45) ctx.fillRect(x+i*5+(hash(ax,ay,i+61)*3|0), y+TILE-2, 3, 2);
    } 
    else if(t==="H"){
        ctx.fillStyle = PAL.floor[0]; ctx.fillRect(x,y,TILE,TILE);
        ctx.fillStyle = PAL.floor[1];
        for(let i=0;i<2;i++) ctx.fillRect(x, y+i*8+7, TILE, 1);
        ctx.fillRect(x+((ax*13+ay*7)%12)+2, y+(ay%2)*8, 1, 8); 
        // Блик на досках
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x, y, TILE, 4);
    } 
    else if(t==="u"){
        ctx.fillStyle = PAL.floor[0]; ctx.fillRect(x,y,TILE,TILE);
        ctx.fillStyle = "#9e4559"; ctx.fillRect(x+1,y+1,TILE-2,TILE-2);
        ctx.fillStyle = "#7a3042";
        ctx.fillRect(x+1,y+1,TILE-2,2); ctx.fillRect(x+1,y+TILE-3,TILE-2,2);
        ctx.fillRect(x+1,y+1,2,TILE-2); ctx.fillRect(x+TILE-3,y+1,2,TILE-2);
        ctx.fillStyle = PAL.gold; ctx.fillRect(x+7,y+7,2,2);
        drawBevel(x+1, y+1, TILE-2, TILE-2, "rgba(255,255,255,0.1)", "rgba(0,0,0,0.3)");
    } 
    else if(t==="F"){
        drawGrass(x,y,ax,ay);
        const cols = ["#f7eb6b", "#eb7a9e", "#f0f3fa", "#c48be3"];
        for(let i=0;i<2;i++){
            const fx = x+3+(hash(ax,ay,i)*10|0), fy = y+4+(hash(ax,ay,i+60)*8|0);
            ctx.fillStyle = PAL.grass[2]; ctx.fillRect(fx+1,fy+2,1,3);
            ctx.fillStyle = cols[(hash(ax,ay,i+70)*4)|0]; ctx.fillRect(fx,fy,3,3);
            ctx.fillStyle = "#fff"; ctx.fillRect(fx+1,fy+1,1,1); // Блик на цветке
        }
    } 
    else {
        drawGrass(x,y,ax,ay);
    }
}

// ============================== СТРУКТУРЫ ==============================

function drawWallCell(ax, ay){
    const x = ax*TILE, y = ay*TILE;
    const left  = lowerAt(ax-1,ay) === "#";
    const right = lowerAt(ax+1,ay) === "#";
    const up    = lowerAt(ax,ay-1) === "#";
    const down  = lowerAt(ax,ay+1) === "#";
    const horiz = left || right;
    const vert  = up || down;
    
    ctx.fillStyle = PAL.plaster; ctx.fillRect(x,y,TILE,TILE);
    // Текстура штукатурки
    ctx.fillStyle = PAL.plasterShade;
    if(hash(ax,ay,10)>.6) ctx.fillRect(x+4, y+4, 2, 2);
    if(hash(ax,ay,11)>.7) ctx.fillRect(x+10, y+11, 3, 1);
    
    ctx.fillStyle = PAL.beam;
    if(horiz){
        ctx.fillRect(x,y,TILE,2); ctx.fillRect(x,y+TILE-2,TILE,2);
        // Блик на балке
        ctx.fillStyle = PAL.beamHi; ctx.fillRect(x,y,TILE,1);
        ctx.fillStyle = PAL.beam;
    }
    if(vert){
        ctx.fillRect(x,y,2,TILE); ctx.fillRect(x+TILE-2,y,2,TILE);
        ctx.fillStyle = PAL.beamHi; ctx.fillRect(x,y,1,TILE);
        ctx.fillStyle = PAL.beam;
    }
    if(!horiz && !vert){
        ctx.fillRect(x,y,TILE,2); ctx.fillRect(x,y+TILE-2,TILE,2);
        ctx.fillRect(x,y,2,TILE); ctx.fillRect(x+TILE-2,y,2,TILE);
    }
}

function drawRoof(o){
    const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
    const red = o.t === "R";
    
    // Основа крыши с градиентом
    const roofGrad = ctx.createLinearGradient(x, y, x, y+h);
    roofGrad.addColorStop(0, red ? "#c95d4a" : "#6b7a8c");
    roofGrad.addColorStop(1, red ? "#964032" : "#4a5663");
    ctx.fillStyle = roofGrad; ctx.fillRect(x,y,w,h);
    
    // Черепица (тёмные линии)
    ctx.fillStyle = red ? "#7a2e22" : "#38424d";
    for(let i=0;i<h/8;i++) ctx.fillRect(x, y+i*8+6, w, 2);
    for(let i=0;i<w/8;i++){ 
        const sx = ((i%2)*8 + (hash(o.x+i,o.y,3)*8|0)) % w;
        ctx.fillRect(x+sx, y+(i%2)*8, 1, 6);
    }
    // Верхний блик крыши
    ctx.fillStyle = red ? "#e07865" : "#8596ab"; ctx.fillRect(x,y,w,2);
    // Свес и тень
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x,y+h-3,w,3); 
}

// ============================== ОБЪЕКТЫ ==============================

const OBJ_DRAW = {
    drawWallCell: (o) => drawWallCell(o.x, o.y),
    drawRoof, drawRock, drawSign, drawForest, drawTree, drawDoor, drawFence,
    drawAnvil, drawBed, drawTable, drawChest, drawShelf,
};

function drawObjArt(o, time){
    const f = OBJ_DRAW[OBJ_DEF[o.t].draw];
    if(f) f(o, time);
}

const GROUND_OFF = -3;

function drawRock(o){
    const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
    const bb = y + h - GROUND_OFF; 
    drawContactShadow(x, y, w, h - GROUND_OFF, 0.4);
    
    const big = w >= 2*TILE && h >= 2*TILE;
    const top = y+Math.round(h*0.25), bh = bb-2-top;
    
    // Тело камня с градиентом
    const rockGrad = ctx.createRadialGradient(x+w*0.3, y+h*0.3, 2, x+w/2, y+h/2, w*0.6);
    rockGrad.addColorStop(0, "#9ba1a8");
    rockGrad.addColorStop(0.5, "#72777d");
    rockGrad.addColorStop(1, "#4d5157");
    ctx.fillStyle = rockGrad;
    ctx.beginPath(); ctx.roundRect(x+2, top, w-4, bh, big?7:4); ctx.fill();
    
    // Верхний блик
    ctx.fillStyle = "#b5bbc2";
    ctx.beginPath(); ctx.ellipse(x+w*0.4, top+4, w*0.25, 3, 0, 0, Math.PI*2); ctx.fill();
    
    // Трещина/тень
    ctx.fillStyle = "#3a3e43";
    ctx.fillRect(x+Math.round(w*0.6), y+Math.round(h*0.5), Math.round(w*0.28), 2);
}

function drawTree(o, time){
    const x = o.x*TILE, y = o.y*TILE;
    const bx = x + (o.cx - o.x + o.cw/2) * TILE, by = y + (o.cy - o.y + 1) * TILE - GROUND_OFF;
    
    drawContactShadow(bx - 12, by - 4, 24, 8, 0.5);
    
    const sw = Math.sin(time * 1.3 + o.x * 0.7 + o.y * 0.4) * 1.5;
    
    // Ствол с объёмом
    const trunkGrad = ctx.createLinearGradient(bx-3, 0, bx+3, 0);
    trunkGrad.addColorStop(0, "#5c3e24");
    trunkGrad.addColorStop(0.5, "#7a5635");
    trunkGrad.addColorStop(1, "#422a16");
    ctx.fillStyle = trunkGrad; 
    ctx.fillRect(bx-3, by-16, 6, 16);
    
    // Крона (Многослойная для объёма)
    const cx = bx + sw, cy = by - TILE * 1.25;
    
    // 1. Тёмная база (тень)
    ctx.fillStyle = "#1e4022"; 
    ctx.beginPath(); ctx.arc(cx, cy+2, 14, 0, 7); ctx.fill();
    
    // 2. Основной цвет
    ctx.fillStyle = "#356b36"; 
    ctx.beginPath(); ctx.arc(cx-4, cy-2, 9, 0, 7); ctx.arc(cx+5, cy, 8, 0, 7); ctx.fill();
    
    // 3. Светлые комки (блики)
    ctx.fillStyle = "#529e4f"; 
    ctx.beginPath(); ctx.arc(cx-5, cy-6, 6, 0, 7); ctx.arc(cx+3, cy-5, 5, 0, 7); ctx.fill();
    
    // 4. Точечные блики
    ctx.fillStyle = "#75c96f"; 
    ctx.fillRect(cx-6, cy-8, 3, 2); ctx.fillRect(cx+2, cy-7, 2, 2);
}

function drawForest(o){
    const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
    // Глубокий фон
    ctx.fillStyle = "#152b12"; ctx.fillRect(x,y,w,h);
    
    for(let ty=0; ty<o.h; ty++) for(let tx=0; tx<o.w; tx++){
        const ax = o.x+tx, ay = o.y+ty;
        // Тёмные задние кроны
        ctx.fillStyle = "#1a3816";
        ctx.beginPath(); ctx.arc(ax*TILE+8+(hash(ax,ay,2)*8-4), ay*TILE+8+(hash(ax,ay,3)*8-4), 7+hash(ax,ay,4)*3, 0, 7); ctx.fill();
        // Светлые передние акценты
        ctx.fillStyle = "#2d5926";
        if(hash(ax,ay,5)>.55) ctx.beginPath(); ctx.arc(ax*TILE+6, ay*TILE+6, 4, 0, 7); ctx.fill();
    }
    // Туман/дымка у основания леса
    const fogGrad = ctx.createLinearGradient(x, y+h-20, x, y+h);
    fogGrad.addColorStop(0, "rgba(20,30,20,0)");
    fogGrad.addColorStop(1, "rgba(20,30,20,0.6)");
    ctx.fillStyle = fogGrad; ctx.fillRect(x, y+h-20, w, 20);
}

function drawSign(o){
    const x = o.x*TILE, y = o.y*TILE, h = o.h*TILE;
    const bx = x + (o.cx - o.x + 0.5) * TILE; 
    drawContactShadow(bx - 8, y + h - GROUND_OFF - 4, 16, 8, 0.4);
    
    // Стойка
    ctx.fillStyle = "#5c3e24"; ctx.fillRect(bx-2, y+10, 4, h-GROUND_OFF-10);
    ctx.fillStyle = "#7a5635"; ctx.fillRect(bx-2, y+10, 1, h-GROUND_OFF-10); // Блик
    
    // Доска
    ctx.fillStyle = "#8a6b42"; ctx.fillRect(bx-11, y+2, 22, 12);
    drawBevel(bx-11, y+2, 22, 12, "rgba(255,255,255,0.2)", "rgba(0,0,0,0.3)");
    ctx.fillStyle = "#4a3520"; ctx.fillRect(bx-8, y+6, 10, 2); ctx.fillRect(bx-8, y+9, 7, 2);
}

function drawDoor(o, time){
    const x = o.x*TILE, y = o.y*TILE;
    const a = doorAnim[o.x+", "+o.y]||0, locked = doorLocked(o.x,o.y);
    const quad = (x1,y1,x2,y2,x3,y3,x4,y4) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
        ctx.lineTo(x3,y3); ctx.lineTo(x4,y4); ctx.closePath(); ctx.fill();
    };
    
    ctx.fillStyle = PAL.plaster; ctx.fillRect(x,y,2*TILE,TILE);
    ctx.fillStyle = PAL.beam;
    ctx.fillRect(x,y,2*TILE,2); ctx.fillRect(x,y+TILE-2,2*TILE,2);
    ctx.fillRect(x,y,2,TILE); ctx.fillRect(x+2*TILE-2,y,2,TILE);
    
    ctx.fillStyle = PAL.beamLo; ctx.fillRect(x+3,y+2,26,12); 
    if(a > 0.05){
        ctx.fillStyle = PAL.floor[0]; ctx.fillRect(x+5,y+3,22,10);
        ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(x+5,y+3,22,3); // Глубокая тень от притолоки
    } else {
        ctx.fillStyle = "#120c06"; ctx.fillRect(x+5,y+3,22,10);
    }
    
    const th = a * 0.9;
    const cs = Math.cos(th), sn = Math.sin(th);
    const hx = x+5, hy0 = y+3, hy1 = y+13, L = 22, e = 4*sn;
    const fx = hx + L*cs;                 
    const fy0 = hy0 + L*sn*0.8 - e;       
    const fy1 = hy1 + L*sn*1.2 + e;       
    
    ctx.fillStyle = "rgba(0,0,0,.3)";
    quad(hx+2, hy0+4, fx+3, fy0+4, fx+3, fy1+4, hx+2, hy1+4);
    
    ctx.fillStyle = "#120c06";
    quad(hx-1, hy0-1, fx+1, fy0-1, fx+1, fy1+1, hx-1, hy1+1);
    ctx.fillStyle = "#8a5a30";
    quad(hx, hy0, fx, fy0, fx, fy1, hx, hy1);
    
    // Блик на двери
    ctx.fillStyle = "#a87242";
    quad(hx, hy0, fx, fy0, fx, fy0+2, hx, hy0+2);
    
    if(a < 0.6){
        ctx.fillStyle = "#5c3a1e";
        for(const f of [0.33, 0.66]){
            const px0 = hx + L*f, px1 = hx + L*f*cs;
            quad(px0-1, hy0, px0+1, hy0, px1+1, fy1, px1-1, fy1);
        }
    }
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(Math.round(fx)-4, Math.round((fy0+fy1)/2)-1, 2, 2);
    
    if(locked && a < .05){ 
        ctx.fillStyle = "#2a2e35"; ctx.fillRect(x+5,y+7,22,3);
        ctx.fillStyle = "#15181c"; ctx.fillRect(x+14,y+7,4,5);
        ctx.fillStyle = PAL.gold; ctx.fillRect(x+15,y+8,2,2);
    }
}

function drawFence(o){
    const x = o.x*TILE, y = o.y*TILE, w = o.w*TILE, h = o.h*TILE;
    drawContactShadow(x, y, w, h - GROUND_OFF, 0.3);
    
    if(o.h === 1){
        ctx.fillStyle = "#5c3e24";
        for(let i=0; i<o.w; i++){ ctx.fillRect(x+i*TILE+5, y+4, 6, h-GROUND_OFF-4); }
        ctx.fillStyle = "#8a6238";
        ctx.fillRect(x, y+6, w, 3); ctx.fillRect(x, y+12, w, 3);
        // Блики на перекладинах
        ctx.fillStyle = "#a8814f";
        ctx.fillRect(x, y+6, w, 1); ctx.fillRect(x, y+12, w, 1);
    } else {
        ctx.fillStyle = "#5c3e24";
        for(let i=0; i<o.h; i++){ ctx.fillRect(x+4, y+i*TILE+5, w-8, 6); }   
        ctx.fillStyle = "#8a6238";
        ctx.fillRect(x+5, y, 3, h-GROUND_OFF); ctx.fillRect(x+11, y, 3, h-GROUND_OFF);
        ctx.fillStyle = "#a8814f";
        ctx.fillRect(x+5, y, 1, h-GROUND_OFF); ctx.fillRect(x+11, y, 1, h-GROUND_OFF);
    }
}

// ============================== МЕБЕЛЬ ==============================
// Для всей мебели добавлен единый стиль: тёмный контур, цветное тело, 3D-обводка (drawBevel)

function drawAnvil(o){
    const x = o.x*TILE, y = o.y*TILE + 8; 
    drawContactShadow(x, y+15, 32, 12, 0.4);
    // Колода
    ctx.fillStyle = "#4a321e"; ctx.fillRect(x+11,y+22,10,5);
    drawBevel(x+11, y+22, 10, 5);
    // Металл
    const anvGrad = ctx.createLinearGradient(x, y+12, x, y+19);
    anvGrad.addColorStop(0, "#8a93a0");
    anvGrad.addColorStop(1, "#4a515c");
    ctx.fillStyle = anvGrad; ctx.fillRect(x+5,y+12,22,7);
    ctx.fillStyle = "#a5b0c0"; ctx.fillRect(x+5,y+12,22,2); // Блик
    ctx.fillStyle = "#353a42"; ctx.fillRect(x+2,y+13,4,4);
}

function drawBed(o){
    const x = o.x*TILE, y = o.y*TILE + 8;
    ctx.fillStyle = "#1a1108"; ctx.fillRect(x+2,y+4,28,23); 
    ctx.fillStyle = "#5c3a22"; ctx.fillRect(x+3,y+5,26,22);
    drawBevel(x+3, y+5, 26, 22, "rgba(255,255,255,0.1)", "rgba(0,0,0,0.4)");
    
    ctx.fillStyle = "#f4ecd8"; ctx.fillRect(x+6,y+9,20,17); // Простыня
    ctx.fillStyle = "#c44256"; ctx.fillRect(x+6,y+14,20,11); // Одеяло
    ctx.fillStyle = "#9e2f40"; ctx.fillRect(x+6,y+14,20,2); // Тень складки
    ctx.fillStyle = "#fff"; ctx.fillRect(x+7,y+10,8,4); // Подушка
    drawBevel(x+7, y+10, 8, 4, "rgba(255,255,255,0.5)", "rgba(0,0,0,0.1)");
}

function drawTable(o){
    const x = o.x*TILE, y = o.y*TILE + 8;
    ctx.fillStyle = "#2a1c0e"; ctx.fillRect(x+6,y+10,4,17); ctx.fillRect(x+22,y+10,4,17); // Ножки
    ctx.fillStyle = "#b8966a"; ctx.fillRect(x+3,y+7,26,10); // Столешница
    drawBevel(x+3, y+7, 26, 10, "rgba(255,255,255,0.2)", "rgba(0,0,0,0.3)");
    ctx.fillStyle = "#8a6b47"; ctx.fillRect(x+3,y+15,26,2); // Толщина
    // Тарелка
    ctx.fillStyle = "#2a4a6b"; ctx.beginPath(); ctx.arc(x+16,y+11,3,0,7); ctx.fill(); 
    ctx.fillStyle = "#4a7ab0"; ctx.beginPath(); ctx.arc(x+15.5,y+10.5,2,0,7); ctx.fill(); // Блик
}

function drawChest(o){
    const x = o.x*TILE, y = o.y*TILE + 8, k = o.x+", "+o.y;
    drawContactShadow(x, y+15, 32, 12, 0.4);
    ctx.fillStyle = "#120c06"; ctx.fillRect(x+4,y+9,24,18); 
    ctx.fillStyle = "#3a6353"; ctx.fillRect(x+5,y+10,22,17); 
    drawBevel(x+5, y+10, 22, 17, "rgba(255,255,255,0.15)", "rgba(0,0,0,0.4)");
    
    ctx.fillStyle = "#264236"; ctx.fillRect(x+9,y+10,2,17); ctx.fillRect(x+21,y+10,2,17); // Обод
    ctx.fillStyle = PAL.gold; ctx.fillRect(x+14,y+14,4,5); // Накладка
    
    if(furnLocked(k)){
        ctx.fillStyle = "#15181c"; ctx.fillRect(x+13,y+17,6,6); 
        ctx.fillStyle = PAL.gold; ctx.fillRect(x+15,y+19,2,3);
    } else {
        ctx.fillStyle = "#0a120e"; ctx.fillRect(x+7,y+11,18,3); 
    }
}

function drawShelf(o){
    const x = o.x*TILE, y = o.y*TILE + 8, k = o.x+", "+o.y;
    ctx.fillStyle = "#1a1108"; ctx.fillRect(x+5,y+5,22,22);
    ctx.fillStyle = "#4a3522"; ctx.fillRect(x+6,y+6,20,21);
    drawBevel(x+6, y+6, 20, 21, "rgba(255,255,255,0.1)", "rgba(0,0,0,0.4)");
    
    const bk = ["#d46a58", "#588bbd", "#8bb558", "#e6bc58"]; 
    for(let s=0;s<2;s++){
        const sy = y+9+s*9;
        for(let i=0;i<4;i++){ 
            ctx.fillStyle = bk[(hash(o.x+i,o.y,s*4+i)*4)|0]; 
            ctx.fillRect(x+8+i*4, sy, 3, 7); 
            ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(x+8+i*4, sy, 1, 7); // Блик на корешке
        }
    }
    if(furnLocked(k)){
        ctx.fillStyle = "#15181c"; ctx.fillRect(x+14,y+17,5,6); 
        ctx.fillStyle = PAL.gold; ctx.fillRect(x+16,y+19,1,3);
    } else {
        ctx.fillStyle = "#0a0805"; ctx.fillRect(x+7,y+7,2,21); 
    }
}

// ============================== СУЩНОСТИ И UI ==============================

function drawHuman(e, shirt, skin, hair, isPlayer){
    const px = e.x*TILE, py = e.y*TILE;
    const step = e.moving ? Math.sin(e.anim||0)*2 : 0;
    const bob = e.moving ? Math.abs(Math.sin(e.anim||0)) : 0;
    const top = py - bob;
    
    // Тень стала мягче
    ctx.fillStyle = "rgba(10, 15, 10, 0.4)"; ctx.beginPath();
    ctx.ellipse(px, py+11, 9, 3, 0, 0, 7); ctx.fill();
    
    // Ноги
    ctx.fillStyle = "#2a2015";
    ctx.fillRect(px-5, top+2+step, 4, 9-step); ctx.fillRect(px+1, top+2-step, 4, 9+step);
    ctx.fillStyle = "#150f08";
    ctx.fillRect(px-5, top+9+step, 4, 2); ctx.fillRect(px+1, top+9-step, 4, 2);
    
    // Тело
    ctx.fillStyle = "#120c06"; ctx.fillRect(px-8, top-9, 16, 14); 
    ctx.fillStyle = shirt; ctx.fillRect(px-7, top-8, 14, 12);
    // Тень на одежде
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(px-7, top, 14, 4); 
    // Блик на одежде
    ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fillRect(px-7, top-8, 14, 2); 
    
    // Руки
    ctx.fillStyle = skin;
    ctx.fillRect(px-10, top-6+step*.5, 3, 8); ctx.fillRect(px+7, top-6-step*.5, 3, 8);
    
    // Голова
    ctx.fillStyle = "#120c06"; ctx.fillRect(px-7, top-21, 14, 14); 
    ctx.fillStyle = skin; ctx.fillRect(px-6, top-20, 12, 12);
    ctx.fillStyle = hair; ctx.fillRect(px-6, top-21, 12, 5);
    // Блик на волосах
    ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.fillRect(px-4, top-20, 8, 1);
    
    if(isPlayer){ 
        ctx.fillStyle = "#8a6635"; ctx.fillRect(px-8, top-22, 16, 3); 
        ctx.fillRect(px-5, top-25, 10, 3); 
    }
    
    // Глаза с бликом
    ctx.fillStyle = "#111";
    const ex = e.dir==="left" ? -3 : e.dir==="right" ? 1 : -3;
    const ey = e.dir==="up" ? -16 : -14;
    if(e.dir!=="up"){ 
        ctx.fillRect(px+ex, top+ey, 2, 2); ctx.fillRect(px+ex+4, top+ey, 2, 2);
        ctx.fillStyle = "#fff";
        ctx.fillRect(px+ex, top+ey, 1, 1); ctx.fillRect(px+ex+4, top+ey, 1, 1); // Блик в глазах
    }
}

function wrapText(t, max){
    const words = t.split(/\s+/); const lines=[]; let cur="";
    for(const w of words){
        if((cur+" "+w).trim().length > max){ if(cur) lines.push(cur); cur=w; }
        else cur = (cur?cur+" ":"")+w;
        if(lines.length >=3) break;
    }
    if(cur && lines.length <3) lines.push(cur);
    return lines;
}

function drawBubble(n){
    const text = n.bubble ? n.bubble.text : n.status;
    if(!text) return;
    const lines = wrapText(text, 22);
    ctx.font = "12px 'Segoe UI', sans-serif";
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 18;
    const h = lines.length*15 + 12;
    const bx = n.x*TILE - w/2, by = n.y*TILE - 40 - h;
    
    ctx.globalAlpha = n.bubble ? Math.min(1, n.bubble.t) : 0.95;
    
    // Тень пузыря
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.roundRect(bx+2, by+2, w, h, 10); ctx.fill();
    
    // Основа пузыря
    ctx.fillStyle = "rgba(25, 18, 10, 0.92)";
    ctx.beginPath(); ctx.roundRect(bx, by, w, h, 10); ctx.fill();
    
    // Градиентная рамка
    ctx.strokeStyle = "rgba(245, 215, 123, 0.6)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bx+.75, by+.75, w-1.5, h-1.5, 9); ctx.stroke();
    
    ctx.fillStyle = "#f7ecd0";
    lines.forEach((l,i) => ctx.fillText(l, bx+9, by+17+i*15));
    ctx.globalAlpha = 1;
}

function drawNPCLabel(n){
    ctx.font = "11px 'Pixelify Sans','Segoe UI',sans-serif";
    const label = n.name + " " + n.mood;
    const w = ctx.measureText(label).width;
    const bx = n.x*TILE - w/2 - 5, by = n.y*TILE - 37;
    
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(bx+1, by+1, w+10, 16);
    ctx.fillStyle = "rgba(25, 18, 10, 0.9)"; ctx.fillRect(bx, by, w+10, 16);
    drawBevel(bx, by, w+10, 16, "rgba(245, 215, 123, 0.3)", "rgba(0,0,0,0.5)");
    
    ctx.fillStyle = "#f5d77b"; ctx.fillText(label, n.x*TILE - w/2, by+12);
}

function drawGroundItem(g, now){
    const x = g.x*TILE, y = g.y*TILE;
    drawContactShadow(x, y+10, 32, 15, 0.3);
    
    const bob = Math.sin(now*2.4 + g.x*0.85 + g.y*0.5)*1.5;
    
    // Эффект свечения (Glow) для предмета
    const glowAlpha = (Math.sin(now * 3) * 0.2 + 0.3);
    ctx.fillStyle = `rgba(245, 215, 123, ${glowAlpha})`;
    ctx.beginPath(); ctx.arc(x+16, y+17+bob, 10, 0, 7); ctx.fill();
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(ITEMS[g.id].i, x+16, y+17+bob);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

let cam = {x: -1, y: -1};
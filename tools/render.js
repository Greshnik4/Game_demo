"use strict";
/* Визуальная проверка спрайтов без браузера:
   node tools/render.js out.png [scale]
   Стенд: трава/тропа, вертикальный и горизонтальный забор,
   дверь в фазах 0 / .25 / .5 / .75 / 1, персонажи: 4 направления × (стой/шаг). */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

// ---- mock DOM/canvas с журналом операций ----
let _font = "8px sans";
class Ctx {
  constructor(cv){ this.cv = cv; this.fillStyle="#000"; this.strokeStyle="#000"; this.lineWidth=1;
    this.globalAlpha=1; this.textAlign="left"; this.textBaseline="alphabetic"; }
  save(){} restore(){} translate(){} scale(){} setTransform(){} rotate(){}
  fillRect(x,y,w,h){ if(!isFinite(x+y+w+h)) throw new Error(`NaN rect ${x},${y},${w},${h}`);
    this.cv.ops.push({t:"rect", x,y,w,h,c:this.fillStyle,a:this.globalAlpha}); }
  beginPath(){ this._pts=[]; }
  moveTo(x,y){ this._cur=[[x,y]]; }
  lineTo(x,y){ this._cur.push([x,y]); }
  arc(x,y,r){ /* квады дверей рисуются lineTo; дуги — только тени/кроны: аппрокс. квадратом */ 
    this._cur = this._cur||[]; this._cur.push([x-r,y-r],[x+r,y-r],[x+r,y+r],[x-r,y+r]); }
  ellipse(x,y,rx,ry){ this._cur = this._cur||[]; this._cur.push([x-rx,y-ry],[x+rx,y-ry],[x+rx,y+ry],[x-rx,y+ry]); }
  roundRect(x,y,w,h){ this.fillRect(x,y,w,h); }
  closePath(){}
  fill(){ for(const p of (this._cur||[])) if(p.length>=3) this.cv.ops.push({t:"poly", pts:p.slice(), c:this.fillStyle, a:this.globalAlpha}); this._cur=null; }
  stroke(){}
  fillText(t,x,y){ this.cv.ops.push({t:"text", s:t, x,y,c:this.fillStyle,f:_font}); }
  measureText(s){ return {width:s.length*6}; }
  createRadialGradient(){ return {addColorStop(){}}; }
}
Object.defineProperty(Ctx.prototype, "font", { get(){return _font;}, set(v){_font=v;} });
class Canvas { constructor(w,h){ this.width=w; this.height=h; this.ops=[]; } getContext(){ return new Ctx(this);} addEventListener(){} }
const elements = {};
global.document = {
  getElementById(id){ if(!elements[id]) elements[id] = id==="cv" ? new Canvas(192,192) : {id, classList:{remove(){},add(){},toggle(){}}, textContent:"", style:{}, appendChild(){}, setAttribute(){}}; return elements[id]; },
  createElement(tag){ return {tag, style:{}, classList:{add(){},remove(){},toggle(){}}, appendChild(){}, setAttribute(){}}; },
  addEventListener(){}, body:{appendChild(){}},
};
global.window = global;
global.innerWidth = 192; global.innerHeight = 192;
global.devicePixelRatio = 1;
global.addEventListener = ()=>{};
global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
global.performance = { now: ()=>0 };
global.requestAnimationFrame = ()=>{};
global.location = { search:"" };
global.navigator = { userAgent:"node" };
global.fetch = ()=>Promise.reject(new Error("no net"));
global.Image = class { set src(v){ if(this.onload) setTimeout(this.onload,0);} };
global.AudioContext = class {
  constructor(){ this.destination={}; this.currentTime=0; }
  createOscillator(){ return {connect(){}, start(){}, stop(){}, frequency:{setValueAtTime(){}}}; }
  createGain(){ return {connect(){}, gain:{value:0, setValueAtTime(){}, exponentialRampToValueAtTime(){}}}; }
  resume(){}
};

// ---- загрузка игровых модулей ----
const files = ["js/data/objects.js","js/data/map.js","js/map.js","js/entities.js","js/inventory.js","js/sprites.js"];
let src = "";
for(const f of files) src += fs.readFileSync(path.join(ROOT,f),"utf8").replace(/^"use strict";\s*/m,"") + "\n";
src += "\nglobalThis.__EXPORT__ = {drawSurfaceArt, drawFence, drawDoor, drawHuman, PAL, TILE, ctx, cv, doorAnim, OBJECTS};\n";
eval(src);
const EX = globalThis.__EXPORT__;
const cv = EX.cv, ctx = EX.ctx;
const drawSurfaceArt = EX.drawSurfaceArt, drawFence = EX.drawFence, drawDoor = EX.drawDoor, drawHuman = EX.drawHuman, doorAnim = EX.doorAnim;

// ---- стенд ----
const SCALE = Number(process.argv[3]||4);
// расширяем виртуальный холст: пересоздаём ops на большом поле через translate-эмуляцию
cv.width = 480; cv.height = 300; cv.ops.length = 0;

function label(text, x, y){
  // псевдо-подпись: рисуем тонкую плашку (глифы rasterizer не поддерживает — ориентируемся по позициям)
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, text.length*5, 2);
}

// фон — трава со «швом» тайлов, чтобы видеть выравнивание
ctx.fillStyle = "#3f6b3a"; ctx.fillRect(0,0,480,300);
ctx.fillStyle = "#487a43";
for(let ty=0; ty<20; ty++) for(let tx=0; tx<30; tx++)
  if((tx+ty)%2===0) ctx.fillRect(tx*16, ty*16, 16, 16);

// 1) поверхность: тропа + цветы + вода с берегом
for(let i=0;i<6;i++) drawSurfaceArt(",", 1+i, 1, 0);
for(let i=0;i<4;i++) drawSurfaceArt("F", 1+i, 3, 0);
for(let yy=0;yy<3;yy++) for(let xx=0;xx<4;xx++) drawSurfaceArt("~", 12+xx, 1+yy, 0);

// 2) заборы: вертикальный ряд (объект 1×4) и горизонтальный (4×1)
const fenceV = {t:"f", x:2, y:6, w:1, h:4, cx:2, cy:6, cw:1, ch:4};
const fenceH = {t:"f", x:6, y:6, w:4, h:1, cx:6, cy:6, cw:4, ch:1};
drawFence(fenceV, 0);
drawFence(fenceH, 0);

// 3) двери: фазы 0, .25, .5, .75, 1 — объект 2×1 в стене
const phases = [0, 0.25, 0.5, 0.75, 1];
phases.forEach((p,i)=>{
  const dx = 12 + i*3, dy = 6;               // тайловые координаты левого верха
  const o = {t:"D", x:dx, y:dy, w:2, h:1, cx:dx, cy:dy, cw:2, ch:1};
  doorAnim[dx+","+dy] = p;
  drawDoor(o, 0);
});

// 4) персонажи: dir down/up/left/right × стоящий/шагающий
const dirs = ["down","up","left","right"];
dirs.forEach((d,i)=>{
  const e1 = {x:13+i*3, y:12, dir:d, moving:false, anim:0};
  const e2 = {x:13+i*3, y:15, dir:d, moving:true, anim:Math.PI/2}; // шаг в максимуме замаха
  drawHuman(e1, "#4a6a3a", "#e0b088", "#4a3520", true);
  drawHuman(e2, "#8a4a4a", "#d9a06e", "#2c2118", false);
});

// ---- растеризация ops -> PNG ----
const W = cv.width*SCALE, H = cv.height*SCALE;
const buf = Buffer.alloc(W*H*4, 0);
function parseCol(c){
  if(typeof c!=="string") return [0,0,0,255];
  let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if(m){ let h=m[1]; if(h.length===3) h=h.split("").map(x=>x+x).join("");
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), 255]; }
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if(m){ const p=m[1].split(",").map(Number); return [p[0],p[1],p[2], Math.round((p[3]??1)*255)]; }
  return [255,0,255,255];
}
function blendPx(i, col, aMul){
  const px = buf.subarray(i, i+4);
  const [r,g,b,a0]=col, a=(a0/255)*(aMul==null?1:aMul);
  if(a<=0) return;
  const sa=px[3]/255, na=a+(1-a)*sa;
  if(na<=0) return;
  px[0]=Math.round((r*a + px[0]*sa*(1-a))/na);
  px[1]=Math.round((g*a + px[1]*sa*(1-a))/na);
  px[2]=Math.round((b*a + px[2]*sa*(1-a))/na);
  px[3]=Math.round(na*255);
}
function rrect(x,y,w,h,col,a){
  const X0=Math.round(x*SCALE), Y0=Math.round(y*SCALE), X1=Math.round((x+w)*SCALE), Y1=Math.round((y+h)*SCALE);
  for(let yy=Math.max(0,Y0); yy<Math.min(H,Y1); yy++)
    for(let xx=Math.max(0,X0); xx<Math.min(W,X1); xx++) blendPx((yy*W+xx)*4, col, a);
}
function rpoly(pts, col, a){
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for(const [x,y] of pts){ minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); }
  for(let yy=Math.max(0,Math.floor(minY*SCALE)); yy<Math.ceil(maxY*SCALE)&&yy<H; yy++){
    const py=(yy+0.5)/SCALE;
    const xs=[];
    for(let k=0;k<pts.length;k++){
      const [x1,y1]=pts[k], [x2,y2]=pts[(k+1)%pts.length];
      if((y1<=py&&y2>py)||(y2<=py&&y1>py)) xs.push(x1+(py-y1)/(y2-y1)*(x2-x1));
    }
    xs.sort((u,v)=>u-v);
    for(let j=0;j+1<xs.length;j+=2){
      const X0=Math.round(xs[j]*SCALE), X1r=Math.ceil(xs[j+1]*SCALE);
      for(let xx=Math.max(0,X0); xx<Math.min(W,X1r); xx++) blendPx((yy*W+xx)*4, col, a);
    }
  }
}
for(const op of cv.ops){
  if(op.t==="rect") rrect(op.x,op.y,op.w,op.h,parseCol(op.c),op.a);
  else if(op.t==="poly") rpoly(op.pts, parseCol(op.c), op.a);
}
// upscale уже встроен (SCALE), сохраняем PNG
const zlib = require("zlib");
function crc32(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c = (c>>>1) ^ (0xEDB88320 & -(c&1)); } return ~c>>>0; }
function chunk(type, data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td=Buffer.concat([Buffer.from(type),data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len,td,crc]); }
const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=6;
const raw=Buffer.alloc(H*(1+W*4));
for(let yy=0; yy<H; yy++){ raw[yy*(1+W*4)]=0; buf.copy(raw, yy*(1+W*4)+1, yy*W*4, (yy+1)*W*4); }
const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
  chunk("IHDR",ihdr), chunk("IDAT",zlib.deflateSync(raw)), chunk("IEND",Buffer.alloc(0))]);
fs.writeFileSync(process.argv[2]||"stand.png", png);
console.log("ops:", cv.ops.length, "-> saved", process.argv[2]||"stand.png", W+"x"+H);

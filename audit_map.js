// Аудит карты: цельность стен домов, двери только снизу, дорожка до двери,
// непроходимая граница мира (утечки наружу), корректная склейка объектов.
// Карла собирается прямо из js/map.js (сетка 16px), поэтому скрипт исполняет
// map.js со стабами и проверяет уже готовые гриды.
const fs = require("fs");
const src = fs.readFileSync("js/map.js", "utf8");
const objSrc = fs.readFileSync("js/data/objects.js", "utf8");
const mapSrc = fs.readFileSync("js/data/map.js", "utf8");
global.localStorage = { _d:{}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } };
const hook = `;globalThis.__M = { MW, MH, GROUND, OBJECTS, UP_AT, LOW_AT, SOLID, HOUSES, PLACES, walkable, tileWalkable };`;
eval('"use strict";\n' + objSrc + mapSrc + src + hook);
const M = globalThis.__M;
const { MW, MH, GROUND, OBJECTS, SOLID, HOUSES } = M;

let problems = 0;
const bad = (...a)=>{ console.log("PROBLEM:", ...a); problems++; };
const solidAt = (x,y)=> x<0||y<0||x>=MW||y>=MH ? true : SOLID[y][x];
// для связности дверь считаем проходимой: заперта она или нет — вопрос сейва, а не геометрии
const walk = (x,y)=>{
  const o = M.UP_AT[y][x];
  if(o && o.t === "D") return true;
  return M.walkable(x+0.5, y+0.5);
};

// дома: стены замкнуты, дверь одна и снизу, крыша — один объект
for(const h of HOUSES){
  for(let x=h.x0; x<=h.x1; x++){
    if(x>=h.door && x<h.door+2){
      const o = M.UP_AT[h.y1][x];
      if(!o || o.t !== "D") bad(h.x0, `дверь (${x},${h.y1}) не дверь`);
      continue;
    }
    if(M.LOW_AT[h.y0][x]?.t !== "#") bad(`стена (${x},${h.y0})`);
    if(M.LOW_AT[h.y1][x]?.t !== "#") bad(`стена (${x},${h.y1})`);
  }
  for(let y=h.y0+1; y<=h.y1-1; y++)
    for(const x of [h.x0, h.x1])
      if(M.LOW_AT[y][x]?.t !== "#") bad(`боковая стена (${x},${y})`);
  const roof = OBJECTS.find(o => (o.t==="R"||o.t==="r") && o.x===h.x0 && o.y===h.y0-2 && o.w===h.x1-h.x0+1);
  if(!roof) bad(`крыша дома x${h.x0} не найдена/не прямоугольная`);
  // интерьер — пол
  for(let y=h.y0+1; y<=h.y1-1; y++) for(let x=h.x0+1; x<=h.x1-1; x++){
    const g = GROUND[y][x];
    if(g!=="H" && g!=="u") bad(`интерьер (${x},${y})='${g}'`);
  }
  // подход к двери — дорожка
  if(GROUND[h.y1+1][h.door] !== ",") bad(`под дверью (${h.door},${h.y1+1}) нет дорожки`);
}

// все двери — только на нижних стенах домов
for(const o of OBJECTS) if(o.t === "D"){
  if(!HOUSES.some(h => h.door === o.x && h.y1 === o.y)) bad(`дверь вне нижней стены: (${o.x},${o.y})`);
  if(o.w !== 2 || o.h !== 1) bad(`дверь (${o.x},${o.y}) не 2×1`);
}

// граница мира непроходима целиком (2 тайла леса)
for(let x=0; x<MW; x++) for(const y of [0,1,MH-2,MH-1]) if(!solidAt(x,y)) bad(`граница (${x},${y}) проходима`);
for(let y=2; y<MH-2; y++) for(const x of [0,1,MW-2,MW-1]) if(!solidAt(x,y)) bad(`граница (${x},${y}) проходима`);

// flood fill по проходимым центрам тайлов от точки старта: ни один проходимый
// тайл границы недостижим, все проходимые тайлы внутри связны со стартом
const seen = new Set(["65,41"]); const q=[[65,41]];
while(q.length){
  const [x,y] = q.pop();
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=x+dx, ny=y+dy;
    if(nx<0||ny<0||nx>=MW||ny>=MH){ bad(`утечка из мира через (${x},${y})`); continue; }
    const k = nx+","+ny;
    if(!seen.has(k) && walk(nx,ny)){ seen.add(k); q.push([nx,ny]); }
  }
}
for(let y=0; y<MH; y++) for(let x=0; x<MW; x++)
  if(walk(x,y) && !seen.has(x+","+y)) bad(`непроходимый островок (${x},${y})`);

// склейка семян: ни одного объекта "O" или "f" с соседом того же типа впритык
// (иначе merge не сработал)
for(const o of OBJECTS){
  if(o.t !== "O" && o.t !== "f") continue;
  const right = M.UP_AT[o.y]?.[o.x+o.w] || M.LOW_AT[o.y]?.[o.x+o.w];
  if(right && right.t === o.t && right !== o) bad(`несклеенный сосед справа у (${o.x},${o.y})`);
  if(o.t === "O"){
    const down = M.LOW_AT[o.y+o.h]?.[o.x];
    if(down && down.t === "O" && down !== o) bad(`несклеенный сосед снизу у (${o.x},${o.y})`);
  }
}

// коллизии по типам: ровно столько тайлов, сколько объект занимает по смыслу
const EXPECT = {
  "#": [1,1], "D": [2,1], "S": [1,1], "T": [2,1],
  "b": [2,2], "t": [2,2], "c": [2,2], "B": [2,2], "A": [2,2],
};
for(const o of OBJECTS){
  const e = EXPECT[o.t]; if(!e) continue;
  if(o.cw !== e[0] || o.ch !== e[1]) bad(`${o.t} (${o.x},${o.y}): коллизия ${o.cw}×${o.ch}, ожидалось ${e[0]}×${e[1]}`);
}
for(const o of OBJECTS){
  // камень: 1×1, ряд 2×1/1×2 или глыба 2×2
  if(o.t === "O" && !((o.cw===1&&o.ch===1)||(o.cw===2&&o.ch===1)||(o.cw===1&&o.ch===2)||(o.cw===2&&o.ch===2)))
    bad(`камень (${o.x},${o.y}) странного размера ${o.cw}×${o.ch}`);
  // забор — целый ряд (горизонтальный или вертикальный)
  if(o.t === "f" && o.cw !== 1 && o.ch !== 1) bad(`забор (${o.x},${o.y}) не ряд: ${o.cw}×${o.ch}`);
  // крыши и лес: коллизия = весь рисунок
  if((o.t==="R"||o.t==="r"||o.t==="L") && (o.cw!==o.w || o.ch!==o.h))
    bad(`${o.t} (${o.x},${o.y}) коллизия ${o.cw}×${o.ch} не совпадает с рисунком ${o.w}×${o.h}`);
  // рисунок больше коллизии, и коллизия — внизу рисунка (ствол/стойка стоят на земле)
  if(o.t === "T" && (o.cy !== o.y+o.h-1 || o.cx !== o.x)) bad(`дерево (${o.x},${o.y}) смещено относительно рисунка`);
  if(o.t === "S" && (o.cy !== o.y+o.h-1 || o.cx !== o.x)) bad(`указатель (${o.x},${o.y}) смещён относительно рисунка`);
}

console.log(problems? `\n${problems} проблем` : "карта чистая");

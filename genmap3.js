// Дамп собранной карты в ASCII (сетка 16px) — для глазамий проверки склейки
// объектов и целостности домов. Старый генератор MAP_SRC больше не нужен:
// карта собирается программно прямо в js/map.js.
const fs = require("fs");
const src = fs.readFileSync("js/map.js", "utf8");
const objSrc = fs.readFileSync("js/data/objects.js", "utf8");
const mapSrc = fs.readFileSync("js/data/map.js", "utf8");
global.localStorage = { _d:{}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } };
const hook = `;globalThis.__M = { MW, MH, GROUND, OBJECTS, UP_AT, LOW_AT };`;
eval('"use strict";\n' + objSrc + mapSrc + src + hook);
const M = globalThis.__M;

// каждая клетка: верхний слой > нижний > поверхность
const grid = Array.from({length:M.MH}, (_,y) =>
  Array.from({length:M.MW}, (_,x) =>
    (M.UP_AT[y][x] && M.UP_AT[y][x].t) || (M.LOW_AT[y][x] && M.LOW_AT[y][x].t) || M.GROUND[y][x]));

console.log(grid.map(r => r.join("")).join("\n"));

// сводка по объектам: сколько экземпляров и какие размеры получились после склейки
const byType = {};
for(const o of M.OBJECTS){
  const k = o.t + " " + o.w + "×" + o.h;
  byType[k] = (byType[k]||0) + 1;
}
console.log("\nобъекты:");
for(const k of Object.keys(byType).sort()) console.log("  " + k + " ×" + byType[k]);

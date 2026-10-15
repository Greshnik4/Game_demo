"use strict";
/* ============================== РЕСУРС: ТИПЫ ОБЪЕКТОВ ==============================
   Единый справочник объектов мира. Чтобы добавить объект или изменить его
   поведение/вид — правь только эту таблицу, код карты и отрисовки подхватит.

   Свойства типа:
   - layer:  "lower" — рисуется под сущностями и блокирует обзор;
             "upper" — рисуется поверх с сортировкой по нижней кромке.
   - solid:  блокирует проход (для двери — false, проходимость решает замок).
   - vw,vh:  визуальное пятно в тайлах (сколько рисуется).
   - cw,ch:  коллизионное пятно (сколько блокирует); ox,oy — его смещение
             внутри визуального. Так дерево 2×2 блокирует два тайла внизу,
             а указатель 2×3 стоит на одном тайле.
   - merge:  {w,h} — метки-семена склеиваются в один объект до w×h тайлов
             (4 камня 1×1 -> один 2×2, ряд штакетин -> один забор).
   - tip:    подсказка при клике; llm: имя для текста карты (LLM) и журнала.
   - draw:   имя функции отрисовки в sprites.js. */
const OBJ_DEF = {
  "#": {layer:"lower", solid:true,  tip:"🧱 Стена дома",            llm:"стена",   draw:"drawWallCell"},
  "R": {layer:"lower", solid:true,  tip:"🏠 Крыша",                 llm:"крыша",   draw:"drawRoof"},
  "r": {layer:"lower", solid:true,  tip:"🏠 Крыша",                 llm:"крыша",   draw:"drawRoof"},
  "O": {layer:"lower", solid:true,  merge:{w:3,h:3}, tip:"🪨 Камень", llm:"камень", draw:"drawRock"},
  "S": {layer:"lower", solid:true,  vw:2, vh:3, cw:1, ch:1, ox:0, oy:2,
        tip:"🪧 Указатель на Веронт", llm:"столб", draw:"drawSign"},
  "L": {layer:"upper", solid:true,  tip:"🌲 Плотный лес", llm:"лес", draw:"drawForest"},
  "T": {layer:"upper", solid:true,  vw:2, vh:2, cw:2, ch:1, ox:0, oy:1,
        tip:"🌳 Дерево", llm:"лес", draw:"drawTree"},
  "D": {layer:"upper", solid:false, vw:2, vh:1,
        tip:"🚪 Дверь", llm:"дверь", draw:"drawDoor"},
  "b": {layer:"upper", solid:true,  vw:2, vh:2, tip:"🛏️ Кровать",   llm:"кровать", draw:"drawBed",   furn:true},
  "t": {layer:"upper", solid:true,  vw:2, vh:2, tip:"🍽️ Стол",      llm:"стол",    draw:"drawTable", furn:true},
  "c": {layer:"upper", solid:true,  vw:2, vh:2, tip:"📦 Сундук",    llm:"сундук",  draw:"drawChest", storage:true},
  "B": {layer:"upper", solid:true,  vw:2, vh:2, tip:"🗄️ Шкаф",      llm:"шкаф",    draw:"drawShelf", storage:true},
  "A": {layer:"upper", solid:true,  vw:2, vh:2, tip:"⚒️ Наковальня — здесь Брон кует железо", llm:"наковальня", draw:"drawAnvil", furn:true},
  "f": {layer:"upper", solid:true,  merge:{w:8,h:8}, tip:"🚧 Забор", llm:"забор", draw:"drawFence"},
};

/* Подсказки для поверхности (не объекты, но кликаются). */
const GROUND_TIP = { "~":"🌊 Пруд" };

"use strict";
/* ============================== LLM ==============================
   Профили берутся из llm-config.js (window.LLM_CONFIGS).
   Формат ответа персонажа — строгий JSON (см. JSON_RULES). */
const LCFGS = window.LLM_CONFIGS ||
  (window.LLM_CONFIG ? [{ name:"Основной", endpoint:window.LLM_CONFIG.endpoint, apiKey:window.LLM_CONFIG.apiKey, model:window.LLM_CONFIG.model }] : []);
const DEF_SETTINGS = LCFGS.length
  ? { profile:LCFGS[0].name, base:LCFGS[0].endpoint, model:LCFGS[0].model, key:LCFGS[0].apiKey, reasoning:"" }
  : { profile:"", base:"http://localhost:11434/v1", model:"llama3.1", key:"", reasoning:"" };
function getSettings(){
  try{ return Object.assign({}, DEF_SETTINGS, JSON.parse(localStorage.getItem("veront_llm")||"{}")); }
  catch(e){ return {...DEF_SETTINGS}; }
}
const JSON_RULES = [
"Отвечай СТРОГО одним валидным JSON без markdown и пояснений:",
'{"reply":"речь персонажа","mood":"один эмодзи настроения","action":{"type":"..."}}',
"- reply: что персонаж говорит вслух (по-русски, 1-3 коротких предложения, в своём стиле).",
"- action (что персонаж делает в ответ на беседу), выбери один:",
'  {"type":"face"} — повернуться к игроку;',
'  {"type":"move","to":"название места"} — любое далёкое перемещение только так (игра сама проложит путь в обход стен);',
'  {"type":"move","x":N,"y":N} — только короткий шаг (не дальше ~10 тайлов от тебя);',
'  {"type":"emote","text":"эмодзи или жест"} — показать облачко над головой;',
'  {"type":"follow"} — пойти следом за игроком;',
'  {"type":"stop"} — перестать следовать;',
'  {"type":"wander"} — вернуться к своим делам.',
'  {"type":"give","item":"название"} — отдать игроку предмет из своего инвентаря; открытые — если попросил или заслужил, скрытые — только как награду за квест или за особенно хороший поступок;',
'  {"type":"take","item":"название"} — забрать предмет у игрока (только если он согласился по ходу разговора).',
'- quest (необязательное поле — задания игроку), выбери один вариант:',
'  {"state":"offer","title":"название","goal":"что нужно сделать","reward":число} — предложить новый квест;',
'  {"state":"complete"} — засчитать квест выполненным (только если игрок по ходу разговора реально выполнил цель);',
'  {"state":"abandon"} — отменить квест.',
'Предлагай не больше одного активного квеста; цель должна подходить твоему характеру и быть достижимой в разговоре или прогулкой по деревне.',
'Если действие не нужно — используй {"type":"face"}.',
'Необязательное поле "status" — короткая подсказка над твоей головой: настроение, желание или что не нравится (эмодзи и/или 1-4 слова, например "🍺 хочу выпить", "😒 налоги", "😊 рад гостю"). Обновляй его, если разговор что-то изменил.'
].join("\n");

/* ============================== ЗНАНИЕ NPC ==============================
   У каждого NPC последнее известное состояние: veront_know_<id> =
   { thefts:[{item,t}] — записи о кражах (своих или увиденных),
     pending:[{kind,item,t}] — накопленные, ещё не обдуманные события,
     traits:[] — обобщённые представления об игроке }.
   Действия игрока/NPC складывают события в pending (worldEvent).
   При разговоре или рефлексии NPC «переваривает»: thefts -> traits
   (обобщение по категории: яблоко+яблоко = "ворует фрукты"), pending очищается.
   Если событий накопилось много или они застарели — NPC рефлексирует сам
   (reflect) и может начать действовать. */
NPCS.forEach(n => { n.know = loadKnow(n.id); n.reflectTick = 0; });
function loadKnow(id){
  try{ const v = JSON.parse(localStorage.getItem("veront_know_"+id));
    return v && Array.isArray(v.pending) ? v : {thefts:[], pending:[], traits:[]}; }
  catch(e){ return {thefts:[], pending:[], traits:[]}; }
}
function saveKnow(n){ saveJSON("veront_know_"+n.id, n.know); }
// домашние хранилища NPC по ключу "x,y" (или null — общественная мебель)
function npcOwnsFurn(k){
  const [x,y] = k.split(",").map(Number);
  const p = placeAt(x,y);
  const u = upperAt(x,y);
  return (p && p.npc && (u==="c"||u==="B")) ? p.npc : null;
}
// событие мира: владелец замечает напрямую, ближайшие NPC (<=10) — видят
function worldEvent(kind, ownerId, data){
  const t = worldTick;
  for(const n of NPCS){
    if(n.id===ownerId) n.know.pending.push(Object.assign({kind, t}, data));
    else if(data.wx!=null && Math.hypot(n.x-data.wx, n.y-data.wy) < 20) n.know.pending.push({kind:"saw", t, item:data.item});
    else continue;
    if(n.know.pending.length>12) n.know.pending.splice(0, n.know.pending.length-12);
  }
  for(const n of NPCS) saveKnow(n);
}
// обобщение записей о кражах в черты: 2+ кражи одной категории -> "ворует <кат>",
// разные категории -> "ворует всё подряд", одиночная -> "тянет чужое (<предмет>)"
function traitsFor(know){
  const byCat = {};
  for(const th of know.thefts){ const c = (ITEMS[th.item]||{}).cat || "misc"; byCat[c] = (byCat[c]||0)+1; }
  const cats = Object.keys(byCat), out = [];
  for(const c of cats) if(byCat[c]>=2) out.push("ворует "+CAT_ACC[c]);
  if(cats.length>=2) out.push("ворует всё подряд");
  else if(cats.length===1 && byCat[cats[0]]===1){
    const th = know.thefts[know.thefts.length-1];
    out.push("тянет чужое ("+(ITEMS[th.item]?ITEMS[th.item].n:"?")+")");
  }
  return out;
}
function commitKnow(n){
  const k = n.know;
  for(const e of k.pending) if(e.kind==="steal"||e.kind==="saw") k.thefts.push({item:e.item, t:e.t});
  if(k.thefts.length>24) k.thefts = k.thefts.slice(-24);
  k.pending = [];
  k.traits = traitsFor(k);
  saveKnow(n);
}
// «как давно» — в событиях мира, прошедших с момента события
function ago(t){
  const a = worldTick - t;
  if(a<0) return "давно"; // записи старых сохранений (реальное время)
  if(a<=3) return "только что";
  if(a<=10) return "недавно";
  if(a<=25) return "раньше";
  if(a<=60) return "давно";
  return "очень давно";
}
function eventsText(k){
  return k.pending.map(e =>
    (e.kind==="steal" ? "у тебя украли " : e.kind==="put" ? "в твоё хранилище положили " :
     e.kind==="gift" ? "игрок подарил тебе " : "ты видел: игрок украл ")
    + (ITEMS[e.item] ? itemLabel(e.item) : "?") + " ("+ago(e.t)+")").join("; ");
}
function knowledgeBlock(n){
  const k = n.know; let s = "";
  if(k.pending.length) s += "Ты заметил, но ещё не обдумал: "+eventsText(k)+".\n";
  if(k.traits.length) s += "Что ты думаешь об игроке: "+k.traits.join("; ")+".\n";
  return s;
}
// общая шапка персонажа для systemPrompt и рефлексии
function personaBlock(n){
  return "Ты играешь роль: " + n.name + ", " + n.role + ".\nХарактер и биография: " + n.persona + "\n";
}
// самостоятельная рефлексия: NPC обрабатывает накопленное и может начать действовать
async function reflect(n){
  const prevStatus = n.status;
  n.status = "🤔 задумался…"; // подсказка над головой, пока «переваривает» события
  try{
  const sys = WORLD_LORE + "\n" + poiText() + "\n" + personaBlock(n) +
    "Твоё положение: тайл (" + Math.round(n.x) + ", " + Math.round(n.y) + "). Положение игрока: тайл (" + Math.round(player.x) + ", " + Math.round(player.y) + ").\n" +
    knowledgeBlock(n) +
    'Ответь СТРОГО одним JSON: {"reply":"одна короткая мысль вслух","status":"подсказка над головой: эмодзи и 1-4 слова","action":{"type":"face|move|wander|follow|emote"}} — действуй по характеру: пойти к обидчику и потребовать вернуть, пойти домой проверить хранилище, насторожиться. Если идёшь — move только с "to" (название места), без координат. Если достаточно вздохнуть — {"type":"face"}.';
  const r = await llmFetch([
    {role:"system", content:sys},
    {role:"user", content:"Ты заметил: "+eventsText(n.know)+". Что думаешь и что делаешь?"},
  ]);
  if(chatNPC===n){ n.status = prevStatus; return; } // начался разговор — пусть обработает его там
  if(r.status) n.status = String(r.status).slice(0,40); else n.status = prevStatus;
  if(r.reply) n.bubble = {text:String(r.reply).slice(0,60), t:5};
  applyAction(n, r.action || {type:"face"}, r.reply);
  commitKnow(n);
  }catch(e){ n.status = prevStatus; throw e; }
}

function systemPrompt(n){
  return WORLD_LORE + "\n" + poiText() + "\n" + personaBlock(n) +
    "Твоё текущее положение на карте: тайл (" + Math.round(n.x) + ", " + Math.round(n.y) + ").\n" +
    "Вид вокруг тебя (9x9, ты в центре, @ — игрок):\n" + localView(n, player) + "\n" +
    "Куда можно пойти (move \"to\"): " + placeNames() + ".\n" +
    "Твоё состояние (подсказка над головой): " + (n.status||"") + ".\n" +
    "Положение игрока: тайл (" + Math.round(player.x) + ", " + Math.round(player.y) + ").\n" +
    (n.quest
      ? "Твой текущий квест для игрока: «" + n.quest.title + "», цель: " + n.quest.goal + ", статус: " + (n.quest.status==="done"?"выполнен":"активен") + ", награда: " + n.quest.reward + " золота.\n"
      : "Сейчас у тебя нет активного квеста для игрока — при случае можешь предложить ему задание по своему характеру.\n") +
    "У игрока золота: " + gold + ".\n" +
    "При себе, открыто (игрок это видит): " + (invListOpen(n).join(", ") || "ничего") + ".\n" +
    "Спрятано при тебе (это не для продажи: не показывай и не продавай, но можешь отдать как награду за квест или за особенно хороший поступок): " + (invList(Object.fromEntries(Object.entries(n.inv).filter(([id])=>isHidden(n,id)))).join(", ") || "ничего") + ".\n" +
    (homeFurnText(n) ? "У тебя дома запертые хранилища (игрок без ключа не откроет), ты знаешь, что в них: " + homeFurnText(n) + ".\n" : "") +
    knowledgeBlock(n) +
    "В инвентаре игрока: " + (invList(player.inv).join(", ") || "ничего") + ".\n" +
    "Всегда оставайся в роли. Никогда не признавайся, что ты ИИ-модель.\n" +
    JSON_RULES;
}

async function llmFetch(msgs){
  const s = getSettings();
  const headers = {"Content-Type":"application/json"};
  if(s.key) headers.Authorization = "Bearer "+s.key;
  const base = s.base.replace(/\/+$/, "");
  const isResponses = /\/responses$/.test(base);
  const url = (isResponses || /\/chat\/completions$/.test(base)) ? base : base + "/chat/completions";
  const body = isResponses
    ? {model:s.model, input:msgs, max_output_tokens:8000}
    : {model:s.model, messages:msgs, temperature:0.85, max_tokens:8000};
  if(s.reasoning){ // уровень размышлений: Responses API — reasoning.effort, chat/completions — reasoning_effort;
    // "none" — явно выключить (llama.cpp и совместимые), "" — не отправлять вовсе (дефолт модели)
    if(isResponses) body.reasoning = {effort:s.reasoning};
    else body.reasoning_effort = s.reasoning;
  }
  const res = await fetch(url, {method:"POST", headers, body:JSON.stringify(body)});
  if(!res.ok) throw new Error("HTTP "+res.status+": "+(await res.text()).slice(0,180));
  return parseLLM(extractText(await res.json()));
}
async function askLLM(n, userText){
  const msgs = [{role:"system", content:systemPrompt(n)}];
  for(const m of n.history.slice(-12))
    msgs.push({role: m.role==="npc" ? "assistant" : "user", content:m.text});
  msgs.push({role:"user", content:userText});
  return llmFetch(msgs);
}
function extractText(data){
  if(typeof data.output_text === "string" && data.output_text) return data.output_text;
  if(Array.isArray(data.output)){
    let out = "";
    for(const item of data.output){
      if(item.type === "message" && Array.isArray(item.content))
        for(const c of item.content)
          if(c.type==="output_text"||c.type==="text") out += c.text || "";
    }
    if(out) return out;
  }
  const ch = data.choices && data.choices[0] && data.choices[0].message;
  return (ch && ch.content) || "";
}
function parseLLM(content){
  const t = content.trim();
  let o = null;
  try{ o = JSON.parse(t); }catch(e){}
  if(!o || o.reply===undefined){
    const m = t.match(/\{[\s\S]*\}/);
    if(m){ try{ o = JSON.parse(m[0]); }catch(e){ o = null; } }
  }
  if(o && o.reply!==undefined)
    return {reply:String(o.reply), mood:o.mood||null, action:o.action||{type:"face"}, quest:o.quest||null, status:o.status||null};
  return {reply:t, mood:null, action:{type:"face"}, quest:null, status:null};
}

// место, названное в тексте реплики ("проверю будку" -> будка стражника) — страховка от галлюцинаций координат
function placeFromText(txt){
  const q = norm(txt);
  if(!q) return null;
  for(const p of PLACES.concat(EXTRA_PLACES)){
    for(const nm of [p.name, ...(p.alt||[])]){
      const k = norm(nm);
      if(k.length>2 && q.includes(k)){ const t = placeTarget(p); if(t) return t; }
    }
  }
  return null;
}
function applyAction(n, a, ctx){
  if(!a || typeof a !== "object") return;
  if(a.type==="move"){
    let x, y;
    if(a.to != null){
      const t = resolvePlace(a.to);
      if(!t){ n.bubble = {text:"Не знаю туда пути", t:3}; return; }
      x = t.x; y = t.y;
    } else {
      const cx = Math.max(1, Math.min(MW-2, a.x|0));
      const cy = Math.max(1, Math.min(MH-2, a.y|0));
      x = cx + .5; y = cy + .5;
      // дальние сырые координаты — частая галлюцинация модели; если в реплике названо место, верим месту
      if(Math.hypot(x-n.x, y-n.y) > 12){
        const t = placeFromText(ctx);
        if(t){ x = t.x; y = t.y; }
      }
    }
    if(blockClear(Math.round(x)-1, Math.round(y-0.5))){
      const p = findPath(n.x, n.y, x, y);
      if(p === null){ n.bubble = {text:"Не пройти туда", t:3}; n.state="wander"; }
      else { n.state="move"; n.tx=x; n.ty=y; n.path=p; }
    } else n.bubble = {text:"Туда не пройти", t:3};
  } else if(a.type==="face"){
    n.dir = faceDir(player.x-n.x, player.y-n.y, n.dir);
  } else if(a.type==="emote"){
    n.bubble = {text:String(a.text||"🙂"), t:4};
  } else if(a.type==="follow"){
    n.state="follow"; n.followUntil = performance.now()/1000 + 90;
  } else if(a.type==="stop"){
    n.state="wander";
  } else if(a.type==="wander"){
    n.state="wander"; n.tx=n.home.x+.5; n.ty=n.home.y+.5; n.path=null;
  } else if(a.type==="give"){
    const it = giveItem(n, a.item);
    if(it) toast(it.i + " " + n.name + " отдал тебе: " + it.n);
    else n.bubble = {text:"Нет у меня такого", t:3};
  } else if(a.type==="take"){
    const it = takeItem(n, a.item);
    if(it) toast(it.i + " " + n.name + " забрал: " + it.n);
    else n.bubble = {text:"У тебя этого нет", t:3};
  }
}

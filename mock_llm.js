// Мок OpenAI-совместимого сервера для теста цикла LLM->игра (только для разработки)
const http = require("http");
let calls = 0;
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.url === "/v1/models") {
    res.writeHead(200, {"Content-Type":"application/json"});
    return res.end(JSON.stringify({data:[{id:"mock-llm"}]}));
  }
  if (req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      calls++;
      const content = calls === 1
        ? JSON.stringify({
            reply: "Кузница закрыта, друг. Но есть дело: осмотри указатель у перекрёстка и доложи мне.",
            mood: "😄",
            action: { type: "face" },
            quest: { state: "offer", title: "Указатель у тракта", goal: "Осмотреть указатель у перекрёстка и доложить Брону", reward: 25 }
          })
        : JSON.stringify({
            reply: "Значит, указатель цел — и то ладно. Держи монеты, слово кузнеца крепкое.",
            mood: "🤝",
            action: { type: "emote", text: "🤝" },
            quest: { state: "complete" }
          });
      res.writeHead(200, {"Content-Type":"application/json"});
      res.end(JSON.stringify({choices:[{message:{role:"assistant", content}}]}));
    });
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(11434, "127.0.0.1", () => console.log("mock llm on 11434"));

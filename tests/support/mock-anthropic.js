// Scripted stand-in for the Anthropic Messages API, used by tests/ai-server.browser.js.
// POST /__script {turns:[{content,stop_reason}]} sets the replies for the next conversation;
// each /v1/messages call returns the next turn. GET /__log returns every request received.
const http = require("node:http");

function startMockAnthropic(port = 0) {
  let script = [];
  const log = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      const json = (status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
      if (req.method === "POST" && req.url === "/__script") { script = JSON.parse(body).turns || []; return json(200, { ok: true }); }
      if (req.method === "GET" && req.url === "/__log") return json(200, log);
      if (req.method === "POST" && req.url === "/v1/messages") {
        const payload = JSON.parse(body || "{}");
        log.push({ headers: { key: req.headers["x-api-key"], version: req.headers["anthropic-version"] }, payload });
        const turn = script.shift() || { content: [{ type: "text", text: "انتهى السيناريو." }], stop_reason: "end_turn" };
        if (turn.status) return json(turn.status, { type: "error", error: { type: "overloaded_error", message: "busy" } });
        return json(200, { id: "msg_test", type: "message", role: "assistant", model: payload.model, content: turn.content, stop_reason: turn.stop_reason || "end_turn" });
      }
      json(404, { error: "not found" });
    });
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}
module.exports = { startMockAnthropic };

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

await import("./agent.js");
const { answerQuestion } = globalThis.InboxAgentCore;

const root = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv();

const port = Number(process.env.PORT || 4175);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    if (!process.env[key.trim()]) process.env[key.trim()] = value;
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function fallbackInboxResponse(inbox, message) {
  const result = answerQuestion(inbox, message);
  return { mode: "local", inbox, result };
}

function repairInboxShape(previousInbox, candidate) {
  if (!candidate || typeof candidate !== "object") return previousInbox;
  const inbox = { ...previousInbox, ...candidate };
  inbox.emails = Array.isArray(inbox.emails) ? inbox.emails : previousInbox.emails;
  return inbox;
}

function repairResultShape(candidate) {
  const result = candidate && typeof candidate === "object" ? candidate : {};
  return {
    text: typeof result.text === "string" && result.text.trim()
      ? result.text
      : "I looked at the inbox. Ask me to summarize, prioritize, build a to-do list, or draft a reply.",
    tools: Array.isArray(result.tools) ? result.tools.filter((t) => typeof t === "string") : [],
    summary: typeof result.summary === "string" ? result.summary : "Updated from the triage model.",
    draftReply: typeof result.draftReply === "string" ? result.draftReply : undefined,
    focusEmailId: typeof result.focusEmailId === "string" ? result.focusEmailId : undefined
  };
}

function buildSystemPrompt() {
  return [
    "You are the triage engine for an email inbox agent web app.",
    "Return only valid JSON, no markdown.",
    "The app uses fake but plausible inbox data unless real data is provided.",
    "Given the previous inbox state and a user message, answer conversationally and optionally reference specific emails.",
    "The response JSON shape must be:",
    "{",
    "  \"inbox\": { same fields as previous inbox, emails array unchanged unless the user asked to mark something read/unread },",
    "  \"result\": { \"text\": string, \"tools\": string[], \"summary\": string, \"draftReply\": string (optional), \"focusEmailId\": string (optional) }",
    "}",
    "For tools, choose from scan_inbox, summarize_unread, prioritize, build_todo, draft_reply.",
    "Keep text concise and conversational, a few sentences at most."
  ].join("\n");
}

async function callAiGateway(inbox, message) {
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
  if (!key) return null;
  const model = process.env.AI_GATEWAY_MODEL || "openai/gpt-4.1-mini";

  const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: JSON.stringify({ previousInbox: inbox, message }) }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Gateway ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI Gateway returned no message content.");
  const parsed = JSON.parse(content);

  return {
    mode: "ai-gateway",
    inbox: repairInboxShape(inbox, parsed.inbox),
    result: repairResultShape(parsed.result)
  };
}

async function handleChat(req, res) {
  try {
    const { inbox, message } = await readJson(req);
    if (!inbox || !message) {
      sendJson(res, 400, { error: "Expected { inbox, message }." });
      return;
    }
    try {
      const aiResponse = await callAiGateway(inbox, message);
      if (aiResponse) {
        sendJson(res, 200, aiResponse);
        return;
      }
    } catch (error) {
      console.warn(error.message);
    }
    sendJson(res, 200, fallbackInboxResponse(inbox, message));
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleSeedInbox(req, res) {
  const { fakeInbox } = globalThis.InboxAgentCore;
  sendJson(res, 200, { inbox: fakeInbox() });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requested = normalize(pathname).replace(/^\/+/, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, requested);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    await handleChat(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/seed-inbox") {
    await handleSeedInbox(req, res);
    return;
  }
  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Email Inbox Agent running at http://127.0.0.1:${port}/`);
  console.log(process.env.AI_GATEWAY_API_KEY ? "AI Gateway enabled." : "No AI_GATEWAY_API_KEY found; using local fallback.");
});
const chatThread = document.getElementById("chat-thread");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const quickChips = document.getElementById("quick-chips");
const inboxList = document.getElementById("inbox-list");
const heroHeadline = document.getElementById("hero-headline");
const heroTimestamp = document.getElementById("hero-timestamp");
const unreadPill = document.getElementById("unread-pill");
const urgentPill = document.getElementById("urgent-pill");
const modeBadge = document.getElementById("mode-badge");
const resetBtn = document.getElementById("reset-btn");
const agentWorkTitle = document.getElementById("agent-work-title");
const agentWorkSub = document.getElementById("agent-work-sub");
const workCards = document.getElementById("work-cards").querySelectorAll(".work-card");

let state = { inbox: { emails: [] } };

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diffMs / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initialsOf(sender) {
  return sender
    .split(" ")
    .filter((p) => !/^(prof\.?|dr\.?|mr\.?|ms\.?|mrs\.?)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function renderInbox() {
  const emails = state.inbox.emails || [];
  const unread = emails.filter((e) => e.unread);
  const urgent = emails.filter((e) => e.urgent);

  unreadPill.querySelector(".stat-num").textContent = unread.length;
  urgentPill.querySelector(".stat-num").textContent = urgent.length;
  heroHeadline.textContent = unread.length ? `${unread.length} AWAITING TRIAGE` : "QUEUE CLEAR";
  heroTimestamp.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  inboxList.innerHTML = "";
  emails.forEach((email) => {
    const row = document.createElement("div");
    row.className = `email-row${email.unread ? " unread" : ""}`;
    row.innerHTML = `
      <div class="avatar">${initialsOf(email.sender)}</div>
      <div class="email-body">
        <div class="email-sender">${email.sender}</div>
        <div class="email-subject">${email.subject}</div>
        <div class="email-snippet">${email.snippet}</div>
      </div>
      ${email.urgent ? '<span class="stamp">PRIORITY</span>' : ""}
      <div class="email-time">${timeAgo(email.timestamp)}</div>
    `;
    row.addEventListener("click", () => {
      email.unread = false;
      appendBubble("agent", `${email.sender}: "${email.subject}"\n\n${email.body}`);
      renderInbox();
    });
    inboxList.appendChild(row);
  });
}

function appendBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  chatThread.appendChild(bubble);
  chatThread.scrollTop = chatThread.scrollHeight;
}

function updateAgentWork(result, mode) {
  modeBadge.textContent = mode === "ai-gateway" ? "AI Gateway" : "Local";
  agentWorkTitle.textContent = result.summary || "Ready for follow-up questions";
  agentWorkSub.textContent = "Ask for a summary, priorities, a to-do list, or a draft reply.";

  const toolMap = {
    scan_inbox: null,
    summarize_unread: 0,
    prioritize: 1,
    build_todo: 2,
    draft_reply: 3
  };

  workCards.forEach((card) => card.classList.remove("active"));
  (result.tools || []).forEach((tool) => {
    const idx = toolMap[tool];
    if (idx !== undefined && idx !== null) workCards[idx]?.classList.add("active");
  });

  if (result.draftReply) {
    appendBubble("agent", `Draft reply:\n${result.draftReply}`);
  }
}

async function sendMessage(message) {
  appendBubble("user", message);
  chatInput.value = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inbox: state.inbox, message })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    state.inbox = data.inbox;
    appendBubble("agent", data.result.text);
    updateAgentWork(data.result, data.mode);
    renderInbox();
  } catch (err) {
    appendBubble("agent", `Something went wrong: ${err.message}`);
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  sendMessage(message);
});

quickChips.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  sendMessage(btn.dataset.prompt);
});

resetBtn.addEventListener("click", async () => {
  await loadInbox();
  chatThread.innerHTML = "";
  appendBubble("agent", "Inbox reset. Ask me to summarize, prioritize, build a to-do list, or draft a reply.");
});

async function loadInbox() {
  const res = await fetch("/api/seed-inbox");
  const data = await res.json();
  state.inbox = data.inbox;
  renderInbox();
}

loadInbox();
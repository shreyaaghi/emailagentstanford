// local-mode inbox triage agent, no API key
// response using simple heuristics. Mirrors the travel agent's agent.js
// (globalThis.<Name>Core.answerQuestion pattern), can be swapped for a real model call

function fakeInbox() {
    const now = Date.now();
    const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();
  
    const emails = [
      {
        id: "e1",
        sender: "Prof. Dana Whitfield",
        senderEmail: "dwhitfield@stanford.edu",
        subject: "Deadline moved up: deliberation brief due Friday",
        snippet: "Quick heads up — the fall deliberation brief now needs to be in by Friday, not next week...",
        body: "Quick heads up — the fall deliberation brief now needs to be in by Friday, not next week. The room booking fell through for our original date. Can you send me a draft outline by tomorrow so I can review before it goes out? Thanks!",
        timestamp: hoursAgo(2),
        unread: true,
        urgent: true
      },
      {
        id: "e2",
        sender: "Stanford Housing Equity Project",
        senderEmail: "shep-board@stanford.edu",
        subject: "SHEP policy team meeting notes + action items",
        snippet: "Attached are notes from Tuesday's meeting. Two action items are assigned to you...",
        body: "Attached are notes from Tuesday's meeting. Two action items are assigned to you: (1) follow up with the RCD contact about the zoning testimony, (2) draft the one-pager summary for the coalition email. No rush, end of month is fine.",
        timestamp: hoursAgo(20),
        unread: true,
        urgent: false
      },
      {
        id: "e3",
        sender: "Alpha Phi Recruitment",
        senderEmail: "recruitment@alphaphi-stanford.org",
        subject: "Sign up for fall philanthropy shifts",
        snippet: "Shift sign-ups are open! Please pick at least two slots by the end of the week...",
        body: "Shift sign-ups are open! Please pick at least two slots by the end of the week. Link is in the group chat pinned message.",
        timestamp: hoursAgo(28),
        unread: false,
        urgent: false
      },
      {
        id: "e4",
        sender: "Ricky (DDL backend team)",
        senderEmail: "ricky@ddl-project.stanford.edu",
        subject: "Logging schema is live — please wire in before Sunday",
        snippet: "The shared logging helper (v0) is live. Every flow needs to emit at least one event before Sunday's check...",
        body: "The shared logging helper (v0) is live. Every flow needs to emit at least one event before Sunday's check-in so we can confirm traces are legible across all four demos. Docs are in the repo README. Ping me if you hit issues.",
        timestamp: hoursAgo(5),
        unread: true,
        urgent: true
      },
      {
        id: "e5",
        sender: "Stanford Course Notifications",
        senderEmail: "no-reply@stanford.edu",
        subject: "PS 114D: Grades posted",
        snippet: "Grades for the midterm have been posted to the course portal...",
        body: "Grades for the midterm have been posted to the course portal.",
        timestamp: hoursAgo(40),
        unread: false,
        urgent: false
      },
      {
        id: "e6",
        sender: "Kappa Alpha Pi Exec",
        senderEmail: "exec@kappaalphapi.org",
        subject: "RSVP needed: LSAT panel next Thursday",
        snippet: "We're finalizing headcount for the LSAT panel. Please RSVP by tomorrow so we can order food...",
        body: "We're finalizing headcount for the LSAT panel. Please RSVP by tomorrow so we can order food. Reply yes/no to this email.",
        timestamp: hoursAgo(10),
        unread: true,
        urgent: false
      },
      {
        id: "e7",
        sender: "Amy (UX review team)",
        senderEmail: "amy@ddl-project.stanford.edu",
        subject: "re: inbox agent — can we get a preview link?",
        snippet: "Whenever you have a local build running, send a screen recording or preview so we can start the UX pass...",
        body: "Whenever you have a local build running, send a screen recording or preview so we can start the UX pass ahead of the July 13 review. No pressure if it's still rough.",
        timestamp: hoursAgo(15),
        unread: true,
        urgent: false
      }
    ];
  
    return { emails, currency: "USD" };
  }
  
  function unreadOf(inbox) {
    return inbox.emails.filter((e) => e.unread);
  }
  
  function urgentOf(inbox) {
    return inbox.emails.filter((e) => e.urgent);
  }
  
  function summarizeList(list) {
    return list
      .map((e) => `${e.sender} — "${e.subject}"`)
      .join("; ");
  }
  
  const TITLES = new Set(["prof.", "prof", "dr.", "dr", "mr.", "ms.", "mrs."]);
  
  function firstNameOf(sender) {
    const parts = sender.split(" ").filter(Boolean);
    const first = parts.find((p) => !TITLES.has(p.toLowerCase())) || parts[0];
    return first;
  }
  
  function draftReplyFor(email) {
    if (!email) return "No email selected to draft a reply for.";
    return `Hi ${firstNameOf(email.sender)}, thanks for the note — I'll take care of this and follow up shortly.`;
  }
  
  function answerQuestion(inbox, message) {
    const text = (message || "").toLowerCase();
    const unread = unreadOf(inbox);
    const urgent = urgentOf(inbox);
  
    if (text.includes("draft") || text.includes("reply")) {
      const target = urgent[0] || unread[0] || inbox.emails[0];
      return {
        text: `Drafted a reply to "${target.subject}" from ${target.sender}.`,
        tools: ["scan_inbox", "draft_reply"],
        summary: `Draft reply prepared for ${target.sender}.`,
        draftReply: draftReplyFor(target),
        focusEmailId: target.id
      };
    }
  
    if (text.includes("urgent") || text.includes("priorit")) {
      return {
        text: urgent.length
          ? `${urgent.length} urgent item${urgent.length > 1 ? "s" : ""}: ${summarizeList(urgent)}.`
          : "Nothing flagged urgent right now.",
        tools: ["scan_inbox", "prioritize"],
        summary: `${urgent.length} urgent email(s) found.`
      };
    }
  
    if (text.includes("todo") || text.includes("to-do") || text.includes("to do") || text.includes("list")) {
      const items = unread.map((e) => `Reply to ${e.sender} re: "${e.subject}"`);
      return {
        text: items.length ? items.join("\n") : "Inbox is clear — no unread items to act on.",
        tools: ["scan_inbox", "build_todo"],
        summary: `To-do list built from ${items.length} unread email(s).`
      };
    }
  
    if (text.includes("summar") || text.includes("unread") || text === "") {
      return {
        text: unread.length
          ? `You have ${unread.length} unread email${unread.length > 1 ? "s" : ""}. ${summarizeList(unread)}.`
          : "No unread emails.",
        tools: ["scan_inbox", "summarize_unread"],
        summary: `${unread.length} unread, ${urgent.length} urgent.`
      };
    }
  
    return {
      text: `You have ${unread.length} unread and ${urgent.length} urgent email(s). Ask me to summarize, prioritize, build a to-do list, or draft a reply.`,
      tools: ["scan_inbox"],
      summary: "General inbox status."
    };
  }
  
  globalThis.InboxAgentCore = { fakeInbox, unreadOf, urgentOf, answerQuestion, draftReplyFor };
  
  export { fakeInbox, unreadOf, urgentOf, answerQuestion, draftReplyFor };
import test from "node:test";
import assert from "node:assert/strict";
import { fakeInbox, answerQuestion } from "../agent.js";

test("fakeInbox returns emails array", () => {
  const inbox = fakeInbox();
  assert.ok(Array.isArray(inbox.emails));
  assert.ok(inbox.emails.length > 0);
});

test("summarize returns unread count in summary", () => {
  const inbox = fakeInbox();
  const unreadCount = inbox.emails.filter((e) => e.unread).length;
  const result = answerQuestion(inbox, "summarize my unread emails");
  assert.match(result.summary, new RegExp(`${unreadCount} unread`));
});

test("draft reply returns a draftReply string", () => {
  const inbox = fakeInbox();
  const result = answerQuestion(inbox, "draft a reply to the most urgent email");
  assert.equal(typeof result.draftReply, "string");
  assert.ok(result.draftReply.length > 0);
});

test("todo list only includes unread emails", () => {
  const inbox = fakeInbox();
  const unreadCount = inbox.emails.filter((e) => e.unread).length;
  const result = answerQuestion(inbox, "build a to-do list");
  const lineCount = result.text.split("\n").filter(Boolean).length;
  assert.equal(lineCount, unreadCount);
});
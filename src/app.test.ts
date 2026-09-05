import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTargetGroupIds,
  parseTargetPhoneNumbers,
} from "./config.js";
import { buildSystemInstruction, withTransientRetry } from "./gemini.js";
import { createConversationMemory } from "./memory.js";
import {
  isDirectChatId,
  isGroupChatId,
  phoneNumberFromContactId,
  shouldRouteGroupMessage,
  shouldRouteMessage,
} from "./router.js";

test("routing is fail-closed and memory remains bounded", async () => {
  const targets = parseTargetPhoneNumbers('["+628123456789"]');
  const base = {
    fromMe: false,
    isStatus: false,
    isBroadcast: false,
    isDirectChat: true,
    type: "chat",
    phoneNumber: "628123456789",
  } as const;

  assert.equal(shouldRouteMessage(base, targets), true);
  assert.equal(
    shouldRouteMessage({ ...base, isDirectChat: false }, targets),
    false,
  );
  assert.equal(
    shouldRouteMessage({ ...base, phoneNumber: "628000000000" }, targets),
    false,
  );
  assert.equal(isDirectChatId("628123456789@c.us", undefined), true);
  assert.equal(isDirectChatId("123456789@lid", undefined), true);
  assert.equal(isDirectChatId("123456789@g.us", "628123456789@c.us"), false);
  assert.equal(isDirectChatId(undefined, undefined), false);
  assert.equal(
    phoneNumberFromContactId("628123456789", "c.us"),
    "628123456789",
  );
  assert.equal(phoneNumberFromContactId("123456789", "lid"), null);

  const groups = parseTargetGroupIds('["120363022657003836@g.us"]');
  assert.equal(isGroupChatId("120363022657003836@g.us"), true);
  assert.equal(isGroupChatId("628123456789@c.us"), false);
  assert.equal(
    shouldRouteGroupMessage("120363022657003836@g.us", true, groups),
    true,
  );
  assert.equal(
    shouldRouteGroupMessage("120363022657003836@g.us", false, groups),
    false,
  );
  assert.equal(
    shouldRouteGroupMessage("120363999999999999@g.us", true, groups),
    false,
  );
  assert.throws(() => parseTargetGroupIds('["not-a-group"]'), /Invalid group ID/);

  const memory = createConversationMemory(2);
  memory.add("target", { role: "user", text: "one" });
  memory.add("target", { role: "model", text: "two" });
  memory.add("target", { role: "user", text: "three" });
  assert.deepEqual(
    memory.get("target").map(({ text }) => text),
    ["two", "three"],
  );

  let attempts = 0;
  const result = await withTransientRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw { status: 429 };
      return "ok";
    },
    [0, 0],
    async () => undefined,
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("custom writing style extends the trusted system instruction", () => {
  const prompt = buildSystemInstruction("  use casual lowercase replies  ");

  assert.match(prompt, /Never pretend to have performed actions/);
  assert.match(prompt, /Trusted writing style:\nuse casual lowercase replies$/);
});

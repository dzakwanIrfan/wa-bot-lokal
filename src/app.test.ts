import assert from "node:assert/strict";
import test from "node:test";

import {
  loadConfig,
  parseTargetGroupIds,
  parseTargetPhoneNumbers,
} from "./config.js";
import { buildSystemInstruction, withTransientRetry } from "./gemini.js";
import { imageMediaFromCommand } from "./media.js";
import { createConversationMemory } from "./memory.js";
import { createRemoveBackgroundCommand } from "./remove-bg-handler.js";
import {
  commandNameFromText,
  createMessageRouter,
  isDirectChatId,
  isGroupChatId,
  phoneNumberFromContactId,
  shouldRouteGroupMessage,
  shouldRouteMessage,
} from "./router.js";
import {
  createImageStickerCommand,
  parseTextStickerCommand,
} from "./sticker.js";
import {
  BackgroundRemovalError,
  removeBackground,
} from "./bg-removal.js";

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

  const config = loadConfig({
    GEMINI_API_KEY: "test-key",
    PHOTOROOM_API_KEY: "photoroom-test-key",
    TARGET_PHONE_NUMBERS: '["628123456789"]',
    REPLY_STYLE_PROMPT: "this env value must be ignored",
  });
  assert.match(config.replyStylePrompt, /bahasa Indonesia casual/);
  assert.doesNotMatch(config.replyStylePrompt, /this env value must be ignored/);
});

test("text sticker command is quoted, bounded, and routes without a mention", async () => {
  assert.equal(
    parseTextStickerCommand('/sticker-text "sori\nkeburu\nngambek"'),
    "sori\nkeburu\nngambek",
  );
  assert.equal(parseTextStickerCommand('/sticker-text “babi kau”'), "babi kau");
  assert.equal(parseTextStickerCommand('/sticker "reserved"'), null);
  assert.equal(parseTextStickerCommand("/sticker-text no quotes"), null);
  assert.equal(
    parseTextStickerCommand(`/sticker-text "${"x".repeat(161)}"`),
    null,
  );
  assert.equal(commandNameFromText('/STICKER-TEXT "test"'), "/sticker-text");

  let textCalls = 0;
  let imageCalls = 0;
  let removeBackgroundCalls = 0;
  const groupId = "120363022657003836@g.us";
  const routeMessage = createMessageRouter({
    targetPhoneNumbers: new Set(),
    targetGroupIds: new Set([groupId]),
    memory: createConversationMemory(2),
    gemini: {
      generateReply: async () => {
        throw new Error("Gemini must not run for a sticker command.");
      },
    },
    groupCommands: new Map([
      [
        "/sticker-text",
        async () => {
          textCalls += 1;
        },
      ],
      [
        "/sticker",
        async () => {
          imageCalls += 1;
        },
      ],
      [
        "/remove-bg",
        async () => {
          removeBackgroundCalls += 1;
        },
      ],
    ]),
  });

  const message = {
    fromMe: true,
    isStatus: false,
    broadcast: false,
    type: "chat",
    from: groupId,
    id: { remote: groupId },
    body: '/sticker-text "test"',
    mentionedIds: [],
    getMentions: async () => {
      throw new Error("Mention lookup must not run for a sticker command.");
    },
  };

  await routeMessage(message as never);
  assert.equal(textCalls, 1);

  await routeMessage({
    ...message,
    type: "image",
    body: "/sticker",
    hasMedia: true,
  } as never);
  assert.equal(imageCalls, 1);

  await routeMessage({
    ...message,
    type: "image",
    body: "/remove-bg",
    hasMedia: true,
  } as never);
  assert.equal(removeBackgroundCalls, 1);

  await routeMessage({
    ...message,
    from: "120363999999999999@g.us",
    id: { remote: "120363999999999999@g.us" },
  } as never);
  assert.equal(textCalls, 1);
  assert.equal(imageCalls, 1);
  assert.equal(removeBackgroundCalls, 1);
});

test("image commands accept an attached image or a quoted image", async () => {
  type RuntimeMessageId = {
    fromMe: boolean;
    remote: string;
    id: string;
    _serialized?: string;
    $1?: string;
  };

  const jpeg = { mimetype: "image/jpeg", data: "base64-image" };
  const groupId = "120363022657003836@g.us";
  const renderClient = {
    pupPage: {
      evaluate: async () => "rendered-webp",
    },
  };
  const attachedId: RuntimeMessageId = {
    fromMe: true,
    remote: groupId,
    id: "attached-image",
    $1: `true_${groupId}_attached-image`,
  };
  const attached = {
    id: attachedId,
    hasMedia: true,
    hasQuotedMsg: false,
    downloadMedia: async () => {
      assert.equal(attachedId._serialized, attachedId.$1);
      return jpeg;
    },
  };
  assert.equal(await imageMediaFromCommand(attached as never), jpeg);

  const commandId: RuntimeMessageId = {
    fromMe: true,
    remote: groupId,
    id: "reply-command",
    $1: `true_${groupId}_reply-command`,
  };
  const quotedImageId: RuntimeMessageId = {
    fromMe: false,
    remote: groupId,
    id: "quoted-image",
  };
  const quotedImage = {
    id: quotedImageId,
    hasMedia: true,
    downloadMedia: async () => {
      assert.equal(
        quotedImageId._serialized,
        `false_${groupId}_quoted-image`,
      );
      return jpeg;
    },
  };
  const quoted = {
    id: commandId,
    hasMedia: false,
    hasQuotedMsg: true,
    getQuotedMessage: async () => {
      assert.equal(commandId._serialized, commandId.$1);
      return quotedImage;
    },
  };
  assert.equal(await imageMediaFromCommand(quoted as never), jpeg);

  assert.equal(
    await imageMediaFromCommand({
      ...attached,
      downloadMedia: async () => ({ mimetype: "audio/ogg", data: "audio" }),
    } as never),
    null,
  );

  let sentAsSticker = false;
  let sentMimetype = "";
  await createImageStickerCommand(renderClient as never)({
    ...attached,
    reply: async (content: unknown, _chatId: unknown, options: unknown) => {
      sentMimetype =
        typeof content === "object" && content !== null
          ? String(Reflect.get(content, "mimetype"))
          : "";
      sentAsSticker =
        typeof options === "object" &&
        options !== null &&
        Reflect.get(options, "sendMediaAsSticker") === true;
      return {};
    },
  } as never);
  assert.equal(sentAsSticker, true);
  assert.equal(sentMimetype, "image/webp");
});

test("PhotoRoom returns a PNG once and does not retry HTTP 429", async () => {
  const input = {
    mimetype: "image/jpeg",
    data: Buffer.from("jpeg-source").toString("base64"),
  };
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  let successCalls = 0;

  const result = await removeBackground(input, "secret-key", async (url, init) => {
    successCalls += 1;
    assert.equal(String(url), "https://sdk.photoroom.com/v1/segment");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "secret-key");
    assert.ok(init?.body instanceof FormData);
    return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
  });

  assert.deepEqual(result, png);
  assert.equal(successCalls, 1);

  let rateLimitCalls = 0;
  await assert.rejects(
    () =>
      removeBackground(input, "secret-key", async () => {
        rateLimitCalls += 1;
        return new Response("busy", { status: 429 });
      }),
    (error) =>
      error instanceof BackgroundRemovalError && error.code === "rate-limit",
  );
  assert.equal(rateLimitCalls, 1);
});

test("remove background accepts attached media and sends a PNG document", async () => {
  const groupId = "120363022657003836@g.us";
  const source = { mimetype: "image/jpeg", data: "base64-image" };
  const replies: Array<{ content: unknown; options: unknown }> = [];
  const message = {
    id: {
      fromMe: true,
      remote: groupId,
      id: "remove-background",
      $1: `true_${groupId}_remove-background`,
    },
    body: "/remove-bg",
    hasMedia: true,
    hasQuotedMsg: false,
    downloadMedia: async () => source,
    reply: async (content: unknown, _chatId: unknown, options: unknown) => {
      replies.push({ content, options });
      return {};
    },
  };
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

  await createRemoveBackgroundCommand("secret-key", async (media, apiKey) => {
    assert.equal(media, source);
    assert.equal(apiKey, "secret-key");
    return png;
  })(message as never);

  assert.equal(replies.length, 1);
  const reply = replies[0];
  assert.equal(Reflect.get(reply?.content as object, "mimetype"), "image/png");
  assert.equal(
    Reflect.get(reply?.content as object, "filename"),
    "background-removed.png",
  );
  assert.equal(
    Reflect.get(reply?.options as object, "sendMediaAsDocument"),
    true,
  );

  const usageReplies: unknown[] = [];
  await createRemoveBackgroundCommand("secret-key")({
    ...message,
    id: {
      fromMe: true,
      remote: groupId,
      id: "missing-image",
      $1: `true_${groupId}_missing-image`,
    },
    hasMedia: false,
    reply: async (content: unknown) => {
      usageReplies.push(content);
      return {};
    },
  } as never);
  assert.match(String(usageReplies[0]), /Kirim gambar/);
});

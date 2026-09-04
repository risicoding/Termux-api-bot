import "dotenv/config";

import { Bot } from "grammy";
import {
  Battery,
  Notification,
  Clipboard,
  Sms,
  CallLog,
} from "@termux-bridge/core";
import { startProcessManager } from "./process";
import { getBotToken, getChatId } from "./conf";
import { BashSession } from "./lib/bash";

const BOT_TOKEN = getBotToken();
const CHAT_ID = getChatId();

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is not set");
}

if (!CHAT_ID) {
  throw new Error("CHAT_ID is not set");
}

const allowedChatId = Number(CHAT_ID);

if (!Number.isInteger(allowedChatId)) {
  throw new Error("CHAT_ID must be a valid Telegram chat ID");
}

const bot = new Bot(BOT_TOKEN);

const executor = new BashSession();

const dateTime = (date: Date = new Date()) =>
  date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Kolkata",
  });

const escapeHtml = (value: unknown): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const isAllowedChat = (ctx: any): boolean => ctx.chat?.id === allowedChatId;

/*
 * Security boundary:
 *
 * Every update must come from the configured CHAT_ID.
 */
bot.use(async (ctx, next) => {
  if (!isAllowedChat(ctx)) {
    return;
  }

  await next();
});

/*
 * /start
 */
bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "🤖 <b>Termux Bridge Bot</b>",
      "",
      "Available commands:",
      "",
      "🔋 /battery",
      "🔔 /notifications",
      "📢 /notify",
      "📋 /clipboard",
      "✏️ /clipboard_set &lt;text&gt;",
      "💬 /sms",
      "📞 /calllog",
    ].join("\n"),
    {
      parse_mode: "HTML",
    },
  );
});

/*
 * /battery
 */
bot.command("battery", async (ctx) => {
  const result = await Battery.status();

  result.match(
    async (battery) => {
      await ctx.reply(
        [
          "🔋 <b>Battery</b>",
          "",
          `<b>Percentage:</b> ${battery.percentage}%`,
          `<b>Status:</b> ${escapeHtml(battery.status)}`,
          `<b>Plugged:</b> ${escapeHtml(battery.plugged)}`,
          `<b>Health:</b> ${escapeHtml(battery.health)}`,
          `<b>Temperature:</b> ${battery.temperature}°C`,
          `<b>Current:</b> ${battery.current}`,
          `<b>Voltage:</b> ${battery.voltage} mV`,
          `<b>Technology:</b> ${escapeHtml(battery.technology)}`,
          battery.cycle_count !== undefined
            ? `<b>Cycle count:</b> ${battery.cycle_count}`
            : "",

          `<b>Power:</b> ${((battery.current * battery.voltage) / 1000000000).toFixed(2)}W`,
        ]
          .filter(Boolean)
          .join("\n"),
        {
          parse_mode: "HTML",
        },
      );
    },

    async (error) => {
      await ctx.reply(
        `❌ <b>Battery error</b>\n\n<code>${escapeHtml(
          JSON.stringify(error, null, 2),
        )}</code>`,
        {
          parse_mode: "HTML",
        },
      );
    },
  );
});

/*
 * /notifications
 */
bot.command("notifications", async (ctx) => {
  const result = await Notification.list();

  result.match(
    async (notifications) => {
      if (notifications.length === 0) {
        await ctx.reply("🔔 No active notifications.");
        return;
      }

      const output = notifications
        .map((notification, index) =>
          [
            `<b>${index + 1}. ${escapeHtml(notification.title)}</b>`,
            escapeHtml(notification.content),
            `📦 ${escapeHtml(notification.packageName)}`,
            `🕐 ${dateTime(notification.when)}`,
            `🔑 <code>${escapeHtml(notification.key)}</code>`,
          ].join("\n"),
        )
        .join("\n\n");

      await ctx.reply(`🔔 <b>Notifications</b>\n\n${output}`, {
        parse_mode: "HTML",
      });
    },

    async (error) => {
      await ctx.reply(
        `❌ <b>Notification error</b>\n\n<code>${escapeHtml(
          JSON.stringify(error, null, 2),
        )}</code>`,
        {
          parse_mode: "HTML",
        },
      );
    },
  );
});

/*
 * /notify <title> | <content>
 *
 * Example:
 * /notify Build complete | Your project finished building.
 */
bot.command("notify", async (ctx) => {
  const input = ctx.match.trim();

  if (!input) {
    await ctx.reply(
      [
        "Usage:",
        "",
        "<code>/notify Title | Content</code>",
        "",
        "Example:",
        "<code>/notify Build complete | Your project finished building.</code>",
      ].join("\n"),
      {
        parse_mode: "HTML",
      },
    );

    return;
  }

  const separator = input.indexOf("|");

  if (separator === -1) {
    await ctx.reply("❌ Use <code>/notify Title | Content</code>", {
      parse_mode: "HTML",
    });

    return;
  }

  const title = input.slice(0, separator).trim();
  const content = input.slice(separator + 1).trim();

  if (!title || !content) {
    await ctx.reply("❌ Both title and content are required.");

    return;
  }

  const result = await Notification.notification({
    title,
    content,
  });

  result.match(
    async () => {
      await ctx.reply("✅ Notification created.");
    },

    async (error) => {
      await ctx.reply(
        `❌ <b>Notification error</b>\n\n<code>${escapeHtml(
          JSON.stringify(error, null, 2),
        )}</code>`,
        {
          parse_mode: "HTML",
        },
      );
    },
  );
});

/*
 * /clipboard
 */
bot.command("clipboard", async (ctx) => {
  const result = await Clipboard.getClipboard();
  console.log(result);

  result.match(
    async (text) => {
      await ctx.reply(
        text
          ? `📋 <b>Clipboard</b>\n\n<code>${escapeHtml(text)}</code>`
          : "📋 Clipboard is empty.",
        {
          parse_mode: "HTML",
        },
      );
    },

    async (error) => {
      await ctx.reply(
        `❌ <b>Clipboard error</b>\n\n<code>${escapeHtml(
          JSON.stringify(error, null, 2),
        )}</code>`,
        {
          parse_mode: "HTML",
        },
      );
    },
  );
});

/*
 * /clipboard_set <text>
 */
bot.command("clipboard_set", async (ctx) => {
  const text = ctx.match;

  if (!text) {
    await ctx.reply("Usage:\n<code>/clipboard_set Hello world</code>", {
      parse_mode: "HTML",
    });

    return;
  }

  const result = await Clipboard.setClipboard(text);

  result.match(
    async () => {
      await ctx.reply("✅ Clipboard updated.");
    },

    async (error) => {
      await ctx.reply(
        `❌ <b>Clipboard error</b>\n\n<code>${escapeHtml(
          JSON.stringify(error, null, 2),
        )}</code>`,
        {
          parse_mode: "HTML",
        },
      );
    },
  );
});

/*
 * /sms
 */
bot.command("sms", async (ctx) => {
  const result = await Sms.list();

  result.match(
    async (messages) => {
      if (messages.length === 0) {
        await ctx.reply("💬 No SMS messages found.");
        return;
      }

      const output = messages
        .map((sms, index) =>
          [
            `<b>${index + 1}. ${escapeHtml(sms.address)}</b>`,
            escapeHtml(sms.body),
            `📅 ${dateTime(sms.received)}`,
            `📖 ${sms.read ? "Read" : "Unread"}`,
            `#️⃣ ${escapeHtml(sms.type)}`,
          ].join("\n"),
        )
        .join("\n\n");

      await ctx.reply(`💬 <b>SMS Messages</b>\n\n${output}`, {
        parse_mode: "HTML",
      });
    },

    async (error) => {
      await ctx.reply(
        `❌ <b>SMS error</b>\n\n<code>${escapeHtml(
          JSON.stringify(error, null, 2),
        )}</code>`,
        {
          parse_mode: "HTML",
        },
      );
    },
  );
});

/*
 * /calllog
 */
bot.command("calllog", async (ctx) => {
  const result = await CallLog.log();

  result.match(
    async (calls) => {
      if (calls.length === 0) {
        await ctx.reply("📞 No call history found.");
        return;
      }

      const output = calls
        .map((call, index) =>
          [
            `<b>${index + 1}. ${escapeHtml(call.name || "Unknown")}</b>`,
            `📱 ${escapeHtml(call.phone_number)}`,
            `📞 ${escapeHtml(call.type)}`,
            `🕐 ${dateTime(call.date)}`,
            `⏱ ${escapeHtml(call.duration)}`,
            `SIM: ${escapeHtml(call.sim_id)}`,
          ].join("\n"),
        )
        .join("\n\n");

      await ctx.reply(`📞 <b>Call Log</b>\n\n${output}`, {
        parse_mode: "HTML",
      });
    },

    async (error) => {
      await ctx.reply(
        `❌ <b>Call log error</b>\n\n<code>${escapeHtml(
          JSON.stringify(error, null, 2),
        )}</code>`,
        {
          parse_mode: "HTML",
        },
      );
    },
  );
});

bot.command("bash", async (ctx) => {
  const msg = ctx.message?.text;
  if (!msg) return ctx.reply("cant find msg");

  const cmdWithArgs = msg.slice(6).trim();

  if (!cmdWithArgs) return ctx.reply("command not found");

  const result = await executor.run(cmdWithArgs);

  if (result.isErr())
    return ctx.reply(
      `${result.error.log()}\n${JSON.stringify(result.error, null, 2)}`,
    );

  if (result.value.stderr.length !== 0) return ctx.reply(result.value.stderr);
  return ctx.reply("Success:\n" + result.value.stdout);
});

/*
 * Unknown commands
 */
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) {
    await ctx.reply(
      "❓ Unknown command. Use /start to see available commands.",
    );
  }
});

/*
 * Error handler
 */
bot.catch((error) => {
  console.error("Telegram bot error:", error.error);
});

/*
 * Start notification
 *
 * IMPORTANT:
 * This happens when the Node process starts,
 * not when /start is sent.
 */
const startedAt = new Date();

// await bot.api.sendMessage(
//   allowedChatId,
//   [
//     "🟢 <b>Termux Bridge Bot is running</b>",
//     "",
//     `🕐 <b>Started:</b> ${dateTime(startedAt)}`,
//     `💻 <b>Process:</b> Node.js`,
//   ].join("\n"),
//   {
//     parse_mode: "HTML",
//   },
// );

console.log(`Bot started at ${startedAt.toISOString()}`);
console.log(`Allowed chat ID: ${allowedChatId}`);

startProcessManager();
await bot.start();

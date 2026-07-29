import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { ensureOwner, saveSettings } from "../domain/store.js";
import { now } from "../domain/clock.js";

registerMainMenuItem({ label: "Configure channel", data: "config:channel", order: 10 });
const composer = new Composer<Ctx>();

type ChannelFlow = Ctx & { session: { step?: "channel"; expiresAt?: number } };

function owner(ctx: Ctx): Promise<boolean> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (chatId === undefined || userId === undefined) return Promise.resolve(false);
  return ensureOwner(chatId, userId).then((settings) => settings.ownerId === userId);
}

composer.callbackQuery("config:channel", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await owner(ctx))) {
    await ctx.reply("Only the account owner can change the channel.");
    return;
  }
  (ctx as ChannelFlow).session.step = "channel";
  (ctx as ChannelFlow).session.expiresAt = now() + 5 * 60 * 1000;
  await ctx.reply("Send the channel ID or @username to monitor.", {
    reply_markup: { force_reply: true, input_field_placeholder: "-100… or @channel" },
  });
});

composer.on("message:text", async (ctx, next) => {
  const flow = ctx as ChannelFlow;
  if (ctx.message.text.startsWith("/")) return next();
  if (flow.session.step !== "channel") return next();
  if ((flow.session.expiresAt ?? 0) < now()) {
    flow.session.step = undefined;
    flow.session.expiresAt = undefined;
    await ctx.reply("That setup timed out. Tap Configure channel to try again.");
    return;
  }
  if (!(await owner(ctx))) return;
  const value = ctx.message.text.trim();
  if (!/^(?:-100\d+|@[A-Za-z0-9_]{5,})$/.test(value)) {
    await ctx.reply("That channel format doesn’t look right. Send a numeric channel ID or @username.");
    return;
  }
  const settings = await ensureOwner(ctx.chat.id, ctx.from.id);
  settings.channelId = value.toLowerCase();
  await saveSettings(settings);
  flow.session.step = undefined;
  flow.session.expiresAt = undefined;
  await ctx.reply("Channel updated. I’ll send valid signals here.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

export default composer;

import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { ensureOwner, saveSettings } from "../domain/store.js";
import { now } from "../domain/clock.js";

registerMainMenuItem({ label: "Adjust trade percentage", data: "config:percent", order: 20 });
registerMainMenuItem({ label: "Confirmation prompts", data: "config:confirmation", order: 30 });
const composer = new Composer<Ctx>();
type PercentFlow = Ctx & { session: { step?: "percent"; expiresAt?: number } };

async function isOwner(ctx: Ctx): Promise<boolean> {
  if (ctx.chat === undefined || ctx.from === undefined) return false;
  return (await ensureOwner(ctx.chat.id, ctx.from.id)).ownerId === ctx.from.id;
}

composer.callbackQuery("config:percent", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isOwner(ctx))) return void (await ctx.reply("Only the account owner can change the trade percentage."));
  (ctx as PercentFlow).session.step = "percent";
  (ctx as PercentFlow).session.expiresAt = now() + 5 * 60 * 1000;
  await ctx.reply("Send the percentage of your available balance for each trade.", {
    reply_markup: { force_reply: true, input_field_placeholder: "For example: 5" },
  });
});

composer.callbackQuery("config:confirmation", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isOwner(ctx))) return void (await ctx.reply("Only the account owner can change confirmation prompts."));
  const chat = ctx.chat;
  const from = ctx.from;
  if (!chat || !from) return;
  const settings = await ensureOwner(chat.id, from.id);
  settings.confirmationRequired = !settings.confirmationRequired;
  await saveSettings(settings);
  await ctx.reply(`Trade confirmations are now ${settings.confirmationRequired ? "on" : "off"}.`);
});

composer.on("message:text", async (ctx, next) => {
  const flow = ctx as PercentFlow;
  if (ctx.message.text.startsWith("/")) return next();
  if (flow.session.step !== "percent") return next();
  if ((flow.session.expiresAt ?? 0) < now()) {
    flow.session.step = undefined;
    flow.session.expiresAt = undefined;
    await ctx.reply("That setup timed out. Tap Adjust trade percentage to try again.");
    return;
  }
  if (!(await isOwner(ctx))) return;
  const value = Number(ctx.message.text.trim().replace(/%$/, ""));
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    await ctx.reply("Send a percentage from 0.01 to 100.");
    return;
  }
  const settings = await ensureOwner(ctx.chat.id, ctx.from.id);
  settings.tradePercent = Math.round(value * 100) / 100;
  await saveSettings(settings);
  flow.session.step = undefined;
  flow.session.expiresAt = undefined;
  await ctx.reply(`Each trade will use ${settings.tradePercent}% of your available balance.`, {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

export default composer;

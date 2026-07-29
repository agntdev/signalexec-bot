import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { confirmKeyboard, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { executeIqOptionTrade } from "../domain/iq-option.js";
import { now } from "../domain/clock.js";
import {
  createTrade,
  saveSignal,
  saveTrade,
  settingsForChannel,
  signalById,
  type Signal,
} from "../domain/store.js";

const composer = new Composer<Ctx>();

function parseSignal(text: string, id: string, sourceLink: string): Signal | undefined {
  const asset = /(?:asset|pair|symbol)\s*[:=-]?\s*([A-Za-z]{3,10}(?:\/[A-Za-z]{3,10})?)/i.exec(text)
    ?? /\b([A-Z]{3,10}\/[A-Z]{3,10})\b/.exec(text);
  const direction = /\b(call|buy|up|put|sell|down)\b/i.exec(text);
  if (!asset || !direction) return undefined;
  const directionValue = /^(call|buy|up)$/i.test(direction[1]) ? "call" : "put";
  const percent = /(?:risk|size|amount|percent)\s*[:=-]?\s*(\d{1,3}(?:\.\d+)?)\s*%/i.exec(text);
  const timeframe = /(?:timeframe|expiry|duration)\s*[:=-]?\s*(\d+\s*(?:m|min|minutes?|h|hours?))/i.exec(text)
    ?? /\b(\d+\s*(?:m|min|minutes?|h|hours?))\b/i.exec(text);
  const confidence = /(?:confidence|conf)\s*[:=-]?\s*(\d{1,3}(?:\.\d+)?\s*%?)/i.exec(text);
  return {
    id,
    asset: asset[1].toUpperCase(),
    direction: directionValue,
    percent: percent ? Number(percent[1]) : undefined,
    timeframe: timeframe?.[1],
    confidence: confidence?.[1],
    sourceLink,
    timestamp: now(),
  };
}

function card(signal: Signal, tradePercent: number): string {
  const detail = [
    `Asset: ${signal.asset}`,
    `Direction: ${signal.direction.toUpperCase()}`,
    `Trade size: ${tradePercent}% of balance`,
    signal.timeframe ? `Timeframe: ${signal.timeframe}` : undefined,
    signal.confidence ? `Confidence: ${signal.confidence}` : undefined,
  ].filter(Boolean);
  return `New trade signal\n${detail.join("\n")}`;
}

async function execute(ctx: Ctx, signalId: string): Promise<void> {
  if (ctx.chat === undefined || ctx.from === undefined) return;
  const signal = await signalById(signalId);
  const settings = await settingsForChannel(signal?.sourceLink.split(":")[0] ?? "");
  if (!signal || !settings || settings.chatId !== ctx.chat.id || settings.ownerId !== ctx.from.id) {
    await ctx.reply("That trade card is no longer available.");
    return;
  }
  const trade = await createTrade(settings.chatId, signal);
  try {
    const result = await executeIqOptionTrade(signal, settings.tradePercent);
    trade.amount = Math.round((result.balance * settings.tradePercent) / 100 * 100) / 100;
    trade.status = "executed";
    trade.iqOrderId = result.orderId;
    await saveTrade(trade);
    await ctx.editMessageText(`Trade submitted for ${trade.amount}.`, {
      reply_markup: inlineKeyboard([[inlineButton("View trade history", "history:trades")]]),
    });
  } catch (error) {
    trade.status = "failed";
    await saveTrade(trade);
    const message = error instanceof Error && error.message === "not-configured"
      ? "IQ Option isn’t set up yet. Add the authorised connection, then try again."
      : "Couldn’t reach IQ Option. No trade was placed — try again shortly.";
    await ctx.editMessageText(message, {
      reply_markup: inlineKeyboard([[inlineButton("View trade history", "history:trades")]]),
    });
  }
}

composer.on("channel_post:text", async (ctx, next) => {
  const post = ctx.channelPost;
  const configured = await settingsForChannel(String(post.chat.id))
    ?? (post.chat.username ? await settingsForChannel(`@${post.chat.username}`) : undefined);
  if (!configured) return next();
  const signal = parseSignal(post.text, `${post.chat.id}:${post.message_id}`, `${post.chat.id}:${post.message_id}`);
  if (!signal) return;
  await saveSignal(signal);
  try {
    await ctx.api.sendMessage(configured.chatId, card(signal, configured.tradePercent), {
      reply_markup: inlineKeyboard([[inlineButton("Execute trade", `trade:${signal.id}`)]]),
    });
  } catch {
    // The owner may have blocked the bot; channel monitoring must continue.
  }
});

composer.callbackQuery(/^trade:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const signal = await signalById(ctx.match[1]);
  if (!signal || ctx.chat === undefined || ctx.from === undefined) return void (await ctx.reply("That trade card is no longer available."));
  const channelId = signal.sourceLink.split(":")[0];
  const settings = await settingsForChannel(channelId);
  if (!settings || settings.chatId !== ctx.chat.id || settings.ownerId !== ctx.from.id) {
    await ctx.reply("Only the account owner can execute this trade.");
    return;
  }
  if (!settings.confirmationRequired) return execute(ctx, signal.id);
  await ctx.editMessageText(`${card(signal, settings.tradePercent)}\n\nConfirm this trade?`, {
    reply_markup: confirmKeyboard(`confirm:${signal.id}`, { yes: "Execute trade", no: "Cancel" }),
  });
});

composer.callbackQuery(/^confirm:(.+):(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [, signalId, answer] = ctx.match;
  const signal = await signalById(signalId);
  const settings = await settingsForChannel(signal?.sourceLink.split(":")[0] ?? "");
  if (!settings || ctx.chat?.id !== settings.chatId || ctx.from?.id !== settings.ownerId) {
    await ctx.reply("Only the account owner can execute this trade.");
    return;
  }
  if (answer === "no") {
    await ctx.editMessageText("Trade cancelled. No order was placed.");
    return;
  }
  await execute(ctx, signalId);
});

export default composer;

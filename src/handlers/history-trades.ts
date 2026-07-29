import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { ensureOwner, tradesForOwner } from "../domain/store.js";

registerMainMenuItem({ label: "View trade history", data: "history:trades", order: 40 });
const composer = new Composer<Ctx>();

composer.callbackQuery("history:trades", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.chat === undefined || ctx.from === undefined) return;
  const settings = await ensureOwner(ctx.chat.id, ctx.from.id);
  if (settings.ownerId !== ctx.from.id) return void (await ctx.reply("Only the account owner can view trade history."));
  const trades = await tradesForOwner(ctx.chat.id);
  if (trades.length === 0) {
    await ctx.reply("No trades yet — valid channel signals will appear here.");
    return;
  }
  const lines = trades.slice(0, 10).map((trade) => {
    const amount = trade.amount === undefined ? "Amount pending" : `Amount ${trade.amount}`;
    return `${trade.asset} ${trade.direction.toUpperCase()} · ${trade.status} · ${amount}`;
  });
  await ctx.reply(`Your recent trades:\n${lines.join("\n")}`, {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

export default composer;

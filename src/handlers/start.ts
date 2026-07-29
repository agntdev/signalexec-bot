import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { ensureOwner, settingsForChat } from "../domain/store.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "Manage your signal channel and trades below.";

composer.command("start", async (ctx) => {
  (ctx.session as { step?: string; expiresAt?: number }).step = undefined;
  (ctx.session as { step?: string; expiresAt?: number }).expiresAt = undefined;
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (chatId !== undefined && userId !== undefined) await ensureOwner(chatId, userId);
  const settings = chatId === undefined ? undefined : await settingsForChat(chatId);
  const channel = settings?.channelId ? "Channel connected." : "No channel connected yet.";
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
  await ctx.reply(channel);
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;

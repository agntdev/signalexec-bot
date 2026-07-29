import { resolveSessionStorage } from "../toolkit/index.js";
import { now } from "./clock.js";

export interface Settings {
  ownerId: number;
  chatId: number;
  channelId?: string;
  tradePercent: number;
  confirmationRequired: boolean;
}

export interface Signal {
  id: string;
  asset: string;
  direction: "call" | "put";
  percent?: number;
  timeframe?: string;
  confidence?: string;
  sourceLink: string;
  timestamp: number;
}

export interface Trade {
  id: string;
  timestamp: number;
  asset: string;
  direction: "call" | "put";
  amount?: number;
  timeframe?: string;
  status: "pending" | "executed" | "failed" | "cancelled";
  iqOrderId?: string;
}

// The toolkit selects Redis in production. Its in-memory adapter is only the
// tokenless-harness fallback; no domain collection is kept in application memory.
const storage = resolveSessionStorage<Record<string, unknown>>(undefined);
const PREFIX = "iq-signal:";
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function key(part: string): string {
  return PREFIX + part;
}

async function read<T>(part: string): Promise<T | undefined> {
  return (await storage.read(key(part))) as T | undefined;
}

async function write<T>(part: string, value: T): Promise<void> {
  await storage.write(key(part), value as Record<string, unknown>);
}

export async function settingsForChat(chatId: number): Promise<Settings | undefined> {
  return read<Settings>(`settings:${chatId}`);
}

export async function settingsForChannel(channelId: string): Promise<Settings | undefined> {
  const chatId = await read<number>(`channel:${channelId.toLowerCase()}`);
  return chatId === undefined ? undefined : settingsForChat(chatId);
}

export async function ensureOwner(chatId: number, ownerId: number): Promise<Settings> {
  const existing = await settingsForChat(chatId);
  if (existing) return existing;
  const settings: Settings = { ownerId, chatId, tradePercent: 5, confirmationRequired: true };
  await write(`settings:${chatId}`, settings);
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const previous = await settingsForChat(settings.chatId);
  if (previous?.channelId && previous.channelId !== settings.channelId) {
    await storage.delete(key(`channel:${previous.channelId.toLowerCase()}`));
  }
  await write(`settings:${settings.chatId}`, settings);
  if (settings.channelId) await write(`channel:${settings.channelId.toLowerCase()}`, settings.chatId);
}

export async function saveSignal(signal: Signal): Promise<void> {
  await write(`signal:${signal.id}`, signal);
}

export async function signalById(id: string): Promise<Signal | undefined> {
  return read<Signal>(`signal:${id}`);
}

export async function createTrade(ownerChatId: number, signal: Signal): Promise<Trade> {
  const trade: Trade = {
    id: `${signal.id}:${now()}`,
    timestamp: now(),
    asset: signal.asset,
    direction: signal.direction,
    timeframe: signal.timeframe,
    status: "pending",
  };
  await write(`trade:${trade.id}`, trade);
  const index = (await read<string[]>(`trades:${ownerChatId}`)) ?? [];
  await write(`trades:${ownerChatId}`, [...index, trade.id]);
  return trade;
}

export async function saveTrade(trade: Trade): Promise<void> {
  await write(`trade:${trade.id}`, trade);
}

export async function tradesForOwner(ownerChatId: number): Promise<Trade[]> {
  const index = (await read<string[]>(`trades:${ownerChatId}`)) ?? [];
  const cutoff = now() - RETENTION_MS;
  const kept: string[] = [];
  const trades: Trade[] = [];
  for (const id of index) {
    const trade = await read<Trade>(`trade:${id}`);
    if (!trade) continue;
    if (trade.timestamp < cutoff) {
      await storage.delete(key(`trade:${id}`));
      continue;
    }
    kept.push(id);
    trades.push(trade);
  }
  if (kept.length !== index.length) await write(`trades:${ownerChatId}`, kept);
  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

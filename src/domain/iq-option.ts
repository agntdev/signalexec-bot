import type { Signal } from "./store.js";

export interface ExecutedOrder {
  balance: number;
  orderId: string;
}

function apiConfig(): { baseUrl: string; token: string } | undefined {
  const baseUrl = process.env.IQ_OPTION_API_URL;
  const token = process.env.IQ_OPTION_API_TOKEN;
  if (!baseUrl || !token) return undefined;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

function numberFrom(payload: unknown, keys: string[]): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * IQ Option has no public, stable retail REST contract. A deployment must supply
 * its authorised gateway URL and bearer token; without both this intentionally
 * refuses execution rather than inventing a balance or order result.
 */
export async function executeIqOptionTrade(signal: Signal, percent: number): Promise<ExecutedOrder> {
  const config = apiConfig();
  if (!config) throw new Error("not-configured");
  const headers = { authorization: `Bearer ${config.token}`, "content-type": "application/json" };
  const balanceResponse = await fetch(`${config.baseUrl}/balance`, { headers });
  if (!balanceResponse.ok) throw new Error("balance-unavailable");
  const balance = numberFrom(await balanceResponse.json(), ["balance", "available_balance"]);
  if (balance === undefined || balance <= 0) throw new Error("balance-unavailable");
  const amount = Math.round((balance * percent) / 100 * 100) / 100;
  if (amount <= 0) throw new Error("amount-invalid");
  const orderResponse = await fetch(`${config.baseUrl}/trades`, {
    method: "POST",
    headers,
    body: JSON.stringify({ asset: signal.asset, direction: signal.direction, amount, timeframe: signal.timeframe }),
  });
  if (!orderResponse.ok) throw new Error("order-unavailable");
  const order = (await orderResponse.json()) as Record<string, unknown>;
  const orderId = typeof order.order_id === "string" ? order.order_id : typeof order.id === "string" ? order.id : undefined;
  if (!orderId) throw new Error("order-unavailable");
  return { balance, orderId };
}

# IQ Signal Trader — Bot specification

**Archetype:** finance

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Monitors a specified Telegram channel for trading signals, parses key details (asset, direction, % of balance, timeframe, confidence), and delivers compact trade cards with one-tap execution to an IQ Option account (with confirmation). Stores trade history and allows percentage customization.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual traders
- Telegram signal followers
- IQ Option users

## Success criteria

- Owner receives a trade card in their private chat for every valid signal in the monitored channel
- One-tap trade execution with confirmation works for IQ Option
- Settings can be adjusted (percentage, channel) without re-deploying

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with settings and status
- **Configure Channel** (button, actor: user, callback: config:channel) — Set or change the monitored Telegram channel
- **Adjust Trade Percentage** (button, actor: user, callback: config:percent) — Change the fixed percentage of balance used for trades
- **View Trade History** (button, actor: user, callback: history:trades) — See executed and pending trades with status

## Flows

### Signal Monitoring
_Trigger:_ new message in monitored channel

1. Detect message containing trading signal
2. Parse asset, direction, %, timeframe, confidence
3. Generate trade card with execute button
4. Send to owner's private chat

_Data touched:_ Signal, User

### Trade Execution
_Trigger:_ user taps 'Execute Trade'

1. Show confirmation prompt
2. Calculate trade amount from IQ Option balance
3. Send trade request to IQ Option API
4. Report result and store order

_Data touched:_ Trade order, User

### Settings Adjustment
_Trigger:_ /start or button press

1. Display current settings
2. Prompt for channel ID or percentage
3. Store updated configuration

_Data touched:_ User

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Signal** _(retention: persistent)_ — Parsed trading signal from monitored channel
  - fields: asset, direction, percent, timeframe, confidence, source_link, timestamp
- **User** _(retention: persistent)_ — Owner's configuration and preferences
  - fields: channel_id, trade_percent, chat_id
- **Trade order** _(retention: persistent)_ — Record of executed or pending trades
  - fields: timestamp, asset, direction, amount, timeframe, status, iq_order_id

## Integrations

- **Telegram** (required) — Bot API messaging and channel monitoring
- **IQ Option API** (required) — Trade execution and balance checks
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Set monitored channel
- Adjust trade percentage
- View trade history
- Toggle confirmation prompts

## Notifications

- New signal detected in monitored channel
- Trade execution success/failure
- Settings updated confirmation

## Permissions & privacy

- Only owner can configure channel and trade percentage
- Trade history stored for 90 days
- IQ Option credentials never shared, only used for execution

## Edge cases

- Signal missing required fields (asset/direction)
- IQ Option API unavailable during trade
- Owner cancels trade confirmation

## Required tests

- End-to-end signal detection -> trade card -> confirmation -> execution flow
- Settings persistence across restarts
- Error handling for missing signal fields

## Assumptions

- Owner provides a single channel ID
- IQ Option API supports required trade parameters
- Signals follow predictable format for parsing

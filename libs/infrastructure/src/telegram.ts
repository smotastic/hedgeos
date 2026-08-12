import type { LogicalNotificationAction, StateTransition } from '@hedgeos/domain';
import { NotificationDeliveryError, type NotificationActionPort, type NotificationContext } from '@hedgeos/ports';

export interface TelegramTransport {
  post(url: string, body: unknown): Promise<{ status: number; text(): Promise<string> }>;
}

const defaultTransport: TelegramTransport = {
  post: async (url, body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response;
  },
};

/** Telegram is deliberately the only place where the bot token and destination are used. */
export class TelegramNotificationAdapter implements NotificationActionPort {
  private readonly url: string;

  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly transport: TelegramTransport = defaultTransport,
  ) {
    if (!token || !chatId) throw new Error('Telegram token and chat ID are required');
    this.url = `https://api.telegram.org/bot${token}/sendMessage`;
  }

  async send(_action: LogicalNotificationAction, transition: StateTransition, context?: NotificationContext): Promise<void> {
    const device = context?.deviceName ?? transition.deviceAddress;
    const text = `${device}: ${transition.previousState} → ${transition.currentState} (${transition.occurredAt.toISOString()})`;
    const response = await this.transport.post(this.url, { chat_id: this.chatId, text });
    if (response.status >= 200 && response.status < 300) return;
    const detail = (await response.text()).slice(0, 500);
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    throw new NotificationDeliveryError(`Telegram returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`, retryable, response.status);
  }
}

export function telegramFromEnvironment(transport?: TelegramTransport): TelegramNotificationAdapter | undefined {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? new TelegramNotificationAdapter(token, chatId, transport) : undefined;
}

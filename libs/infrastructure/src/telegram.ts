import type { LogicalNotificationAction, StateTransition } from '@hedgeos/domain';
import type { NotificationActionPort } from '@hedgeos/ports';

/** Telegram is deliberately kept at the infrastructure boundary. Only typed data crosses it. */
export class TelegramNotificationAdapter implements NotificationActionPort {
  constructor(private readonly options: {
    token: string;
    chatId: string;
    apiUrl?: string;
    fetchImpl?: typeof fetch;
  }) {}

  async send(_action: LogicalNotificationAction, transition: StateTransition): Promise<void> {
    const endpoint = `${this.options.apiUrl ?? 'https://api.telegram.org'}/bot${this.options.token}/sendMessage`;
    const text = `HedgeOS: ${transition.deviceAddress} contact changed ${transition.previousState} → ${transition.currentState} at ${transition.occurredAt.toISOString()}`;
    const response = await (this.options.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.options.chatId, text }),
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new Error(`Telegram ${retryable ? 'retryable' : 'permanent'} failure (${response.status})`);
    }
  }
}

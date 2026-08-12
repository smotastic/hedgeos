import { describe, expect, it, vi } from 'vitest';
import { TelegramNotificationAdapter } from './telegram.js';

describe('TelegramNotificationAdapter', () => {
  it('renders typed transition data and keeps credentials out of the message', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.text).toContain('closed → open');
      expect(body.text).not.toContain('secret-token');
      expect(body.chat_id).toBe('chat');
      return new Response('{}', { status: 200 });
    });
    await new TelegramNotificationAdapter({ token: 'secret-token', chatId: 'chat', apiUrl: 'http://fake', fetchImpl }).send(
      { id: 'action', executionId: 'execution', type: 'telegram_notification', status: 'pending', createdAt: new Date(), updatedAt: new Date() },
      { id: 'transition', observationId: 'observation', deviceAddress: 'AA:BB:CC:DD:EE:FF', capability: 'contact', previousState: 'closed', currentState: 'open', occurredAt: new Date('2026-01-01T00:00:00Z'), sequence: 2 },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

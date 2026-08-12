import { describe, expect, it } from 'vitest';
import { TelegramNotificationAdapter } from './telegram.js';
import type { StateTransition } from '@hedgeos/domain';

const transition: StateTransition = {
  id: 't1', observationId: 'o1', deviceAddress: 'AA:BB:CC:DD:EE:FF', capability: 'contact',
  previousState: 'closed', currentState: 'open', occurredAt: new Date('2026-01-01T00:00:00Z'), sequence: 2,
};

function transport(status: number) {
  let request: { url: string; body: unknown } | undefined;
  return {
    transport: { post: async (url: string, body: unknown) => { request = { url, body }; return { status, text: async () => 'failure' }; } },
    request: () => request,
  };
}

describe('Telegram notification adapter', () => {
  it('renders a deterministic message and keeps credentials out of the body', async () => {
    const fake = transport(200);
    await new TelegramNotificationAdapter('secret-token', 'chat-1', fake.transport).send(
      { id: 'a', executionId: 'e', type: 'telegram_notification', status: 'pending', createdAt: transition.occurredAt, updatedAt: transition.occurredAt },
      transition,
      { deviceName: 'Kitchen window' },
    );
    expect(fake.request()).toEqual({
      url: 'https://api.telegram.org/botsecret-token/sendMessage',
      body: { chat_id: 'chat-1', text: 'Kitchen window: closed → open (2026-01-01T00:00:00.000Z)' },
    });
  });

  it.each([[429, true], [503, true], [400, false]])('classifies HTTP %i as retryable=%s', async (status, retryable) => {
    const fake = transport(status);
    await expect(new TelegramNotificationAdapter('token', 'chat', fake.transport).send(
      { id: 'a', executionId: 'e', type: 'telegram_notification', status: 'pending', createdAt: transition.occurredAt, updatedAt: transition.occurredAt }, transition,
    )).rejects.toMatchObject({ retryable });
  });
});

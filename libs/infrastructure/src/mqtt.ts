import mqtt, { type MqttClient } from 'mqtt';
export interface MqttTransportOptions {
  readonly url: string;
  readonly topic: string;
  readonly username?: string;
  readonly password?: string;
  readonly clientId?: string;
}

export class MqttTransport {
  private client: MqttClient | null = null;
  private processing: Promise<void> = Promise.resolve();
  private lastError: Error | null = null;

  constructor(private readonly options: MqttTransportOptions) {}

  health(): { connected: boolean; lastError: string | null } {
    return { connected: this.client?.connected === true, lastError: this.lastError?.message ?? null };
  }

  async start(onMessage: (message: { topic: string; payload: Uint8Array; receivedAt: Date }) => Promise<void>): Promise<void> {
    const client = mqtt.connect(this.options.url, {
      username: this.options.username,
      password: this.options.password,
      clientId: this.options.clientId,
    });
    this.client = client;
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => { client.removeListener('connect', connected); reject(error); };
      const connected = () => {
        client.removeListener('error', fail);
        client.subscribe(this.options.topic, error => error ? reject(error) : resolve());
      };
      client.once('error', fail);
      client.once('connect', connected);
    });
    client.on('error', error => { this.lastError = error; });
    client.on('connect', () => { this.lastError = null; });
    client.on('message', (topic, payload) => {
      // MQTT delivery is at-least-once; serialize application processing so a
      // single device stream cannot race its state projection.
      this.processing = this.processing
        .then(() => onMessage({ topic, payload, receivedAt: new Date() }))
        .catch(error => { this.lastError = error instanceof Error ? error : new Error(String(error)); });
    });
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    await this.processing;
    await new Promise<void>((resolve, reject) => client.end(false, {}, error => error ? reject(error) : resolve()));
  }
}

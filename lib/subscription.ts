import { StompClient } from "./stomp.client";

export class Subscription {
  private headers: Record<string, any>;
  private client: StompClient;
  private queue: string;
  private id: any;

  constructor(
    id: any,
    queue: string,
    headers: Record<string, any>,
    client: StompClient
  ) {
    this.id = id;
    this.queue = queue;
    this.headers = headers;
    this.client = client;
  }

  getId() {
    return this.id;
  }

  ack(headers?: Record<string, any>) {
    headers = Object.assign({}, headers, {
      id: this.id,
    });
    return this.client.ack(this.headers['message-id'], this.id);
  }

  nack(headers?: Record<string, any>) {
    headers = Object.assign({}, headers, {
      id: this.headers.id,
    });
    return this.client.nack(this.headers['message-id'], this.id);
  }

  unsubscribe(headers?: Record<string, any>) {
    headers = Object.assign({}, headers, {
      id: this.id,
    });
    return this.client.unsubscribe(this.queue, headers);
  }
}

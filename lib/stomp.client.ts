import { createConnection, Socket } from "net";
import { connect, ConnectionOptions } from "tls";
import { StompFrameEmitter } from "./parser";
import { StompFrame } from "./frame";
import { EventEmitter } from "events";

// Copied from modern node util._extend, because it didn't exist
// in node 0.4.
function _extend(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || typeof add !== "object") return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
}

// Inbound frame validators
const StompFrameCommands = {
  "1.0": {
    CONNECTED: {
      headers: { session: { required: true } },
    },
    MESSAGE: {
      headers: {
        destination: { required: true },
        "message-id": { required: true },
      },
    },
    ERROR: {},
    RECEIPT: {},
  },
  "1.1": {
    CONNECTED: {
      headers: { session: { required: true } },
    },
    MESSAGE: {
      headers: {
        destination: { required: true },
        "message-id": { required: true },
      },
    },
    ERROR: {},
    RECEIPT: {},
  },
};

type ProtocolVersion = "1.0" | "1.1";

interface ReconnectOptions {
  delay: number;
  retries: number;
}

export interface StompClientOptions {
  host: string;
  user?: string;
  pass?: string;
  port?: number;
  protocolVersion?: ProtocolVersion;
  vhost?: string;
  reconnectOpts?: ReconnectOptions;
  tlsOpts: ConnectionOptions;
}

export class StompClient extends EventEmitter {
  address: string;
  user: string;
  pass: string;
  port: number;
  version: ProtocolVersion;
  subscriptions: Record<
    string,
    { headers: Record<string, unknown>; listeners: any }
  > = {};
  private stompFrameEmitter: StompFrameEmitter;
  vhost: string;
  reconnectOpts: any;
  tls: ConnectionOptions;
  private retryNumber: number;
  private stream?: Socket;
  private disconnectCallback: any;
  private reconnectTimer: NodeJS.Timeout;

  constructor(opts: StompClientOptions) {
    super();
    this.user = opts.user || "";
    this.pass = opts.pass || "";
    this.address = opts.host || "127.0.0.1";
    this.port = opts.port || 61613;
    this.version = opts.protocolVersion || "1.0";
    this.stompFrameEmitter = new StompFrameEmitter(
      StompFrameCommands[this.version]
    );
    this.vhost = opts.vhost || null;
    this.reconnectOpts = opts.reconnectOpts || {};
    this.tls = opts.tlsOpts;
    this.retryNumber = 0;
  }

  get writable() {
    return this.stream?.writable;
  }

  connect(connectedCallback?: any, errorCallback?: any) {
    //reset this field.
    delete this.disconnectCallback;

    if (errorCallback) {
      this.on("error", errorCallback);
    }

    let connectEvent = "connect";

    if (this.tls) {
      this.stream = connect(this.port, this.address, this.tls);
      connectEvent = "secureConnect";
    } else {
      this.stream = createConnection(this.port, this.address);
    }

    this.stream.on(connectEvent, this.onConnect.bind(this));

    this.stream.on("error", (err) => {
      process.nextTick(() => {
        //clear all of the stomp frame emitter listeners - we don't need them, we've disconnected.
        this.stompFrameEmitter.removeAllListeners();
      });
      if (this.retryNumber < this.reconnectOpts.retries) {
        if (this.retryNumber === 0) {
          //we're disconnected, but we're going to try and reconnect.
          this.emit("reconnecting");
        }
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, this.retryNumber++ * this.reconnectOpts.delay);
      } else {
        if (this.retryNumber === this.reconnectOpts.retries) {
          err.message += " [reconnect attempts reached]";
          (err as any).reconnectionFailed = true;
        }
        this.emit("error", err);
      }
    });

    if (connectedCallback) {
      this.on("connect", connectedCallback);
    }

    return this;
  }

  disconnect(callback) {
    //just a bit of housekeeping. Remove the no-longer-useful reconnect timer.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.stream) {
      //provide a default no-op function as the callback is optional
      this.disconnectCallback = callback || function () {};

      new StompFrame({
        command: "DISCONNECT",
      }).send(this.stream);

      process.nextTick(() => {
        this.stream.end();
      });
    }

    return this;
  }

  onConnect() {
    // First set up the frame parser
    const frameEmitter = this.stompFrameEmitter;

    this.stream.on("data", (data) => {
      frameEmitter.handleData(data);
    });

    this.stream.on("end", () => {
      if (this.disconnectCallback) {
        this.disconnectCallback();
      } else {
        this.stream.emit("error", new Error("Server has gone away"));
      }
    });

    frameEmitter.on("MESSAGE", (frame) => {
      const subscribed = this.subscriptions[frame.headers.destination];
      // .unsubscribe() deletes the subscribed callbacks from the subscriptions,
      // but until that UNSUBSCRIBE message is processed, we might still get
      // MESSAGE. Check to make sure we don't call .map() on null.
      if (subscribed) {
        subscribed.listeners.map((callback) => {
          callback(frame.body, frame.headers);
        });
      }
      this.emit("message", frame.body, frame.headers);
    });

    frameEmitter.on("CONNECTED", (frame) => {
      if (this.retryNumber > 0) {
        //handle a reconnection differently to the initial connection.
        this.emit("reconnect", frame.headers.session, this.retryNumber);
        this.retryNumber = 0;
      } else {
        this.emit("connect", frame.headers.session);
      }
    });

    frameEmitter.on("ERROR", (frame) => {
      var er = new Error(frame.headers.message);
      // frame.headers used to be passed as er, so put the headers on er object
      _extend(er, frame.headers);
      this.emit("error", er, frame.body);
    });

    frameEmitter.on("parseError", (err) => {
      // XXX(sam) err should be an Error object to more easily track the
      // point of error detection, but it isn't, so create one now.
      const er: any = new Error(err.message);
      if (err.details) {
        er.details = err.details;
      }
      this.emit("error", er);
      this.stream.destroy();
    });

    // Send the CONNECT frame
    const headers: Record<string, unknown> = {
      login: this.user,
      passcode: this.pass,
    };

    if (this.version !== "1.0") {
      headers["accept-version"] = Object.keys(StompFrameCommands).join(",");
    }

    if (this.vhost && this.version === "1.1") headers.host = this.vhost;

    new StompFrame({
      command: "CONNECT",
      headers: headers,
    }).send(this.stream);

    //if we've just reconnected, we'll need to re-subscribe
    for (var queue in this.subscriptions) {
      new StompFrame({
        command: "SUBSCRIBE",
        headers: this.subscriptions[queue].headers,
      }).send(this.stream);
    }
  }

  subscribe(
    queue: string,
    headers: Record<string, unknown>,
    callback: (body: string, headers: Record<string, unknown>) => void
  ) {
    headers.destination = queue;
    if (!(queue in this.subscriptions)) {
      this.subscriptions[queue] = {
        listeners: [],
        headers: headers,
      };
      new StompFrame({
        command: "SUBSCRIBE",
        headers: headers,
      }).send(this.stream);
    }
    this.subscriptions[queue].listeners.push(callback);
    return this;
  }

  // no need to pass a callback parameter as there is no acknowledgment for
  // successful UNSUBSCRIBE from the STOMP server
  unsubscribe(queue: string, headers: Record<string, unknown> = {}) {
    headers.destination = queue;
    new StompFrame({
      command: "UNSUBSCRIBE",
      headers: headers,
    }).send(this.stream);
    delete this.subscriptions[queue];
    return this;
  }

  publish(queue: string, message, headers: Record<string, unknown> = {}) {
    headers.destination = queue;
    new StompFrame({
      command: "SEND",
      headers: headers,
      body: message,
    }).send(this.stream);
    return this;
  }

  sendAckNack(
    acknack: "ACK" | "NACK",
    messageId: string,
    subscription: string,
    transaction?: string
  ) {
    const headers = {
      "message-id": messageId,
      subscription: subscription,
    };
    if (transaction) {
      headers["transaction"] = transaction;
    }
    new StompFrame({
      command: acknack,
      headers: headers,
    }).send(this.stream);
  }

  ack(messageId: string, subscription: string, transaction?: string) {
    this.sendAckNack("ACK", messageId, subscription, transaction);
    return this;
  }

  nack(messageId: string, subscription: string, transaction?: string) {
    this.sendAckNack("NACK", messageId, subscription, transaction);
    return this;
  }
}

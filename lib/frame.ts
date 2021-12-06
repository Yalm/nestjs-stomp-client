export class StompFrame {
  command: string;
  headers: Record<string, any>;
  body: string;
  contentLength: number;

  constructor(frame?: {
    command: string;
    headers?: Record<string, unknown>;
    body?: string;
  }) {
    this.command = frame?.command || "";
    this.headers = frame?.headers || {};
    this.body = frame?.body || "";
    this.contentLength = -1;
  }

  toString() {
    return JSON.stringify({
      command: this.command,
      headers: this.headers,
      body: this.body,
    });
  }

  send(stream) {
    // Avoid small writes, they get sent in their own tcp packet, which
    // is not efficient (and v8 does fast string concat).
    var frame = this.command + "\n";
    for (var key in this.headers) {
      frame += key + ":" + this.headers[key] + "\n";
    }
    if (this.body.length > 0) {
      if (!this.headers.hasOwnProperty("suppress-content-length")) {
        frame += "content-length:" + Buffer.byteLength(this.body) + "\n";
      }
    }
    frame += "\n";
    if (this.body.length > 0) {
      frame += this.body;
    }
    frame += "\0";
    if (frame) stream.write(frame);
  }

  setCommand(command: string) {
    this.command = command;
  }

  setHeader(key: string, value) {
    this.headers[key] = value;
    if (key.toLowerCase() === "content-length") {
      this.contentLength = parseInt(value);
    }
  }

  appendToBody(data) {
    this.body += data;
  }

  validate(frameConstruct) {
    var frameHeaders = Object.keys(this.headers);

    // Check validity of frame headers
    for (var header in frameConstruct.headers) {
      var headerConstruct = frameConstruct.headers[header];

      // Check required (if specified)
      if (
        headerConstruct.hasOwnProperty("required") &&
        headerConstruct.required === true
      ) {
        if (frameHeaders.indexOf(header) === -1) {
          return {
            isValid: false,
            message: 'Header "' + header + '" is required for ' + this.command,
            details: "Frame: " + this.toString(),
          };
        }
      }

      // Check regex of header value (if specified)
      if (
        headerConstruct.hasOwnProperty("regex") &&
        frameHeaders.indexOf(header) > -1
      ) {
        if (!this.headers[header].match(headerConstruct.regex)) {
          return {
            isValid: false,
            message:
              'Header "' +
              header +
              '" has value "' +
              this.headers[header] +
              '" which does not match against the following regex: ' +
              headerConstruct.regex +
              " (Frame: " +
              this.toString() +
              ")",
          };
        }
      }
    }

    return { isValid: true };
  }
}

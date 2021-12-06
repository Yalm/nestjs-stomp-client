import { StompClient } from "./stomp.client";
import { StompModuleOptions } from "./stomp.interfaces";

export function createConnection(options: StompModuleOptions) {
  const stompClient = new StompClient(options);

  return new Promise<StompClient>((resolve, reject) => {
    stompClient.connect(
      () => {
        resolve(stompClient);
      },
      (error) => {
        reject(error);
      }
    );
  });
}

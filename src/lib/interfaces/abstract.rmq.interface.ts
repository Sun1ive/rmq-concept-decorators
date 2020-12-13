import type { EventEmitter } from "events";
import { Channel, Connection } from "amqplib";

export interface AbstractRMQService extends EventEmitter {
  connect(): Promise<void>;
  dispose(): Promise<void>;
  channel: Channel;
  connection: Connection;
  terminated: boolean;
  timeout: NodeJS.Timeout | undefined;
}

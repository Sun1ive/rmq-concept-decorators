import { Channel, connect, Connection } from "amqplib";
import os from "os";
import { EventEmitter } from "events";
import { format } from "util";
import { rmqEvent } from "../decorators";
import { IConfigService } from "../interfaces/config.service.interface";
import { ILoggerService } from "../interfaces/logger.service.interface";

const TIMEOUT = 5000;

export abstract class AbstractRMQ {
  private _attempt: number = 0;

  public readonly eventEmitter: EventEmitter = new EventEmitter();
  public channel: Channel;
  public connection: Connection;
  public terminated: boolean = false;
  public timeout: NodeJS.Timeout | undefined;

  protected constructor(
    private readonly logger: ILoggerService,
    private readonly config: IConfigService
  ) {
    this.connect();
  }

  private readonly _reconnect = async () => {
    if (!this.terminated && !this.timeout) {
      this.logger.log(`[${AbstractRMQ.name}]: Reconnect attempt ${this._attempt}`);

      this.timeout = setTimeout(async () => {
        this._attempt += 1;
        this.timeout = undefined;
        await this.connect();
      }, TIMEOUT);
    }
  };

  public async connect(): Promise<void> {
    const {
      rabbitHeartbeat,
      rabbitHost,
      rabbitPassword,
      rabbitPort,
      rabbitUser,
      rabbitVHost,
    } = this.config.getConfig();
    this.logger.log({ config: format(this.config.getConfig()) });
    try {
      if (this.connection) {
        this.logger.log("Closing old connection...");
        await this.connection.close();
      }
    } catch {}

    try {
      this.connection = await connect({
        hostname: rabbitHost,
        port: rabbitPort,
        password: rabbitPassword,
        heartbeat: rabbitHeartbeat,
        username: rabbitUser,
        vhost: rabbitVHost,
        protocol: "amqp",
      });

      this.connection.on("error", async (err) => {
        this.logger.log(format("[Connection error]:", err));
        await this._reconnect();
      });

      this.channel = await this.connection.createConfirmChannel();
      await this.channel.prefetch(1);

      this.logger.log({
        [AbstractRMQ.name]: format({
          connected: true,
          host: rabbitHost,
          vhost: rabbitVHost,
          user: rabbitUser,
          pid: process.pid,
          hostname: os.hostname(),
        }),
      });
      this.eventEmitter.emit(rmqEvent, true);
    } catch (error) {
      this.logger.log(format("On Connect error", error));

      this._reconnect();
    }
  }

  public async dispose(): Promise<void> {
    this.logger.log(`[${AbstractRMQ.name}]: Terminating`);
    this.terminated = true;

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    try {
      await this.channel.close();
    } catch (error) {
      this.logger.log(format("Dispose close channel error", error));
    }

    try {
      await this.connection.close();
    } catch (error) {
      this.logger.log(format("Dispose error", error));
    }
  }
}

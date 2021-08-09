import { Channel, connect, Connection } from "amqplib";
import os from "os";
import { EventEmitter } from "events";
import { format } from "util";
import { CONNECT_EVENT } from "../decorators";
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

  private readonly _reconnect = () => {
    if (!this.terminated && !this.timeout) {
      this.logger.log(`[${AbstractRMQ.name}]: Reconnect attempt ${this._attempt}`);

      this.timeout = setTimeout(() => {
        const onConnect = async () => {
          await this.connect();
        };
        this._attempt += 1;
        this.timeout = undefined;
        onConnect();
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
      rabbitPrefetch,
    } = this.config.getConfig();
    this.logger.log({ config: this.config.getConfig() });
    await this._cleanUp();

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

      this.connection.on("error", (err) => {
        this.logger.log(format("[Connection error]:", err));
      });
      this.connection.on("close", (reason?: string) => {
        this.logger.log(format("[Connection closed by reason]:", reason));
        if (reason) {
          this._reconnect();
        }
      });
      this.connection.on("blocked", (reason) => {
        this.logger.log(format("[Connection blocked by reason]:", reason));
        this._reconnect();
      });

      this.channel = await this.connection.createConfirmChannel();
      await this.channel.prefetch(rabbitPrefetch);

      this.channel.on("error", (err) => {
        this.logger.log(format("[Channel error]:", err));
      });
      this.channel.on("close", (reason?: any) => {
        if (reason) {
          this.logger.log(format("[Channel closed by]:", reason));
        }
      });

      this.logger.log({
        [AbstractRMQ.name]: {
          connected: true,
          host: rabbitHost,
          vhost: rabbitVHost,
          user: rabbitUser,
          pid: process.pid,
          hostname: os.hostname(),
        },
      });
      this.eventEmitter.emit(CONNECT_EVENT, true);
    } catch (error) {
      this.logger.log(format("On Connect error", error));
      this._reconnect();
    }
  }

  private async _cleanUp() {
    if (this.channel) {
      this.logger.log("Cleanup old channels...");
      await this.channel.close().catch(() => {});
    }
    if (this.connection) {
      this.logger.log("Cleanup old connections...");
      await this.connection.close().catch(() => {});
    }
  }

  public async dispose(): Promise<void> {
    this.logger.log(`[${AbstractRMQ.name}]: Terminating`);
    this.terminated = true;

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    await this._cleanUp();
    this.logger.log({ terminated: true });
  }
}

import { Channel, connect, Connection } from "amqplib";
import { EventEmitter } from "events";
import { format } from "util";
import { rmqEvent } from "../decorators";
import { IConfigService } from "../interfaces/config.service.interface";
import { ILoggerService } from "../interfaces/logger.service.interface";
import debug from "debug";

const TIMEOUT = 5000;

export abstract class AbstractRMQ extends EventEmitter {
  private _attempt: number = 0;
  public channel: Channel;
  public connection: Connection;
  public terminated: boolean = false;
  public timeout: NodeJS.Timeout | undefined;

  protected constructor(
    private readonly logger: ILoggerService,
    private readonly config: IConfigService
  ) {
    super();
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
    try {
      this.logger.log(format(AbstractRMQ.name, "Connecting"));
      const {
        rabbitHeartbeat,
        rabbitHost,
        rabbitPassword,
        rabbitPort,
        rabbitUser,
        rabbitVHost,
      } = this.config.getConfig();
      this.logger.log({ config: this.config.getConfig() });
      if (this.connection) {
        await this.connection.close();
      }

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

      this.channel = await this.connection.createConfirmChannel();
      await this.channel.prefetch(1);

      this.channel.on("close", (reason) => {
        this.logger.log(format(`[Channel closed]: reason ${reason}`));
        process.nextTick(() => {
          this._reconnect();
        });
      });
      const events = ["blocked", "unblocked", "error", "drain", "return"];
      events.forEach((event) => {
        this.channel.on(event, (...args: any[]) => {
          this.logger.error(`[Channel ${event}]: ARGS: ${args}`);
        });
      });

      this.logger.log(format(AbstractRMQ.name, "Connected"));

      this.emit(rmqEvent, true);
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

    if (this.channel) {
      try {
        await this.channel.close();
      } catch (error) {
        this.logger.log(format("Dispose close channel error", error));
      }
    }

    try {
      await this.connection.close();
    } catch (error) {
      this.logger.log(format("Dispose error", error));
    }
  }
}

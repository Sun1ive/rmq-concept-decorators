import { Channel, connect, Connection } from "amqplib";
import { EventEmitter } from "events";
import { CONNECT_EVENT } from "../decorators";
import { IConfigService } from "../interfaces/config.service.interface";
import { ILoggerService } from "../interfaces/logger.service.interface";

const TIMEOUT = 5000;
const SERVICE_NAME = "Abstract RabbitMQ Service";

export abstract class AbstractRMQ {
  private _attempt: number = 0;

  public readonly eventEmitter: EventEmitter = new EventEmitter();
  public channel: Channel;
  public connection?: Connection;
  public terminated: boolean = false;
  public timeout: NodeJS.Timeout | undefined;

  protected constructor(
    private readonly config: IConfigService,
    private readonly logger: ILoggerService = {
      error(...data) {
        console.error(...data);
      },
      log(...data) {
        console.log(...data);
      },
    }
  ) {
    this.connect();
  }

  private readonly _reconnect = () => {
    if (!this.terminated && !this.timeout) {
      this.logger.log(`[${SERVICE_NAME}]: Reconnect attempt ${this._attempt}`);

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
    this.logger.log(this.config.getConfig());
    if (this.connection) {
      this.connection.removeAllListeners();
      this.logger.log("Closing old connection...");
      await this.connection.close();
    }

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
        this.logger.log("[Connection error]: ", err);
        this._reconnect();
      });
      this.connection.on("close", (res?: string) => {
        this.logger.log("[Connection closed]:", res || "disposed");
        this.connection = undefined;
        this._reconnect();
      });
      this.connection.on("blocked", (reason) => {
        this.logger.log("[Connection blocked]:", reason);
        this._reconnect();
      });

      this.channel = await this.connection.createConfirmChannel();
      await this.channel.prefetch(rabbitPrefetch);
      this.channel.on("error", (err) => {
        this.logger.log("[Channel error]:", err);
      });
      this.channel.on("close", () => {
        this.logger.log("[Channel closed]");
      });

      this.eventEmitter.emit(CONNECT_EVENT, true);
      this.logger.log(`[${SERVICE_NAME}]: Connected`);
    } catch (error) {
      this.logger.log("On Connect error", error);
      this._reconnect();
    }
  }

  public async dispose(): Promise<void> {
    this.logger.log(`[${SERVICE_NAME}]: Terminating`);
    this.terminated = true;

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    if (this.channel) {
      try {
        await this.channel.close();
      } catch (error) {
        this.logger.log("Dispose channel error", error);
      }
    }

    if (this.connection) {
      try {
        await this.connection.close();
      } catch (error) {
        this.logger.log("Dispose connection error", error);
      }
    }
  }
}

import { Channel, connect, Connection } from "amqplib";
import { EventEmitter } from "events";
import { format } from "util";
import { rmqEvent } from "../../lib";

export abstract class AbstractRMQ extends EventEmitter {
  public channel: Channel;
  public connection: Connection;
  public terminated: boolean = false;
  public timeout: NodeJS.Timeout | undefined;

  protected constructor() {
    super();
    this.connect();
  }

  public async connect(): Promise<void> {
    try {
      console.log(format(AbstractRMQ.name, "Connecting"));

      this.connection = await connect({
        hostname: process.env.RABBITMQ_HOST,
        password: process.env.RABBITMQ_PASSWORD,
        username: process.env.RABBITMQ_USER,
        vhost: process.env.RABBITMQ_VHOST,
        protocol: "amqp",
      });
      this.channel = await this.connection.createConfirmChannel();
      await this.channel.prefetch(1);

      this.channel.on("close", (reason) => {
        console.log(format(`[Channel closed]: reason ${reason}`));
        process.nextTick(() => {
          console.log(this.timeout);
          if (!this.timeout) {
            this.timeout = setTimeout(async () => {
              this.timeout = undefined;
              await this.connect();
            }, 5000);
          }
        });
      });
      this.connection.on("error", (err) => {
        console.log(format("[Connection error]:", err));
      });

      console.log(format(AbstractRMQ.name, "Connected"));

      this.emit(rmqEvent, true);
    } catch (error) {
      console.log(format("On Connect error", error));

      if (this.terminated) {
        return;
      }
      if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = undefined;
      }

      this.timeout = setTimeout(async () => {
        this.timeout = undefined;
        await this.connect();
      }, 5000);
    }
  }

  public async dispose(): Promise<void> {
    try {
      this.terminated = true;
      if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = undefined;
      }

      await this.channel.close();
      await this.connection.close();
    } catch (error) {
      console.log(format("Dispose error", error));
    }
  }
}

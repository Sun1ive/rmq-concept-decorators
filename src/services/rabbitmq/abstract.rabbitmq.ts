import { Channel, connect, Connection } from "amqplib";
import { EventEmitter } from "events";
import { format } from "util";

export abstract class AbstractRMQ extends EventEmitter {
  protected channel: Channel;
  protected connection: Connection;
  protected connected: Promise<void>;
  protected terminated: boolean = false;
  protected timeout: NodeJS.Timeout | undefined;

  protected constructor() {
    super();
    this.connect();
  }

  protected async connect(): Promise<void> {
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
          this.connect();
        });
      });
      this.connection.on("error", (err) => {
        console.log(format("[Connection error]: ", err));
      });

      console.log(format(AbstractRMQ.name, "Connected"));
      this.emit("rmq_connect", true);
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
        await this.connect();
      }, 5000);
    }
  }

  protected async dispose(): Promise<void> {
    try {
      this.channel.removeAllListeners();
      await this.channel.close();
      this.connection.removeAllListeners();
      await this.connection.close();
    } catch (error) {
      console.log(format("Dispose error ", error));
    }
  }
}

require("dotenv").config();
import { Message } from "amqplib";
import { ConfigType } from "../..";
import { AbstractRMQ } from "../../lib";
import { RabbitMQInstance, Bind, Consume } from "../../lib/decorators";

class Logger {
  async log(log: string) {
    console.log(log);
  }
  async error(str: string) {}
}

@RabbitMQInstance()
export class RabbiMQService extends AbstractRMQ {
  public constructor(private readonly _config: ConfigType) {
    super(new Logger(), _config);
  }

  @Bind((instance: RabbiMQService) => ({
    exchange: `d-${instance._config.getConfig().rabbitExchange}`,
    routingKeys: [""],
    assertExchange: {
      exchangeType: "direct",
    },
    queueOptions: {
      autoDelete: true,
      durable: false,
    },
  }))
  public handle(msg: Message | null) {
    if (!msg) {
      return;
    }

    try {
      this.channel.ack(msg);
      console.log("handle", msg.content.toString());
    } catch (error) {
      console.log(error);
    }
  }

  @Bind((instance: RabbiMQService) => ({
    exchange: instance._config.getConfig().rabbitExchange,
    routingKeys: ["#"],
    assertExchange: {
      exchangeType: "topic",
    },
    queueOptions: {
      autoDelete: true,
      durable: false,
    },
  }))
  public wpHandle(msg: Message | null) {
    if (!msg) {
      return;
    }

    try {
      this.channel.ack(msg);
      console.log("wp_handle", msg.content.toString());
    } catch (error) {
      console.log(error);
    }
  }

  @Consume(() => ({ queue: "test", assertQueue: { autoDelete: true } }))
  public consumeHandler(msg: Message | null) {
    if (!msg) {
      return;
    }

    try {
      this.channel.ack(msg);
      console.log(msg.content.toString());
    } catch (error) {
      console.log(error);
    }
  }

  public async dispose() {
    await super.dispose();
  }
}

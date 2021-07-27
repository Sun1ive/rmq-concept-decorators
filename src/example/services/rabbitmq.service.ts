require("dotenv").config();
import { Message, Replies } from "amqplib";
import { ConfigType } from "../..";
import { AbstractRMQ } from "../../lib";
import {
  RabbitMQInstance,
  Bind,
  Consume,
  AssertExchange,
  AssertQueue,
  READY_EVENT,
} from "../../lib/decorators";

class Logger {
  async log(log: string) {
    console.log(log);
  }
  async error(str: string) {}
}

@RabbitMQInstance()
export class RabbitMQService extends AbstractRMQ {
  public constructor(private readonly _config: ConfigType) {
    super(new Logger(), _config);

    this.eventEmitter.on(READY_EVENT, this.init);
  }

  public init() {
    console.log("After connect hook");
  }

  @AssertQueue((instance: RabbitMQService) => ({ queue: "test" }))
  public readonly _testQueue: Replies.AssertQueue;

  @AssertExchange((instance: RabbitMQService) => {
    const { rabbitExchange } = instance._config.getConfig();

    return {
      exchange: `alt_${rabbitExchange}`,
      exchangeType: "topic",
      deleteBeforeAssert: true,
    };
  })
  public readonly _exchange: Replies.AssertExchange;

  @Bind((instance: RabbitMQService) => ({
    exchange: `d-${instance._config.getConfig().rabbitExchange}`,
    routingKeys: ["#"],
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

  @Bind((instance: RabbitMQService) => {
    const { rabbitExchange } = instance._config.getConfig();
    return {
      exchange: rabbitExchange,
      routingKeys: ["#"],
      assertExchange: {
        exchangeType: "topic",
        deleteBeforeAssert: true,
        exchangeOptions: {
          alternateExchange: `alt_${rabbitExchange}`,
        },
      },
      queueOptions: {
        autoDelete: true,
        durable: false,
      },
    };
  })
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

  @Consume(() => ({ queue: "test", assertQueue: { autoDelete: false } }))
  public consumeHandler(msg: Message | null) {
    if (!msg) {
      return;
    }

    try {
      this.channel.ack(msg);
    } catch (error) {
      console.log(error);
    }
  }

  public async dispose() {
    await super.dispose();
  }
}

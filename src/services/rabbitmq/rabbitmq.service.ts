require("dotenv").config();
import { Message } from "amqplib";
import { ConfigType } from "../..";
import { AbstractRMQ } from "../../lib";
import {
  RabbitMQInstance,
  Bind,
  Consume,
  AssertExchange,
  asyncStorage,
  ALS_REQ_ID,
} from "../../lib/decorators";

class Logger {
  async log(log: string) {
    console.log(log);
  }
  async error(str: string) {}
}

function logger() {
  return (target: any, prop: string, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    if (typeof original === "function") {
      const logged = function (this: any, ...args: any[]) {
        console.log(asyncStorage.getStore());
        const id = asyncStorage.getStore()?.get(ALS_REQ_ID);
        const values = asyncStorage.getStore()?.values() || [];
        for (const value of values) {
          console.log("VALUE ", value);
        }
        return original.apply(this, args);
      };
      return {
        value: logged,
      };
    }
  };
}

@RabbitMQInstance()
export class RabbiMQService extends AbstractRMQ {
  public constructor(private readonly _config: ConfigType) {
    super(new Logger(), _config);
  }

  @AssertExchange((instance: RabbiMQService) => {
    const { rabbitExchange } = instance._config.getConfig();

    return {
      exchange: `alt_${rabbitExchange}`,
      exchangeType: "topic",
      deleteBeforeAssert: true,
    };
  })
  public readonly _exchange: any;

  @Bind((instance: RabbiMQService) => ({
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

  @Bind((instance: RabbiMQService) => {
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
      this.test({ id: "9999" });
    } catch (error) {
      console.log(error);
    }
  }

  @logger()
  public test(params: { id: string }) {
    console.log(params);
  }

  @Consume(() => ({ queue: "test", assertQueue: { autoDelete: true } }))
  public consumeHandler(msg: Message | null) {
    if (!msg) {
      return;
    }

    try {
      this.channel.ack(msg);
      this.test({ id: "123" });
    } catch (error) {
      console.log(error);
    }
  }

  public async dispose() {
    await super.dispose();
  }
}

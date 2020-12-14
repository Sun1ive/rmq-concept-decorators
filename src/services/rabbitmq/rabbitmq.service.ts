import { Message } from "amqplib";
import { AbstractRMQ } from "../../lib";
import { RabbitMQInstance, Bind, Consume } from "../../lib/decorators";
import { Config } from "../../lib/interfaces/config.service.interface";

class Logger {
  async log(log: string) {
    console.log(log);
  }
  async error(str: string) {}
}

const c = {
  getConfig() {
    return {
      rabbitHeartbeat: 30,
      rabbitHost: process.env.RABBITMQ_HOST,
      rabbitPassword: process.env.RABBITMQ_PASSWORD,
      rabbitPort: +process.env.RABBITMQ_PORT,
      rabbitUser: process.env.RABBITMQ_USER,
      rabbitVHost: process.env.RABBITMQ_VHOST,
    } as Config;
  },
};

@RabbitMQInstance()
export class RabbiMQService extends AbstractRMQ {
  public constructor(private readonly _config: any) {
    super(new Logger(), c);
  }

  @Bind({
    exchange: () => "d-" + process.env.RABBITMQ_EXCHANGE,
    routingKey: "",
    assertExchange: {
      exchangeType: "direct",
    },
    queueOptions: {
      autoDelete: true,
      durable: false,
    },
  })
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

  @Bind({
    exchange: () => process.env.RABBITMQ_EXCHANGE,
    routingKey: "",
    assertExchange: {
      exchangeType: "fanout",
    },
    queueOptions: {
      autoDelete: true,
      durable: false,
    },
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

  @Consume({ queue: () => "test" })
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

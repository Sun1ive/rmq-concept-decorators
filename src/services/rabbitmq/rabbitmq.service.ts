import { Message } from "amqplib";
import { RabbitMQInstance, Bind, Consume } from "../../lib/decorators";
import { AbstractRMQ } from "./abstract.rabbitmq";

@RabbitMQInstance()
export class RabbiMQService extends AbstractRMQ {
  public constructor(private readonly _config: any) {
    super();
  }

  @Bind({
    exchange: "d-" + process.env.RABBITMQ_EXCHANGE,
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
    exchange: process.env.RABBITMQ_EXCHANGE,
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

  @Consume({ queue: "test" })
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

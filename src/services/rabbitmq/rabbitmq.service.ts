import { Message } from "amqplib";
import { v4 } from "uuid";
import { RabbitMQInstance, Bind, Consume } from "../../lib/decorators";
import { AbstractRMQ } from "./abstract.rabbitmq";

@RabbitMQInstance()
export class RabbiMQService extends AbstractRMQ {
  public constructor(private readonly _config: any) {
    super();
  }

  @Bind({
    exchange: process.env.RABBITMQ_EXCHANGE,
    queue: v4(),
    routingKey: "",
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
    exchange: "justin_pms",
    queue: v4(),
    routingKey: "",
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

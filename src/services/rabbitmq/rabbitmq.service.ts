import { Channel, Message, Options } from "amqplib";
import { v4 } from "uuid";
import { AbstractRMQ } from "./abstract.rabbitmq";

// TODO: reconnect?
// TODO: bind real queue
// TODO: something instead constructor for binding

const bind_key = "BIND_KEY";
const consume_key = "CONSUME_KEY";

interface Params {
  exchange?: string;
  queue?: string;
  queueOptions?: Options.AssertQueue;
  routingKey?: string;
}

const bindMap = new Set<string>();
const consumeMap = new Set<string>();

function RabbitMQInstance() {
  return (cls): any => {
    return class extends cls {
      constructor() {
        super();
        this.on("rmq_connect", async () => {
          console.log("DECORATOR PROCESSING");
          await Promise.all(
            Array.from(bindMap).map(async (key) => {
              try {
                const meta = Reflect.getMetadata(bind_key, cls.prototype, key);
                if (meta) {
                  const { queue: queueName, exchange, routingKey, queueOptions } = meta;
                  const channel: Channel = this.channel;
                  const { queue } = await channel.assertQueue(queueName, queueOptions);
                  await channel.bindQueue(queue, exchange, routingKey);
                  await channel.consume(queue, this[key].bind(this));

                  console.log(this[key]);
                  console.log({ meta });
                }
              } catch (error) {
                console.log("Bind Error", error);
              }
            })
          );

          await Promise.all(
            Array.from(consumeMap).map(async (key) => {
              try {
                const meta = Reflect.getMetadata(consume_key, cls.prototype, key);
                if (meta) {
                  await (this.channel as Channel).consume(meta.queue, this[key].bind(this));
                  console.log(this[key]);

                  console.log(meta);
                }
              } catch (error) {
                console.log("consume error", error);
              }
            })
          );
        });
      }
    };
  };
}

function Bind({ exchange, queue, routingKey = "", queueOptions }: Params) {
  return (target, key, descriptor) => {
    console.log({
      exchange,
      queue,
      routingKey,
      target,
      key,
      descriptor,
    });

    bindMap.add(key);

    Reflect.defineMetadata(
      bind_key,
      {
        exchange,
        queue: queue ?? v4(),
        routingKey,
        queueOptions,
      },
      target,
      key
    );
  };
}

type ConsumeParams = {
  queue: string;
};

function Consume({ queue }: ConsumeParams) {
  return (target, prop, descriptor) => {
    consumeMap.add(prop);

    Reflect.defineMetadata(
      consume_key,
      {
        queue,
      },
      target,
      prop
    );
  };
}

@RabbitMQInstance()
export class RabbiMQService extends AbstractRMQ {
  public constructor() {
    super();

    console.log(process.env);
  }

  @Bind({
    exchange: process.env.RABBITMQ_EXCHANGE,
    queue: v4(),
    routingKey: "",
    queueOptions: {
      autoDelete: true,
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

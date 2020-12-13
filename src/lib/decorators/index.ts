import { Options } from "amqplib/properties";
import { v4 } from "uuid";
import { AbstractRMQService } from "../interfaces/abstract.rmq.interface";

export const bind_key = Symbol("BIND_KEY");
export const consume_key = Symbol("CONSUME_KEY");
export const rmqEvent = "RMQ_CONNECT";

interface Params {
  exchange?: string;
  queue?: string;
  queueOptions?: Options.AssertQueue;
  routingKey?: string;
}
interface ConsumeParams {
  queue: string;
}

interface AbstractConstructor<Type = any> extends Function {
  prototype: Type;
}

interface Constructor<Type = any, Args extends any[] = any[]> extends AbstractConstructor {
  new (...args: Args): Type;
}

const bindMap = new Set<string>();
const consumeMap = new Set<string>();

export function RabbitMQInstance() {
  return (cls: Constructor<AbstractRMQService>): any => {
    return class extends cls {
      constructor(...args: any[]) {
        super(...args);
        this.on(rmqEvent, async () => {
          await Promise.all(
            Array.from(bindMap).map(async (key) => {
              try {
                const meta = Reflect.getMetadata(bind_key, cls.prototype, key);
                if (meta) {
                  const { queue: queueName, exchange, routingKey, queueOptions } = meta;
                  const { queue } = await this.channel.assertQueue(queueName, queueOptions);
                  await this.channel.bindQueue(queue, exchange, routingKey);
                  if (typeof this[key] === "function") {
                    await this.channel.consume(queue, this[key].bind(this));
                  }
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
                  if (typeof this[key] === "function") {
                    await this.channel.consume(meta.queue, this[key].bind(this));
                  }
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

export function Bind({ exchange, queue, routingKey = "", queueOptions }: Params): MethodDecorator {
  return (target, key, descriptor) => {
    console.log({
      exchange,
      queue,
      routingKey,
      target,
      key,
      descriptor,
    });

    bindMap.add(key as string);

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

export function Consume({ queue }: ConsumeParams): MethodDecorator {
  return (target, prop, descriptor) => {
    consumeMap.add(prop as string);
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

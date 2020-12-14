import { Options } from "amqplib/properties";
import { format } from "util";
import { AbstractRMQService } from "../interfaces/abstract.rmq.interface";
import debug from "debug";

export const bind_key = Symbol("BIND_KEY");
export const consume_key = Symbol("CONSUME_KEY");
export const rmqEvent = "RMQ_CONNECT";

const logger = debug("@temabit/rmq");

export type DefinedPropertyDecorator<
  Name extends string | symbol = string | symbol,
  ValueType = any
> = <Target extends Object, Key extends keyof Target & Name>(
  target: Target,
  propertyKey: Key,
  descriptor: Target[Key] extends ValueType ? TypedPropertyDescriptor<Target[Key]> : never
) => PropertyDescriptor | void;

interface AssertExchange {
  exchangeType: "direct" | "topic" | "fanout" | "headers";
  exchangeOptions?: Options.AssertExchange;
}

interface BindParams {
  exchange: () => string;
  queue?: string;
  queueOptions?: Options.AssertQueue;
  routingKey?: string;
  assertExchange?: AssertExchange;
}
interface ConsumeParams {
  queue: () => string;
}

interface AbstractConstructor<Type = any> extends Function {
  prototype: Type;
}

export function persistMetadata<Target>(target: Target, metaKey: Symbol): Record<string, any> {
  let metadata = Reflect.getOwnMetadata(metaKey, target);
  if (!metadata) {
    const prototype = Object.getPrototypeOf(target);
    if (prototype !== null) {
      const prototypeMetadata = persistMetadata(prototype, metaKey);
      metadata = Object.create(prototypeMetadata);
    } else {
      metadata = Object.create(null);
    }
    Reflect.defineMetadata(metaKey, metadata, target);
  }
  return metadata;
}

interface Constructor<Type = any, Args extends any[] = any[]> extends AbstractConstructor {
  new (...args: Args): Type;
}

export function RabbitMQInstance() {
  return (cls: Constructor<AbstractRMQService>): any => {
    return class extends cls {
      constructor(...args: any[]) {
        super(...args);
        this.on(rmqEvent, async () => {
          const persisted = persistMetadata(cls.prototype, bind_key);
          for (const key in persisted) {
            try {
              const meta: BindParams | undefined = persisted[key];
              logger({ meta, key });
              let { queue: queueName, exchange, routingKey, queueOptions, assertExchange } = meta;

              if (assertExchange) {
                await this.channel.assertExchange(
                  exchange(),
                  assertExchange.exchangeType,
                  assertExchange.exchangeOptions
                );
              }

              const { queue } = await this.channel.assertQueue(queueName, queueOptions);
              await this.channel.bindQueue(queue, exchange(), routingKey);
              if (typeof this[key] === "function") {
                await this.channel.consume(queue, this[key].bind(this));
              }
            } catch (error) {
              logger(format("Bind Error", error));
            }
          }

          const consumePersisted = persistMetadata(cls.prototype, consume_key);
          for (const key in consumePersisted) {
            const meta: ConsumeParams | undefined = consumePersisted[key];
            try {
              if (typeof this[key] === "function") {
                await this.channel.consume(meta.queue(), this[key].bind(this));
              }
            } catch (error) {
              logger(format("Consume error", error));
            }
          }
        });
      }
    };
  };
}

export function Bind({
  queue = "",
  queueOptions,
  exchange,
  assertExchange,
  routingKey = "",
}: BindParams): DefinedPropertyDecorator<string, Function> {
  return (target, key, descriptor) => {
    const metadata = persistMetadata(target, bind_key) as Record<string, BindParams>;
    metadata[key as string] = {
      exchange,
      queue,
      routingKey,
      queueOptions,
      assertExchange,
    };
  };
}

export function Consume(params: ConsumeParams): DefinedPropertyDecorator<string, Function> {
  return (target, prop, descriptor) => {
    const metadata = persistMetadata(target, consume_key) as Record<string, ConsumeParams>;
    metadata[prop as string] = params;
  };
}

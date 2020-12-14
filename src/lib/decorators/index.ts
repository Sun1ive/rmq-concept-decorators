import { Options } from "amqplib/properties";
import { format } from "util";
import { AbstractRMQService } from "../interfaces/abstract.rmq.interface";
import debug from "debug";

export const bind_key = Symbol("BIND_KEY");
export const consume_key = Symbol("CONSUME_KEY");
export const assert_exchange_key = Symbol("ASSERT_EXCHANGE_KEY");
export const assert_queue_key = Symbol("ASSERT_QUEUE_KEY");
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

interface ExchangeOptions {
  exchangeType: "direct" | "topic" | "fanout" | "headers";
  exchangeOptions?: Options.AssertExchange;
}

interface AssertExchangeParams extends ExchangeOptions {
  exchange: string;
}

interface BindParams {
  exchange: string;
  queue?: string;
  queueOptions?: Options.AssertQueue;
  routingKey?: string;
  assertExchange?: ExchangeOptions;
}
interface ConsumeParams {
  queue: string;
  assertQueue?: Options.AssertQueue;
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
          const assertPersisted = persistMetadata(cls.prototype, assert_exchange_key);
          for (const key in assertPersisted) {
            const meta: undefined | (() => AssertExchangeParams) = assertPersisted[key];
            try {
              if (typeof meta === "function") {
                const { exchange, exchangeType, exchangeOptions } = meta();
                const assertedExchange = await this.channel.assertExchange(
                  exchange,
                  exchangeType,
                  exchangeOptions
                );
                (this as any)[key] = assertedExchange;
              }
            } catch (error) {
              logger(format("AssertExchange error", error));
            }
          }

          const assertQueuePersisted = persistMetadata(cls.prototype, assert_queue_key);
          for (const key in assertQueuePersisted) {
            const meta: undefined | (() => ConsumeParams) = assertQueuePersisted[key];
            try {
              if (typeof meta === "function") {
                const { queue, assertQueue } = meta();
                const assertedQueue = await this.channel.assertQueue(queue, assertQueue);
                (this as any)[key] = assertedQueue;
              }
            } catch (error) {
              logger(format("AssertQueue error", error));
            }
          }

          const persisted = persistMetadata(cls.prototype, bind_key);
          for (const key in persisted) {
            try {
              const meta: undefined | (() => BindParams) = persisted[key];
              if (typeof meta === "function") {
                logger({ meta: meta(), key });
                let {
                  queue = "",
                  exchange,
                  routingKey = "",
                  queueOptions,
                  assertExchange,
                } = meta();
                logger({ queue, routingKey });

                if (assertExchange) {
                  await this.channel.assertExchange(
                    exchange,
                    assertExchange.exchangeType,
                    assertExchange.exchangeOptions
                  );
                }

                const { queue: assertedQueue } = await this.channel.assertQueue(
                  queue,
                  queueOptions
                );

                await this.channel.bindQueue(queue, exchange, routingKey ?? "");
                if (typeof (this as any)[key] === "function") {
                  await this.channel.consume(assertedQueue, (this as any)[key].bind(this));
                }
              }
            } catch (error) {
              logger(format("Bind Error", error));
            }
          }

          const consumePersisted = persistMetadata(cls.prototype, consume_key);
          for (const key in consumePersisted) {
            const meta: undefined | (() => ConsumeParams) = consumePersisted[key];
            try {
              if (typeof meta === "function") {
                const { queue, assertQueue } = meta();
                if (assertQueue) {
                  await this.channel.assertQueue(queue, assertQueue);
                }
                if (typeof (this as any)[key] === "function") {
                  await this.channel.consume(queue, (this as any)[key].bind(this));
                }
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

export function Bind(params: () => BindParams): DefinedPropertyDecorator<string, Function> {
  return (target, key, descriptor) => {
    const metadata = persistMetadata(target, bind_key) as Record<string, () => BindParams>;
    metadata[key as string] = params;
  };
}

export function Consume(params: () => ConsumeParams): DefinedPropertyDecorator<string, Function> {
  return (target, prop, descriptor) => {
    const metadata = persistMetadata(target, consume_key) as Record<string, () => ConsumeParams>;
    metadata[prop as string] = params;
  };
}

export function AssertExchange(params: () => AssertExchangeParams): PropertyDecorator {
  return (target, key) => {
    const metadata = persistMetadata(target, assert_exchange_key) as Record<
      string,
      () => AssertExchangeParams
    >;

    metadata[key as string] = params;
  };
}

export function AssertQueue(params: () => ConsumeParams): PropertyDecorator {
  return (target, key) => {
    const metadata = persistMetadata(target, assert_queue_key);
    metadata[key as string] = params;
  };
}

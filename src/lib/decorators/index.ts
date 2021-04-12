import { Options } from "amqplib/properties";
import { AsyncLocalStorage } from "async_hooks";
import debug from "debug";
import { format } from "util";
import { v4 } from "uuid";
import type { AbstractRMQ } from "../abstract/abstract.rabbitmq";

export const bind_key = Symbol("BIND_KEY");
export const consume_key = Symbol("CONSUME_KEY");
export const assert_exchange_key = Symbol("ASSERT_EXCHANGE_KEY");
export const assert_queue_key = Symbol("ASSERT_QUEUE_KEY");
export const rmqEvent = "RMQ_CONNECT";

export const ALS_REQ_ID = "__id__";
export const ASL_REQ_PARAMS = "__req:params__";

const logger = debug("@temabit/rmq");

export const asyncStorage = new AsyncLocalStorage<Map<string, any>>();

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
  deleteBeforeAssert?: boolean;
}

interface AssertExchangeParams extends ExchangeOptions {
  exchange: string;
}

interface BindParams {
  exchange: string;
  queue?: string;
  queueOptions?: Options.AssertQueue;
  routingKeys?: string[];
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

/**
 *
 *
 * @export
 * @template Target
 * @template Instance
 * @returns
 */
export function RabbitMQInstance<
  Target extends Constructor<AbstractRMQ>,
  Instance extends InstanceType<Target>
>() {
  return (cls: Target): any => {
    return class extends cls {
      constructor(...args: any[]) {
        super(...args);
        this.eventEmitter.on(rmqEvent, async () => {
          const assertExchangePersisted = persistMetadata(cls.prototype, assert_exchange_key);
          for (const key in assertExchangePersisted) {
            const meta: undefined | ((instance: Instance) => AssertExchangeParams) =
              assertExchangePersisted[key];
            try {
              if (typeof meta === "function") {
                const { exchange, exchangeType, exchangeOptions, deleteBeforeAssert } = meta(
                  this as any
                );

                if (deleteBeforeAssert) {
                  await this.channel.deleteExchange(exchange);
                }

                const assertedExchange = await this.channel.assertExchange(
                  exchange,
                  exchangeType,
                  exchangeOptions
                );

                (this as any)[key] = assertedExchange;
              }
            } catch (error) {
              logger("AssertExchange error", error);
            }
          }

          const assertQueuePersisted = persistMetadata(cls.prototype, assert_queue_key);
          for (const key in assertQueuePersisted) {
            const meta: undefined | ((instance: Instance) => ConsumeParams) =
              assertQueuePersisted[key];
            try {
              if (typeof meta === "function") {
                const { queue, assertQueue } = meta(this as any);
                const assertedQueue = await this.channel.assertQueue(queue, assertQueue);
                (this as any)[key] = assertedQueue;
              }
            } catch (error) {
              logger("AssertQueue error", error);
            }
          }

          const persistedBind = persistMetadata(cls.prototype, bind_key);
          for (const key in persistedBind) {
            try {
              const meta: undefined | ((instance: Instance) => BindParams) = persistedBind[key];
              if (typeof meta === "function") {
                let {
                  queue = "",
                  exchange,
                  routingKeys = [""],
                  queueOptions,
                  assertExchange,
                } = meta(this as any);
                logger({ meta: meta(this as any), key });

                if (assertExchange) {
                  if (assertExchange.deleteBeforeAssert) {
                    await this.channel.deleteExchange(exchange);
                  }

                  await this.channel.assertExchange(
                    exchange,
                    assertExchange.exchangeType,
                    assertExchange.exchangeOptions
                  );
                }

                for (const rKey of routingKeys) {
                  const { queue: assertedQueue } = await this.channel.assertQueue(
                    queue,
                    queueOptions
                  );

                  await this.channel.bindQueue(assertedQueue, exchange, rKey);
                  if (typeof (this as any)[key] === "function") {
                    await this.channel.consume(assertedQueue, (this as any)[key].bind(this));
                  }
                }
              }
            } catch (error) {
              logger("Bind Error", error);
            }
          }

          const consumePersisted = persistMetadata(cls.prototype, consume_key);
          for (const key in consumePersisted) {
            const meta: undefined | ((instance: Instance) => ConsumeParams) = consumePersisted[key];
            try {
              if (typeof meta === "function") {
                const { queue, assertQueue } = meta(this as any);
                if (assertQueue) {
                  await this.channel.assertQueue(queue, assertQueue);
                }
                if (typeof (this as any)[key] === "function") {
                  await this.channel.consume(queue, (this as any)[key].bind(this));
                }
              }
            } catch (error) {
              logger("Consume error", error);
            }
          }
        });
      }
    };
  };
}

export type BindingDecorator<Target extends Object> = <Key extends string | symbol>(
  target: Target,
  key: Key,
  descriptor: Key extends keyof Target
    ? Target[Key] extends Function
      ? TypedPropertyDescriptor<Target[Key]>
      : unknown
    : unknown
) => PropertyDescriptor | void;

function overloadDescriptor(desc: PropertyDescriptor) {
  const originalFn = desc.value;

  if (typeof originalFn === "function") {
    const overloaded = async function (this: any, ...args: any[]) {
      const store = new Map();
      store.set(ALS_REQ_ID, v4());
      const params = Object.assign({}, args[0]);
      delete params.content;
      store.set(ASL_REQ_PARAMS, params);
      await asyncStorage.run(store, () => {
        return originalFn.apply(this, args);
      });
    };

    return {
      configurable: desc.configurable,
      enumerable: desc.enumerable,
      writable: desc.writable,
      value: overloaded,
    };
  }
}

export function Bind<InstanceType extends AbstractRMQ>(
  params: (instance: InstanceType) => BindParams
): BindingDecorator<InstanceType> {
  return (target, key, descriptor) => {
    const metadata = persistMetadata(target, bind_key) as Record<
      string,
      (instance: InstanceType) => BindParams
    >;

    metadata[key as string] = params;

    const overloadedDescriptor = overloadDescriptor(descriptor as PropertyDescriptor);
    if (overloadedDescriptor) {
      return overloadedDescriptor;
    }
  };
}

export function Consume<InstanceType extends AbstractRMQ>(
  params: (instance: InstanceType) => ConsumeParams
): BindingDecorator<InstanceType> {
  return (target, prop, descriptor) => {
    const metadata = persistMetadata(target, consume_key) as Record<
      string,
      (instance: InstanceType) => ConsumeParams
    >;
    metadata[prop as string] = params;
    const overloadedDescriptor = overloadDescriptor(descriptor as PropertyDescriptor);
    if (overloadedDescriptor) {
      return overloadedDescriptor;
    }
  };
}

export function AssertExchange<InstanceType extends AbstractRMQ>(
  params: (instance: InstanceType) => AssertExchangeParams
): PropertyDecorator {
  return (target, key) => {
    const metadata = persistMetadata(target, assert_exchange_key) as Record<
      string,
      (instance: InstanceType) => AssertExchangeParams
    >;

    metadata[key as string] = params;
  };
}

export function AssertQueue<InstanceType extends AbstractRMQ>(
  params: (instance: InstanceType) => ConsumeParams
): PropertyDecorator {
  return (target, key) => {
    const metadata = persistMetadata(target, assert_queue_key);
    metadata[key as string] = params;
  };
}

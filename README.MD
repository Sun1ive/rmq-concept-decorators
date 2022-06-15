### Package to simplify work with RabbitMQ based on typescript decorators.

> `npm i @temabit/rmq-concept-decorators`

## Before start:

First of all extends your class from `AbstractRMQ` class and decorate your class with `@RabbitMQInstance()` decorator.

```

@RabbitMQInstance()
class MyService extends AbstractRMQ {
  public constructor(
    public readonly config: IConfigService
    public readonly logger: ILoggerService,
  ) {
    super(config, logger)
  }
}

```

## Examples:

See `/examples/service/rabbitmq.service.ts`

## How to use:

### 1. AssertExchange

```

    @AssertExchange((instance: RabbiMQService) => {
    const { rabbitExchange } = instance._config.getConfig();

    return {
      exchange: `alt_${rabbitExchange}`,
      exchangeType: "topic",
      deleteBeforeAssert: true,
    };
  })
  public readonly _exchange: Replies.AssertExchange;

```

### 2. AssertQueue

```

  @AssertQueue((instance: RabbitMQService) => ({ queue: "test" }))
  public readonly _testQueue: Replies.AssertQueue;

```

### 3. Bind

```

 @Bind((instance: RabbitMQService) => ({
    exchange: 'exchangeName',
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

```

### 4. Consume

```

  @Consume(() => ({ queue: "test", assertQueue: { autoDelete: true } }))
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

```

---

## FAQ:

- If you need to react when your service connected to broken and ready to use there are events exposed:

```

READY_EVENT

CONNECT_EVENT

```

- RabbiMQInstance has EventEmitter property for that

### Example:

```
    this.eventEmitter.on(READY_EVENT, callback);
```

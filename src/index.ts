import express from "express";
import "reflect-metadata";
import cors from "cors";
import router from "./controllers";
import { Registry } from "prom-client";
import { Config } from "./lib/interfaces/config.service.interface";
import { RabbiMQService } from "./services/rabbitmq/rabbitmq.service";
import { collectDefaultMetrics } from "prom-client";
import { persistRegister, PROM_REGISTER } from "./decorators";

const config = {
  getConfig() {
    return {
      rabbitHeartbeat: 30,
      rabbitHost: process.env.RABBITMQ_HOST,
      rabbitPassword: process.env.RABBITMQ_PASSWORD,
      rabbitPort: +process.env.RABBITMQ_PORT!,
      rabbitUser: process.env.RABBITMQ_USER,
      rabbitVHost: process.env.RABBITMQ_VHOST,
      rabbitExchange: process.env.RABBITMQ_EXCHANGE,
    } as Config & { rabbitExchange: string };
  },
} as const;

export type ConfigType = typeof config;

async function start() {
  try {
    const app = express();

    const register = persistRegister();

    collectDefaultMetrics({ register });

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use("/", router);
    app.use("/metrics", register.metrics);

    const rmq = new RabbiMQService(config);

    const onCleanUp = async (sig: string) => {
      console.log("Process exit by %s", sig);
      process.off("SIGINT", onCleanUp);

      await rmq.dispose();
    };

    app.listen(4411, () => console.log("Server running at port 4411"));

    process.on("SIGINT", onCleanUp);
  } catch (error) {
    console.log(error);
  }
}
start();

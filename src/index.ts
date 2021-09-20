import dotenv from "dotenv";
import express from "express";
import "reflect-metadata";
import cors from "cors";
import router from "./controllers";
import { Config } from "./lib/interfaces/config.service.interface";
import { RabbitMQService } from "./example/services/rabbitmq.service";

const config = {
  getConfig() {
    return {
      rabbitHeartbeat: +process.env.RABBITMQ_HEARTBEAT!,
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
  dotenv.config();
  try {
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use("/", router);

    const rmq = new RabbitMQService(config);

    const http = app.listen(4411, () => console.log("Server running at port 4411"));

    const onCleanUp = async (sig: string) => {
      console.log("Process exit by %s", sig);
      process.off("SIGINT", onCleanUp);

      await rmq.dispose();
      http.close(console.error);
    };

    process.on("SIGINT", onCleanUp);
  } catch (error) {
    console.error(error);
  }
}
start();

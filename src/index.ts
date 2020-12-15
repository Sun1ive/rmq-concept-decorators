// require("dotenv").config();
import "reflect-metadata";
import { Config } from "./lib/interfaces/config.service.interface";
import { RabbiMQService } from "./services/rabbitmq/rabbitmq.service";

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
    const rmq = new RabbiMQService(config);

    const onCleanUp = async (sig: string) => {
      console.log("Process exit by %s", sig);
      process.off("SIGINT", onCleanUp);

      await rmq.dispose();
    };

    process.on("SIGINT", onCleanUp);
  } catch (error) {
    console.log(error);
  }
}
start();

// require("dotenv").config();
import "reflect-metadata";
import { RabbiMQService } from "./services/rabbitmq/rabbitmq.service";

async function start() {
  try {
    const config = {
      port: 3000,
    };
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

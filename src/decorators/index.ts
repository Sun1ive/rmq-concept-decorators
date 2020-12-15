import { Registry, Gauge } from "prom-client";
import debug from "debug";

const log = debug("@temabit/prom");

export const PROM_REGISTER = Symbol("REGISTER");

export function persistRegister(): Registry {
  let register = Reflect.getMetadata(PROM_REGISTER, globalThis) as Registry | undefined;
  if (!register) {
    log("Invoke create register");
    register = new Registry();
    Reflect.defineMetadata(PROM_REGISTER, register, globalThis);
  }

  return register;
}

export function GaugeMetrics(): MethodDecorator {
  return (target, key, descriptor) => {
    const register = persistRegister();
    const token = key.toString();
    const gauge = new Gauge({ name: token, help: token, registers: [register] });

    const original = descriptor.value;

    const newDescriptor: PropertyDescriptor = {
      value: function () {
        if (typeof original === "function") {
          const end = gauge.startTimer();
          const result = original.apply(this, arguments);
          end();
        }
      },
    };

    return newDescriptor;
  };
}

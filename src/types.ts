import { InstrumentationConfig } from "@opentelemetry/instrumentation";
import { PostgresInstrumentation as _PostgresInstrumentation } from "./instrumentation";

export type PostgresInstrumentationConfig = InstrumentationConfig;
export type PostgresInstrumentation = typeof _PostgresInstrumentation;

export type _Query = {
  prototype: any;
  handle: () => void;
};

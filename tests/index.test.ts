import test from "ava";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { context, trace } from "@opentelemetry/api";
import { randomInt } from "crypto";
import type * as postgresType from "postgres";
import PostgresInstrumentation from "../src";
import { registerInstrumentationTesting } from "@opentelemetry/contrib-test-utils";

const provider = new BasicTracerProvider();
const tracer = provider.getTracer("default");
const memoryExporter = new InMemorySpanExporter();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

let contextManager: AsyncHooksContextManager;
let connection: postgresType.Sql<{}>;
let instrumentation: PostgresInstrumentation;

test.beforeEach(() => {
  contextManager = new AsyncHooksContextManager();
  context.setGlobalContextManager(contextManager.enable());
  instrumentation = registerInstrumentationTesting(
    new PostgresInstrumentation() as any
  );
  instrumentation.setTracerProvider(provider);
  instrumentation.disable();
  instrumentation.enable();
  const postgres = require("postgres");
  connection = postgres({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: 5432,
    password: process.env.POSTGRES_PASS ?? "password",
    username: process.env.POSTGRES_USER ?? "postgres",
  });
});

test.afterEach(async () => {
  contextManager.disable();
  contextManager.enable();
  memoryExporter.reset();
  await connection.end();
});

test.before(() => {
  provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
});

test.after(async () => {
  context.disable();
  memoryExporter.reset();
  instrumentation.disable();
});

test("postgres > works for a single query", async (t) => {
  const toAdd = randomInt(10);
  const rootSpan = tracer.startSpan("test span");
  const result = await context.with(
    trace.setSpan(context.active(), rootSpan),
    async () => {
      const [result] = await connection`
    SELECT 1 + ${toAdd} as sum
    `;
      return result;
    }
  );
  rootSpan.end();

  t.is(result.sum, 1 + toAdd);

  const spans = memoryExporter.getFinishedSpans();
  const postgresSpans = spans
    .filter(
      (span) =>
        span.instrumentationLibrary.name ===
        PostgresInstrumentation.LIBRARY_NAME
    )
    .map((span) => ({ name: span.name, parentSpanId: span.parentSpanId }));
  
    t.is(postgresSpans.length, 4);
    t.truthy(
      postgresSpans.every(
        (span) => span.parentSpanId === rootSpan.spanContext().spanId
      )
    );
    t.truthy(
      postgresSpans.every(
        (span) => span.name === "postgres.handle"
      )
    );
});

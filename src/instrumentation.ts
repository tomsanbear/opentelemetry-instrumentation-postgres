import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from "@opentelemetry/instrumentation";
import * as postgres from "postgres";
import {
  DbSystemValues,
  SemanticAttributes,
} from "@opentelemetry/semantic-conventions";
import { PostgresInstrumentationConfig, _Query } from "./types";
import { context, trace, SpanKind } from "@opentelemetry/api";

export class PostgresInstrumentation extends InstrumentationBase<
  typeof postgres
> {
  static readonly LIBRARY_NAME = "opentelemetry-instrumentation-postgres";
  static readonly COMPONENT = "postgres";

  static readonly COMMON_ATTRIBUTES = {
    [SemanticAttributes.DB_SYSTEM]: DbSystemValues.POSTGRESQL,
  };

  constructor(config: PostgresInstrumentationConfig = {}) {
    super(PostgresInstrumentation.LIBRARY_NAME, "dev", config);
  }

  override setConfig(config: PostgresInstrumentationConfig = {}) {
    this._config = Object.assign({}, config);
  }

  override getConfig(): PostgresInstrumentationConfig {
    return this._config as PostgresInstrumentationConfig;
  }

  protected init():
    | void
    | InstrumentationModuleDefinition<unknown>
    | InstrumentationModuleDefinition<unknown>[] {
    const self = this;
    this._diag.info(`init ${PostgresInstrumentation.COMPONENT}`);
    const connection = new InstrumentationNodeModuleFile<any>(
      "postgres/cjs/src/connection.js",
      ["3.2.*"],
      (moduleExports, moduleVersion) => {
        console.log(moduleExports);
        this._diag.debug(
          `patching connection.js for ${PostgresInstrumentation.COMPONENT}@${moduleVersion}`
        );
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        this._diag.debug(
          `removing patch on connection.js for ${PostgresInstrumentation.COMPONENT}@${moduleVersion}`
        );
      }
    );
    const result = new InstrumentationNodeModuleFile<any>(
      "postgres/cjs/src/result.js",
      ["3.2.*"],
      (moduleExports, moduleVersion) => {
        console.log(moduleExports);
        this._diag.debug(
          `patching result.js for ${PostgresInstrumentation.COMPONENT}@${moduleVersion}`
        );
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        this._diag.debug(
          `removing patch on result.js for ${PostgresInstrumentation.COMPONENT}@${moduleVersion}`
        );
      }
    );
    const query = new InstrumentationNodeModuleFile<any>(
      "postgres/cjs/src/query.js",
      ["3.2.*"],
      (moduleExports, moduleVersion) => {
        this._diag.debug(
          `patching query.js for ${PostgresInstrumentation.COMPONENT}@${moduleVersion}`
        );
        this._wrap(
          (moduleExports.Query as _Query).prototype,
          "handle",
          // eslint-disable-next-line @typescript-eslint/ban-types
          (original: Function) => {
            return async function exec(this: any, ...args: unknown[]) {
              const parentSpan = trace.getSpan(context.active());
              if (parentSpan === undefined) {
                return await original.apply(this, args);
              }
              // TODO extract out useful information like operation, resource etc..., look at existing PG lib and try to get that
              const span = self.tracer.startSpan("postgres.handle", {
                kind: SpanKind.CLIENT,
                attributes: {
                  ...PostgresInstrumentation.COMMON_ATTRIBUTES,
                },
              });
              // Query is executed here
              const response = await original.apply(this, args);
              console.log({
                args: this.args,
                strings: this.strings,
                signature: this.signature,
              });
              span.end();
              return response;
            };
          }
        );
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        this._diag.debug(
          `removing patch on query.js for ${PostgresInstrumentation.COMPONENT}@${moduleVersion}`
        );
        this._unwrap(moduleExports.Query.prototype, "handle");
        return moduleExports;
      }
    );

    return [
      new InstrumentationNodeModuleDefinition<unknown>(
        PostgresInstrumentation.COMPONENT,
        ["3.2.*"],
        undefined,
        undefined,
        [query, connection, result]
      ),
    ];
  }
}

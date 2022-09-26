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
import { PostgresInstrumentationConfig } from "./types";
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
    | InstrumentationModuleDefinition<any>
    | InstrumentationModuleDefinition<any>[] {
    const self = this;
    this._diag.info(`init ${PostgresInstrumentation.COMPONENT}`);
    const query = new InstrumentationNodeModuleFile<any>(
      "postgres/cjs/src/query.js",
      ["*"],
      (moduleExports, moduleVersion) => {
        this._diag.debug(
          `patching query.js for ${PostgresInstrumentation.COMPONENT}@${moduleVersion}`
        );
        this._wrap(
          moduleExports.Query.prototype,
          "handle",
          (original: Function) => {
            return async function exec(this: any) {
              const parentSpan = trace.getSpan(context.active());
              if (parentSpan === undefined) {
                return await original.apply(this, arguments);
              }
              // TODO extract out useful information like operation, resource etc..., look at existing PG lib and try to get that
              const span = self.tracer.startSpan("postgres.handle", {
                kind: SpanKind.CLIENT,
                attributes: {
                  ...PostgresInstrumentation.COMMON_ATTRIBUTES,
                },
              });
              const response = await original.apply(this, arguments);
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
      new InstrumentationNodeModuleDefinition<any>(
        PostgresInstrumentation.COMPONENT,
        ["*"],
        (moduleExports, moduleVersion) => {
          return moduleExports;
        },
        undefined,
        [query]
      ),
    ];
  }
}

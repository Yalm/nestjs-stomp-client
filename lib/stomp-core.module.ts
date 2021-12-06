import {
  DynamicModule,
  Global,
  Module,
  OnApplicationShutdown,
  Provider,
} from "@nestjs/common";
import { DiscoveryModule, ModuleRef } from "@nestjs/core";
import { StompClient } from "./stomp.client";
import {
  StompModuleAsyncOptions,
  StompModuleOptions,
  StompModuleOptionsFactory,
} from "./stomp.interfaces";
import { createConnection } from "./stomp.utils";
import { EventSubscribersLoader } from "./event-subscribers.loader";
import { EventsMetadataAccessor } from "./events-metadata.accessor";
import { STOMP_MODULE_OPTIONS } from "./constants";

@Global()
@Module({ imports: [DiscoveryModule] })
export class StompCoreModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  static forRoot(options: StompModuleOptions): DynamicModule {
    const optionsProvider = {
      provide: STOMP_MODULE_OPTIONS,
      useValue: options,
    };

    const connectionProvider = {
      provide: StompClient,
      useValue: createConnection(options),
    };

    return {
      module: StompCoreModule,
      providers: [
        optionsProvider,
        connectionProvider,
        EventSubscribersLoader,
        EventsMetadataAccessor,
      ],
      exports: [optionsProvider, connectionProvider],
    };
  }

  async onApplicationShutdown() {
    const client = this.moduleRef.get(StompClient);
    client &&
      (await new Promise<StompClient>((resolve, reject) => {
        client.disconnect((error, client) => {
          if(error) {
            reject(error);
          }
          resolve(client);
        });
      }));
  }

  static forRootAsync(options: StompModuleAsyncOptions): DynamicModule {
    const connectionProvider: Provider = {
      provide: StompClient,
      useFactory(options: StompModuleOptions) {
        return createConnection(options);
      },
      inject: [STOMP_MODULE_OPTIONS],
    };

    return {
      module: StompCoreModule,
      imports: options.imports,
      providers: [
        ...this.createAsyncProviders(options),
        connectionProvider,
        EventSubscribersLoader,
        EventsMetadataAccessor,
      ],
      exports: [connectionProvider],
    };
  }

  private static createAsyncProviders(
    options: StompModuleAsyncOptions
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }

    return [
      this.createAsyncOptionsProvider(options),
      { provide: options.useClass, useClass: options.useClass },
    ];
  }

  private static createAsyncOptionsProvider(
    options: StompModuleAsyncOptions
  ): Provider {
    if (options.useFactory) {
      return {
        provide: STOMP_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }

    return {
      provide: STOMP_MODULE_OPTIONS,
      async useFactory(
        optionsFactory: StompModuleOptionsFactory
      ): Promise<StompModuleOptions> {
        return await optionsFactory.createStompOptions();
      },
      inject: [options.useClass || options.useExisting],
    };
  }
}

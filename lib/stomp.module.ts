import { DynamicModule, Module } from '@nestjs/common';
import { StompCoreModule } from './stomp-core.module';
import {
  StompModuleAsyncOptions, StompModuleOptions,
} from './stomp.interfaces';

@Module({})
export class StompModule {
  public static forRoot(options: StompModuleOptions): DynamicModule {
    return {
      module: StompModule,
      imports: [StompCoreModule.forRoot(options)],
      exports: [StompCoreModule],
    };
  }

  public static forRootAsync(options: StompModuleAsyncOptions): DynamicModule {
    return {
      module: StompModule,
      imports: [StompCoreModule.forRootAsync(options)],
      exports: [StompCoreModule]
    };
  }
}

import { ModuleMetadata, Type } from '@nestjs/common/interfaces';
import { StompClientOptions } from './stomp.client';

export type StompModuleOptions = StompClientOptions & {
  defaultHeaders?: Record<string, unknown>;
}

export interface StompModuleOptionsFactory {
  createStompOptions():
    | Promise<StompModuleOptions>
    | StompModuleOptions;
}

export interface StompModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  inject?: any[];
  useClass?: Type<StompModuleOptionsFactory>;
  useExisting?: Type<StompModuleOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<StompModuleOptions> | StompModuleOptions;
}

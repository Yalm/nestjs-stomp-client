import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import { InstanceWrapper } from "@nestjs/core/injector/instance-wrapper";
import { StompClient } from "./stomp.client";
import { STOMP_MODULE_OPTIONS } from "./constants";
import { OnEventMetadata } from "./decorators";
import { EventsMetadataAccessor } from "./events-metadata.accessor";
import { StompModuleOptions } from "./stomp.interfaces";
import { Subscription } from "./subscription";

@Injectable()
export class EventSubscribersLoader implements OnApplicationBootstrap {
  nextSubcriptionId = 1;

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly stompClient: StompClient,
    @Inject(STOMP_MODULE_OPTIONS) private readonly options: StompModuleOptions,
    private readonly metadataAccessor: EventsMetadataAccessor,
    private readonly metadataScanner: MetadataScanner
  ) {}

  onApplicationBootstrap() {
    this.loadEventListeners();
  }

  loadEventListeners() {
    const providers = this.discoveryService.getProviders();
    const controllers = this.discoveryService.getControllers();
    [...providers, ...controllers]
      .filter((wrapper) => wrapper.isDependencyTreeStatic())
      .filter((wrapper) => wrapper.instance)
      .forEach((wrapper: InstanceWrapper) => {
        const { instance } = wrapper;

        const prototype = Object.getPrototypeOf(instance);
        this.metadataScanner.scanFromPrototype(
          instance,
          prototype,
          (methodKey: string) =>
            this.subscribeToEventIfListener(instance, methodKey)
        );
      });
  }

  private subscribeToEventIfListener(
    instance: Record<string, any>,
    methodKey: string
  ) {
    const eventListenerMetadata: OnEventMetadata =
      this.metadataAccessor.getEventHandlerMetadata(instance[methodKey]);

    if (!eventListenerMetadata) {
      return;
    }
    const { event, options = {} } = eventListenerMetadata;

    Object.assign(options, this.options.defaultHeaders || {});

    options.id = options.id || this.nextSubcriptionId++;

    this.stompClient.subscribe(
      event,
      options,
      (body: string, headers: Record<string, unknown>) => {
        if (!body || typeof body !== "string") {
          return;
        }
        const rawMessage = JSON.parse(body);
        const subscription = new Subscription(
          options.id,
          event,
          headers,
          this.stompClient
        );
        return instance[methodKey].call(
          instance,
          ...[rawMessage, subscription]
        );
      }
    );
  }
}

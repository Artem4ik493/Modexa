import type { PlatformAdapter } from "./adapter.js";
import type { Platform } from "../types.js";

export class AdapterRegistry {
  private readonly adapters = new Map<
    string,
    PlatformAdapter
  >();

  register(
    adapter: PlatformAdapter
  ): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(
        `Adapter "${adapter.id}" is already registered`
      );
    }

    this.adapters.set(
      adapter.id,
      adapter
    );
  }

  unregister(
    adapterId: string
  ): boolean {
    return this.adapters.delete(adapterId);
  }

  get(
    adapterId: string
  ): PlatformAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  getByPlatform(
    platform: Platform
  ): PlatformAdapter[] {
    return [
      ...this.adapters.values()
    ].filter(
      (adapter) =>
        adapter.platform === platform
    );
  }

  list(): PlatformAdapter[] {
    return [
      ...this.adapters.values()
    ];
  }

  has(
    adapterId: string
  ): boolean {
    return this.adapters.has(adapterId);
  }

  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.start();
    }
  }

  async stopAll(): Promise<void> {
    const adapters = [
      ...this.adapters.values()
    ].reverse();

    for (const adapter of adapters) {
      await adapter.stop();
    }
  }
}
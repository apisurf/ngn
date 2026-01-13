import type { Plugin } from "./types.js";

export interface PluginManagerOptions {
  plugins: Plugin[];
}

/**
 * Manages plugin lifecycle and API aggregation
 */
export class PluginManager {
  private plugins: Plugin[];
  private initializedApis: Map<string, unknown> = new Map();
  private isInitialized = false;

  constructor(options: PluginManagerOptions) {
    this.plugins = options.plugins ?? [];
    this.validatePluginNames();
  }

  /**
   * Ensure no duplicate plugin names
   */
  private validatePluginNames(): void {
    const names = new Set<string>();
    for (const plugin of this.plugins) {
      if (names.has(plugin.name)) {
        throw new Error(`Duplicate plugin name: "${plugin.name}"`);
      }
      names.add(plugin.name);
    }
  }

  /**
   * Initialize all plugins and collect their APIs.
   * Called once during CLI startup.
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      throw new Error("PluginManager already initialized");
    }

    for (const plugin of this.plugins) {
      try {
        const api = await plugin.init();
        this.initializedApis.set(plugin.name, api);
      } catch (error) {
        // Cleanup any already-initialized plugins on failure
        await this.destroy();
        throw new Error(
          `Failed to initialize plugin "${plugin.name}": ${error}`
        );
      }
    }

    this.isInitialized = true;
  }

  /**
   * Destroy all plugins in reverse order.
   * Called during CLI shutdown.
   */
  async destroy(): Promise<void> {
    // Destroy in reverse order of initialization
    const reversedPlugins = [...this.plugins].reverse();

    for (const plugin of reversedPlugins) {
      try {
        await plugin.destroy();
      } catch (error) {
        console.error(`Error destroying plugin "${plugin.name}":`, error);
      }
    }

    this.initializedApis.clear();
    this.isInitialized = false;
  }

  /**
   * Get the aggregated plugins API object for injection into TaskContext
   */
  getPluginsApi(): Record<string, unknown> {
    if (!this.isInitialized) {
      throw new Error("PluginManager not initialized");
    }

    return Object.fromEntries(this.initializedApis);
  }

  /**
   * Check if manager has any plugins
   */
  hasPlugins(): boolean {
    return this.plugins.length > 0;
  }
}

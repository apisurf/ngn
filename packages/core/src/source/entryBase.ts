export abstract class EntryBase {
  abstract get path(): {
    source: string;
    compiled: string;
    relativeEntry: string;
    relativeParent: string;
  };
  abstract get codeHash(): string | null;
  abstract get code(): string | null;
  abstract load(): Promise<string | undefined>;
  abstract isLoaded(): boolean;
}

export interface InjectionToken<T> { readonly key: symbol }

export const token = <T>(description: string): InjectionToken<T> =>
  ({ key: Symbol(description) });

interface FactoryOptions { dispose?: (value: unknown) => Promise<void> | void }

export class Container {
  private singletons = new Map<symbol, unknown>();
  private disposers: (() => Promise<void> | void)[] = [];

  async resolve<T>(
    t: InjectionToken<T>,
    factory: () => Promise<T> | T,
    opts: FactoryOptions = {},
  ): Promise<T> {
    const existing = this.singletons.get(t.key);
    if (existing) return existing as T;

    const creation = Promise.resolve().then(factory)
      .then(v => {
        this.singletons.set(t.key, v);
        if (opts.dispose) this.disposers.push(() => opts.dispose!(v));
        return v;
      })
      .catch(e => { this.singletons.delete(t.key); throw e; });

    this.singletons.set(t.key, creation);
    return creation;
  }

  async disposeAll() {
    await Promise.allSettled(this.disposers.map(fn => fn()));
    this.singletons.clear();
    this.disposers = [];
  }

  /** Creates a scope that falls back to parent on cache miss */
  createScope(): Container {
    const child = new Container();
    child.singletons = new Map(this.singletons); // shadow
    return child;
  }
}

export const container = new Container();

export interface InjectionToken<T> {
    readonly key: symbol;
    readonly __TYPE__?: T; // Phantom type for better type inference (optional but good)
}

export const token = <T>(description: string): InjectionToken<T> => ({
    key: Symbol(description),
});

interface FactoryOptions<T = any> {
    /**
     * Optional dispose function to be called when the container's `disposeAll` is invoked.
     * The function receives the resolved instance.
     */
    dispose?: (value: T) => Promise<void> | void;
}

type RegisteredFactory<T = any> = () => T | Promise<T>;

interface Registration<T = any> {
    factory: RegisteredFactory<T>;
    options?: FactoryOptions<T>;
    isSingleton: boolean; // For Lambda, mostly true
}

export class Container {
    // Stores the definition of how to create an instance
    private registrations = new Map<symbol, Registration<any>>();
    // Stores the actual resolved instances (or promises to them for concurrency)
    private resolvedInstances = new Map<symbol, Promise<any>>();
    private disposers: Array<{ instancePromise: Promise<any>; disposeFn: (value: any) => Promise<void> | void }> = [];

    /**
     * Registers a factory function for a given token.
     * @param t The injection token.
     * @param factory The function that creates the instance.
     * @param options Options, including a potential dispose function.
     *                By default, registered dependencies are singletons.
     */
    public register<T>(
        t: InjectionToken<T>,
        factory: () => T | Promise<T>,
        options?: FactoryOptions<T>,
    ): void {
        if (this.registrations.has(t.key)) {
            console.warn(`DI Container: Token ${String(t.key.description)} already registered. Overwriting.`);
        }
        this.registrations.set(t.key, { factory, options, isSingleton: true });
        // Clear any potentially resolved instance if re-registering
        this.resolvedInstances.delete(t.key);
    }

    /**
     * Registers an already existing value for a given token.
     * @param t The injection token.
     * @param value The pre-existing instance.
     * @param options Options, including a potential dispose function.
     */
    public registerValue<T>(
        t: InjectionToken<T>,
        value: T,
        options?: FactoryOptions<T>,
    ): void {
        if (this.registrations.has(t.key)) {
            console.warn(`DI Container: Token ${String(t.key.description)} already registered. Overwriting.`);
        }
        // Internally, treat it like a factory that immediately returns the value
        this.registrations.set(t.key, {
            factory: () => value,
            options,
            isSingleton: true,
        });
        // Eagerly cache the promise to this value
        const instancePromise = Promise.resolve(value);
        this.resolvedInstances.set(t.key, instancePromise);

        if (options?.dispose) {
            this.disposers.push({ instancePromise, disposeFn: options.dispose });
        }
    }


    /**
     * Resolves a dependency for the given token.
     * @param t The injection token.
     * @returns A promise that resolves to the instance.
     */
    public async resolve<T>(t: InjectionToken<T>): Promise<T> {
        // 1. Check if a promise for this instance already exists (either resolved or in-flight)
        if (this.resolvedInstances.has(t.key)) {
            return this.resolvedInstances.get(t.key)! as Promise<T>;
        }

        // 2. Get the registration
        const registration = this.registrations.get(t.key);
        if (!registration) {
            throw new Error(`DI Container: No registration found for token "${String(t.key.description)}".`);
        }

        // 3. Create and cache the promise for the new instance
        const { factory, options, isSingleton } = registration;

        // Create the promise for the instance.
        // This ensures the factory is only called once even with concurrent resolves.
        const instancePromise: Promise<T> = Promise.resolve()
            .then(() => factory()) // Execute the factory
            .then(value => {
                // If it's a singleton and we've cached the promise, we don't need to set it again here.
                // The initial promise stored in resolvedInstances will resolve to this value.
                // However, if we wanted to replace the promise with the value (as in the original):
                // if (isSingleton) this.resolvedInstances.set(t.key, Promise.resolve(value));
                return value;
            })
            .catch(error => {
                // If factory fails, remove the promise from cache so subsequent attempts can retry.
                if (isSingleton) {
                    this.resolvedInstances.delete(t.key);
                }
                // Also remove any pending disposer associated with this failed attempt
                this.disposers = this.disposers.filter(d => d.instancePromise !== instancePromise);
                throw error; // Re-throw the error
            });

        // 4. If it's a singleton, cache the promise. Subsequent calls will get this same promise.
        if (isSingleton) {
            this.resolvedInstances.set(t.key, instancePromise);
            if (options?.dispose) {
                // Store the promise and the dispose function together.
                // The dispose function will be called with the resolved value of this promise.
                this.disposers.push({ instancePromise, disposeFn: options.dispose as (value: any) => Promise<void> | void });
            }
        }
        
        return instancePromise;
    }

    /**
     * Disposes all registered singleton instances that have a dispose function.
     */
    public async disposeAll(): Promise<void> {
        const currentDisposers = [...this.disposers]; // Work on a copy in case of re-entrancy (unlikely here)
        this.disposers = []; // Clear original list

        const disposePromises = currentDisposers.map(async ({ instancePromise, disposeFn }) => {
            try {
                const instance = await instancePromise; // Wait for the instance to be resolved
                return Promise.resolve().then(() => disposeFn(instance)); // Then call dispose
            } catch (error) {
                // If instancePromise itself rejected (factory failed), its disposer shouldn't run or might error.
                // Or, if disposeFn throws.
                console.error(`DI Container: Error during dispose for an instance related to token (description might be lost):`, error);
                return Promise.reject(error); // Propagate as a settled promise error
            }
        });

        const results = await Promise.allSettled(disposePromises);
        results.forEach(result => {
            if (result.status === 'rejected') {
                console.error('DI Container: A dispose function failed:', result.reason);
            }
        });

        this.resolvedInstances.clear();
        // Optionally clear registrations if the container is meant to be completely reset
        // this.registrations.clear();
    }

    /**
     * Creates a scoped container. For Lambda, this is less common.
     * This implementation is a simplified one:
     * - Child inherits resolved instances (promises or values) from parent at creation.
     * - Child manages its own new registrations and resolved instances.
     * - Disposing parent does NOT dispose items resolved *only* in child.
     * - Disposing child does NOT dispose items from parent.
     * - If child resolves something already resolved in parent, it gets parent's instance.
     */
    public createScope(): Container {
        const child = new Container();
        // Child starts with a "snapshot" of parent's resolved instances.
        // If parent had promises, child gets those promises.
        // If parent had resolved values (via registerValue or resolved factory), child gets resolved promises.
        child.resolvedInstances = new Map(this.resolvedInstances);
        
        // Child also needs access to parent's registrations to resolve things not yet resolved by parent.
        // This creates a "fallback" mechanism.
        // A more robust scoping would involve a parent pointer and lookup chain.
        // For simplicity here, we copy registrations. If parent registers new things post-scope creation,
        // child won't see them.
        child.registrations = new Map(this.registrations);
        
        // Child manages its own disposers for items it uniquely resolves and registers a disposer for.
        // Hierarchical disposal is complex; this model keeps it simple.
        return child;
    }
}

// Global container instance - typical for Lambda
export const container = new Container();

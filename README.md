# `bmz_1/lambdi`

Ultra‑light **dependency‑injection container** for AWS Lambda — zero cold‑start tax, zero runtime dependencies.

> **λ + DI = lambdi** – pronounced “lam‑dee”.

---

## Why lambdi?

| Pain point                                             | lambdi’s fix                                                   | Cost                   |
| ------------------------------------------------------ | -------------------------------------------------------------- | ---------------------- |
| Heavy AWS clients re‑initialised every warm invocation | Process‑wide **singleton container** caches them automatically | < 1 µs per `resolve()` |
| DI frameworks add 400 KB to bundle                     | `lambdi` dual build is **< 8 KB gzipped**                      | No cold‑start hit      |
| Key‑string collisions between libraries                | **Typed tokens** (unique `symbol`s) stop clashes               | Compile‑time safety    |
| Resource leaks in tests                                | Optional **`disposeAll()`** cleans up                          | Single loop call       |
| Hard‑to‑mock singletons                                | `createScope()` spins fresh child containers                   | Zero extra deps        |

---

## Features

* 🐑 **Singleton DI container** that survives warm Lambda invocations
* 🔑 **Type‑safe tokens** prevent collisions & give IntelliSense
* ⚡ **Promise deduplication** – async factories run once even under high concurrency
* 🧹 **Disposal hooks & scoped containers** for clean tests and per‑request objects
* 🪶 **Tiny bundle** – < 8 KB gzipped, no runtime deps

---

## Installation

```bash
npm install bmz_1/lambdi
```

> Node 20+ is required (matches current AWS Lambda runtimes).

---

## Quick start

```ts
import { container, token } from 'bmz_1/lambdi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// create a typed token once – no string collisions
const DDB = token<DynamoDBClient>('ddb');

export const handler = async () => {
  // heavy client built once per execution environment
  const ddb = await container.resolve(DDB, () => new DynamoDBClient({ region: 'us-east-1' }));

  /* … use ddb … */
  return { ok: true };
};
```

---

## API

| Item                                       | Description                                      |
| ------------------------------------------ | ------------------------------------------------ |
| `container`                                | Process‑wide singleton `Container` instance      |
| `token<T>(description)`                    | Create an `InjectionToken<T>` (unique `symbol`)  |
| `container.resolve(token, factory, opts?)` | Lazily build or retrieve a singleton; async‑safe |
| `container.createScope()`                  | Child container inheriting parent singletons     |
| `container.disposeAll()`                   | Run disposers, clear cache (useful in tests)     |
| `FactoryOptions.dispose(value)`            | Optional disposer registered per singleton       |

---

## Example: Scoped per‑request objects

```ts
import { container, token } from 'bmz_1/lambdi';
import { v4 as uuid } from 'uuid';

const REQUEST_ID = token<string>('request‑id');

export const handler = async (event) => {
  const scope = container.createScope();
  await scope.resolve(REQUEST_ID, () => uuid());

  return doWork(event, scope);
};

async function doWork(event, scope) {
  const reqId = await scope.resolve(REQUEST_ID, () => 'should‑never‑happen');
  console.log('request', reqId, event.body);
}
```

---

## Testing pattern

```ts
import { beforeEach, afterEach, it, expect } from 'vitest';
import { Container, token } from 'bmz_1/lambdi';

const DUMMY = token<number>('dummy');
let c: Container;

beforeEach(() => {
  c = new Container();
});

afterEach(async () => {
  await c.disposeAll();
});

it('returns same instance', async () => {
  const value = await c.resolve(DUMMY, () => 42);
  const again = await c.resolve(DUMMY, () => 0);
  expect(again).toBe(value);
});
```

---

## License

MIT © 2025 BMZ Software Engineering

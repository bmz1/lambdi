# `@bmz_1/lambdi`

![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)

Ultra‑light **dependency‑injection container** and **environment variable loader/validator** for AWS Lambda — zero cold‑start tax, zero runtime dependencies.

> **λ + DI = lambdi** – pronounced “lam‑dee”.

---

## Packages

- **`container`**: Ultra-light, type-safe dependency injection for AWS Lambda (and beyond)
- **`loadenv`**: Fast, type-safe environment variable validation using [Zod Mini](https://github.com/colinhacks/zod-mini)

---

## Table of Contents

- [Bundle sizes](#-bundle-sizes-esm-only)
- [ESM-only exports](#-esm-only-exports)
- [Why lambdi?](#why-lambdi)
- [Features](#features)
- [Installation](#installation)
- [Quick start: Dependency Injection (`container`)](#quick-start)
- [Environment variable validation (`loadenv`)](#environment-variable-validation-loadenv)
- [API](#api)
- [Example: Scoped per-request objects](#example-scoped-per-request-objects)
- [Testing pattern](#testing-pattern)
- [License](#license)

---

## 📦 Bundle sizes (ESM only)

```
Build complete: dist/index.{mjs}, dist/container.js, dist/loadenv.js
  • dist/index.mjs:    17.3 KB
  • dist/container.js: 598 B
  • dist/loadenv.js:   16.8 KB
```

---

## 📦 ESM-only exports

All entrypoints are ESM, with subpath exports for each module:

```json
"exports": {
  ".": "./dist/index.mjs",
  "./di": "./dist/container.js",
  "./loadenv": "./dist/loadenv.js"
}
```

**Import examples:**

```js
// Main entry (everything)
import { container, token, loadenv, envSchema } from '@bmz_1/lambdi';

// Dependency Injection only
import { container, token } from '@bmz_1/lambdi/di';

// Environment helpers only
import { loadenv, envSchema } from '@bmz_1/lambdi/loadenv';
```

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
npm install @bmz_1/lambdi
```

> Node 20+ is required (matches current AWS Lambda runtimes).

---

## Quick start: Dependency Injection (`container`)

```ts
import { container, token } from '@bmz_1/lambdi';
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

## Quick start: Environment variable validation (`loadenv`)

Validate and type-check your environment variables at startup using Zod Mini schemas.

- Throws if any required variable is missing or invalid.
- Returns a fully typed, validated object.
- Works with both main and subpath imports.

**Usage:**

```ts
import { loadenv, envSchema } from '@bmz_1/lambdi';
// or: import { loadenv, envSchema } from '@bmz_1/lambdi/loadenv';
import * as z from '@zod/mini';

const schema = envSchema({
  DATABASE_URL: z.string(),
  PORT: z.string().optional(),
  DEBUG: z.boolean().optional(),
});

const env = loadenv(schema);
// env.DATABASE_URL is string
// env.PORT is string | undefined
// env.DEBUG is boolean | undefined

console.log('Database URL:', env.DATABASE_URL);
```

You can also pass a custom source object (e.g., for tests):

```ts
const env = loadenv(schema, { DATABASE_URL: 'sqlite://:memory:' });
```

---

## API

### Dependency Injection (`container`)

| Item                                       | Description                                      |
| ------------------------------------------ | ------------------------------------------------ |
| `container`                                | Process‑wide singleton `Container` instance      |
| `token<T>(description)`                    | Create an `InjectionToken<T>` (unique `symbol`)  |
| `container.resolve(token, factory, opts?)` | Lazily build or retrieve a singleton; async‑safe |
| `container.createScope()`                  | Child container inheriting parent singletons     |
| `container.disposeAll()`                   | Run disposers, clear cache (useful in tests)     |
| `FactoryOptions.dispose(value)`            | Optional disposer registered per singleton       |

### Environment Variable Loader (`loadenv`)

| Item                      | Description                                                   |
|---------------------------|---------------------------------------------------------------|
| `loadenv(schema, [src])`  | Validate and load env vars from `process.env` or custom src   |
| `envSchema(defs)`         | Build a Zod Mini schema for your environment variables         |

---

## Example: Scoped per‑request objects

```ts
import { container, token } from '@bmz_1/lambdi';
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
import { Container, token } from '@bmz_1/lambdi';

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

MIT © 2025 BMZ

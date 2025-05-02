// tests/container.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { container as globalContainer, token, Container } from '../src/container.js';

describe('DI Container – happy path & edge‑cases', () => {
  let c: Container;

  beforeEach(() => {
    // fresh container per test to avoid bleed‑over
    c = new Container();
  });

  afterEach(async () => {
    await c.disposeAll();
  });

  // ------------------------------------------------------------------------ //
  it('returns the same instance on subsequent resolve() calls (sync factory)', async () => {
    const NUMBER = token<number>('number');
    const factory = vi.fn(() => 123);

    const a = await c.resolve(NUMBER, factory);
    const b = await c.resolve(NUMBER, factory);

    expect(a).toBe(123);
    expect(b).toBe(a);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------------ //
  it('deduplicates concurrent async factories (race‑condition guard)', async () => {
    const KEY = token<string>('concurrent');
    const factory = vi.fn(
      async () => {
        await new Promise(r => setTimeout(r, 10));  // simulate slow init
        return 'ready';
      },
    );

    const [v1, v2, v3] = await Promise.all([
      c.resolve(KEY, factory),
      c.resolve(KEY, factory),
      c.resolve(KEY, factory),
    ]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(v1).toBe('ready');
    expect(v1).toBe(v2);
    expect(v2).toBe(v3);
  });

  // ------------------------------------------------------------------------ //
  it('does NOT cache a rejected factory; next call retries', async () => {
    const FAIL = token<number>('fails‑once');
    let attempt = 0;
    const factory = vi.fn(() => {
      if (++attempt === 1) throw new Error('boom');
      return 42;
    });

    await expect(c.resolve(FAIL, factory)).rejects.toThrow('boom');
    const val = await c.resolve(FAIL, factory);

    expect(val).toBe(42);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  // ------------------------------------------------------------------------ //
  it('runs custom disposers via disposeAll()', async () => {
    type Conn = { closed: boolean };
    const PG = token<Conn>('pg');
    const conn: Conn = { closed: false };
    const dispose = vi.fn(() => { conn.closed = true; });

    await c.resolve(PG, () => conn, { dispose });
    await c.disposeAll();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(conn.closed).toBe(true);
  });

  // ------------------------------------------------------------------------ //
  it('child scope inherits parent singletons but keeps its own additions', async () => {
    const SHARED = token<number>('shared');
    const CHILD_ONLY = token<string>('child‑only');

    await c.resolve(SHARED, () => 7);

    const child = c.createScope();

    // shared value comes from parent
    expect(await child.resolve(SHARED, () => 0)).toBe(7);

    // new value exists only in child
    await child.resolve(CHILD_ONLY, () => 'hi');
    const fromParent = await c.resolve(CHILD_ONLY, () => 'parent‑default');

    expect(fromParent).toBe('parent‑default');
  });

  // ------------------------------------------------------------------------ //
  it('tokens generated with the same description are still unique', () => {
    const A = token<number>('dup‑descr');
    const B = token<number>('dup‑descr');

    expect(A.key).not.toBe(B.key);
  });

  // ------------------------------------------------------------------------ //
  it('global container keeps singletons between warm Lambda invocations (simulated)', async () => {
    const COUNTER = token<{ n: number }>('counter');

    // first "cold start"
    const first = await globalContainer.resolve(COUNTER, () => ({ n: 1 }));
    first.n++;

    // simulate warm start: same globalContainer instance
    const second = await globalContainer.resolve(COUNTER, () => ({ n: 0 }));

    expect(second.n).toBe(2);  // mutation survived
    expect(first).toBe(second);
  });
});

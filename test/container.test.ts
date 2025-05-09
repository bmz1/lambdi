// tests/container.test.ts
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

    c.register(NUMBER, factory);
    const a = await c.resolve(NUMBER);
    const b = await c.resolve(NUMBER);

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

    c.register(KEY, factory);
    const [v1, v2, v3] = await Promise.all([
      c.resolve(KEY),
      c.resolve(KEY),
      c.resolve(KEY),
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

    c.register(FAIL, factory);
    await expect(c.resolve(FAIL)).rejects.toThrow('boom');
    const val = await c.resolve(FAIL);

    expect(val).toBe(42);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  // ------------------------------------------------------------------------ //
  it('runs custom disposers via disposeAll()', async () => {
    type Conn = { closed: boolean };
    const PG = token<Conn>('pg');
    const conn: Conn = { closed: false };
    const dispose = vi.fn(() => { conn.closed = true; });

    c.register(PG, () => conn, { dispose });
    await c.resolve(PG);
    await c.disposeAll();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(conn.closed).toBe(true);
  });

  // ------------------------------------------------------------------------ //
  it('child scope inherits parent singletons but keeps its own additions', async () => {
    const SHARED = token<number>('shared');
    const CHILD_ONLY = token<string>('child‑only');

    c.register(SHARED, () => 7);
    await c.resolve(SHARED);

    const child = c.createScope();

    // shared value comes from parent
    expect(await child.resolve(SHARED)).toBe(7);

    // new value exists only in child
    child.register(CHILD_ONLY, () => 'hi');
    await child.resolve(CHILD_ONLY);
    
    // parent doesn't have child's registration
    c.register(CHILD_ONLY, () => 'parent‑default');
    const fromParent = await c.resolve(CHILD_ONLY);

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
    globalContainer.register(COUNTER, () => ({ n: 1 }));
    const first = await globalContainer.resolve(COUNTER);
    first.n++;

    // simulate warm start: same globalContainer instance
    const second = await globalContainer.resolve(COUNTER);

    expect(second.n).toBe(2);  // mutation survived
    expect(first).toBe(second);
  });
  
  // ------------------------------------------------------------------------ //
  it('can register a value directly', async () => {
    const VALUE = token<string>('direct-value');
    const myString = 'hello world';
    
    c.registerValue(VALUE, myString);
    const retrieved = await c.resolve(VALUE);
    
    expect(retrieved).toBe(myString);
  });
  
  // ------------------------------------------------------------------------ //
  it('shows warning when registering a token that already exists', async () => {
    const DUPLICATE = token<number>('duplicate');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    c.register(DUPLICATE, () => 1);
    c.register(DUPLICATE, () => 2); // Should trigger warning
    
    const value = await c.resolve(DUPLICATE);
    expect(value).toBe(2); // Should use the latest registration
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate'));
    
    consoleSpy.mockRestore();
  });
});

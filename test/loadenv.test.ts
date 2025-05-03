import { describe, it, expect } from 'vitest';
import * as z from '@zod/mini';
import { loadenv, envSchema } from '../src/loadenv';


const schema = envSchema({
  FOO: z.string(),
  BAR: z.string(),
});

describe('loadenv', () => {
  it('validates a correct environment object', () => {
    const env = { FOO: 'foo', BAR: 'bar' };
    const result = loadenv(schema, env);
    expect(result).toEqual(env);
  });
  
  it('throws if a required variable is missing', () => {
    const env = { FOO: 'foo' };
    expect(() => loadenv(schema, env)).toThrow();
  });

  it('throws if a variable is of the wrong type', () => {
    const env = { FOO: 'foo', BAR: 123 };
    expect(() => loadenv(schema, env)).toThrow();
  });

  it('uses process.env by default', () => {
    process.env.FOO = 'foo';
    process.env.BAR = 'bar';
    const result = loadenv(schema);
    expect(result).toEqual({ FOO: 'foo', BAR: 'bar' });
  });
});

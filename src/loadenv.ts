import * as z from '@zod/mini';

/**
 * Helper to create a zod mini schema for environment variables.
 * Usage: const schema = envSchema({ FOO: z.string() })
 */
export const envSchema = z.object;

/**
 * Validates process.env using the provided zod mini schema.
 * @param schema - zod mini schema for environment variables
 * @param envSource - (optional) source object, defaults to process.env (for testability)
 * @returns validated env object
 * @throws if validation fails
 */
export function loadenv<T extends z.ZodMiniType<any, any>>(
  schema: T,
  envSource?: Record<string, unknown>
): z.infer<T> {
  // Avoid top-level process.env access (tree-shakeable)
  const env = envSource ?? process.env;
  return schema.parse(env);
}

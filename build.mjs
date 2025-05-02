// build.mjs –  Node‑side ESM script run via:  node build.mjs
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));

// Don’t bundle AWS SDK v3 or any peer deps; they stay external
const external = [
  '@aws-sdk/*',
  'aws-sdk',
  ...Object.keys(pkg.peerDependencies ?? {}),
];

const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: false,          // flip to true locally if you need stack traces
  platform: 'node',
  target: 'node22',
  external,
};

await Promise.all([
  build({ ...shared, format: 'esm', outfile: 'dist/index.mjs' }),
  build({ ...shared, format: 'cjs', outfile: 'dist/index.cjs' }),
]);

console.log('✅  Build complete: dist/index.{mjs,cjs}');

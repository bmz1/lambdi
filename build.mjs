// build.mjs –  Node‑side ESM script run via:  node build.mjs
import { build } from 'esbuild';
import { readFile, stat } from 'node:fs/promises';

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
  build({ entryPoints: ['src/container.ts'], bundle: true, minify: true, format: 'esm', platform: 'node', target: 'node22', outfile: 'dist/container.js', sourcemap: false, external }),
  build({ entryPoints: ['src/loadenv.ts'], bundle: true, minify: true, format: 'esm', platform: 'node', target: 'node22', outfile: 'dist/loadenv.js', sourcemap: false, external }),
]);

const [esmStat, diStat, loadenvStat] = await Promise.all([
  stat('dist/index.mjs'),
  stat('dist/container.js'),
  stat('dist/loadenv.js'),
]);

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

console.log(`✅  Build complete: dist/index.{mjs,cjs}, dist/container.js, dist/loadenv.js`);
console.log(`  • dist/index.mjs:    ${formatSize(esmStat.size)}`);
console.log(`  • dist/container.js: ${formatSize(diStat.size)}`);
console.log(`  • dist/loadenv.js:   ${formatSize(loadenvStat.size)}`);

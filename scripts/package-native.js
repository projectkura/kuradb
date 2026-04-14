const { cpSync, rmSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const releaseModules = join(root, 'release', 'node_modules');
const srcModules = join(root, 'node_modules');

// pg-native and its full runtime dependency tree
const packages = [
  'pg-native',
  'libpq',
  'bindings',
  'file-uri-to-path',
  'pg-types',
  'pg-int8',
  'postgres-array',
  'postgres-bytea',
  'postgres-date',
  'postgres-interval',
];

rmSync(join(root, 'release'), { recursive: true, force: true });
mkdirSync(releaseModules, { recursive: true });

let copied = 0;

for (const pkg of packages) {
  const src = join(srcModules, pkg);
  const dest = join(releaseModules, pkg);

  if (!existsSync(src)) {
    console.warn(`  skip: ${pkg} (not found)`);
    continue;
  }

  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const rel = source.slice(src.length);
      if (rel.includes('.github')) return false;
      if (rel.includes('test') && !rel.includes('node_modules')) return false;
      return true;
    },
  });
  copied++;
  console.log(`  copy: ${pkg}`);
}

// Copy build artifacts into release
cpSync(join(root, 'dist'), join(root, 'release', 'dist'), { recursive: true });
cpSync(join(root, 'fxmanifest.lua'), join(root, 'release', 'fxmanifest.lua'));

console.log(`\nRelease packaged with ${copied} native modules.`);
console.log('Output: release/');

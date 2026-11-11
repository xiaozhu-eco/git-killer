import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['test/integration/suite/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'dist-test/suite.cjs',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
});

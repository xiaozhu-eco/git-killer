import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

if (!watch) {
  rmSync('dist', { recursive: true, force: true });
}

/** @type {esbuild.BuildOptions} */
const shared = {
  bundle: true,
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  minify: production,
};

const extensionContext = await esbuild.context({
  ...shared,
  entryPoints: { extension: 'src/extension.ts' },
  outdir: 'dist',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
});

const webContext = await esbuild.context({
  ...shared,
  entryPoints: {
    webview: 'webview/src/main.tsx',
    sidebar: 'webview/src/sidebar-entry.tsx',
  },
  outdir: 'dist',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  loader: { '.css': 'css' },
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"',
  },
});

if (watch) {
  await Promise.all([extensionContext.watch(), webContext.watch()]);
  console.log('[git-killer] watching for changes...');
} else {
  await Promise.all([extensionContext.rebuild(), webContext.rebuild()]);
  await Promise.all([extensionContext.dispose(), webContext.dispose()]);
}

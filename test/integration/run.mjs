import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

const executableCandidates = [
  process.env.VSCODE_EXECUTABLE,
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
  '/usr/share/code/code',
  'C:\\Program Files\\Microsoft VS Code\\Code.exe',
].filter(Boolean);

const vscodeExecutablePath = executableCandidates.find(candidate => fs.existsSync(candidate));

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test User',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'git-killer-fixture-'));
git(fixture, ['init', '-b', 'main']);
git(fixture, ['config', 'commit.gpgsign', 'false']);
fs.writeFileSync(path.join(fixture, 'a.txt'), 'one\ntwo\nthree\n');
fs.writeFileSync(path.join(fixture, 'README.md'), '# fixture\n');
git(fixture, ['add', '.']);
git(fixture, ['commit', '-m', 'first commit']);
fs.writeFileSync(path.join(fixture, 'a.txt'), 'one\nTwo\nthree\nfour\n');
git(fixture, ['commit', '-am', 'second commit']);
git(fixture, ['switch', '-c', 'feature']);
fs.writeFileSync(path.join(fixture, 'feature.txt'), 'feature\n');
git(fixture, ['add', '.']);
git(fixture, ['commit', '-m', 'feature commit']);
git(fixture, ['switch', 'main']);
fs.writeFileSync(path.join(fixture, 'main.txt'), 'main\n');
git(fixture, ['add', '.']);
git(fixture, ['commit', '-m', 'main commit']);
git(fixture, ['merge', '--no-ff', 'feature', '-m', 'merge feature']);

const sha = git(fixture, ['rev-parse', 'HEAD']);
console.log(`fixture: ${fixture} @ ${sha}`);

const extensionTestsPath = path.resolve('dist-test/suite.cjs');

try {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: path.resolve('.'),
    extensionTestsPath,
    launchArgs: [
      fixture,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--new-window',
    ],
    extensionTestsEnv: {
      GK_FIXTURE: fixture,
      GK_SHA: sha,
    },
  });
  console.log('integration tests passed');
} catch (error) {
  console.error('integration tests failed');
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

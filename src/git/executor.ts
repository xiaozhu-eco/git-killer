import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

export interface GitRunOptions {
    cwd: string;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
    input?: string;
    readOnly?: boolean;
}

export class GitError extends Error {
    constructor(
        message: string,
        readonly args: string[],
        readonly code: number | null,
        readonly stderr: string
    ) {
        super(message);
        this.name = 'GitError';
    }
}

const MAX_OUTPUT = 128 * 1024 * 1024;

export function gitExecutable(): string {
    const configured = vscode.workspace.getConfiguration('gitKiller').get<string>('gitPath');
    return configured && configured.trim().length > 0 ? configured.trim() : 'git';
}

export function runGit(args: string[], options: GitRunOptions): Promise<string> {
    const fullArgs = [
        ...(options.readOnly ? ['--no-optional-locks'] : []),
        '-c',
        'core.quotepath=false',
        ...args,
    ];

    if (options.signal?.aborted) {
        return Promise.reject(new Error('Operation cancelled'));
    }

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        GIT_PAGER: 'cat',
        PAGER: 'cat',
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_ASKPASS: 'echo',
        LC_ALL: 'C',
        ...options.env,
    };

    return new Promise<string>((resolve, reject) => {
        const child = spawn(gitExecutable(), fullArgs, {
            cwd: options.cwd,
            env,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let stdoutSize = 0;
        let settled = false;

        const finish = (fn: () => void) => {
            if (settled) {
                return;
            }
            settled = true;
            options.signal?.removeEventListener('abort', onAbort);
            fn();
        };

        const onAbort = () => {
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 500).unref?.();
            finish(() => reject(new Error('Operation cancelled')));
        };

        options.signal?.addEventListener('abort', onAbort, { once: true });

        child.stdout.on('data', (chunk: Buffer) => {
            stdoutSize += chunk.length;
            if (stdoutSize > MAX_OUTPUT) {
                child.kill('SIGKILL');
                finish(() => reject(new GitError('Git output exceeded the maximum buffer size', fullArgs, null, '')));
                return;
            }
            stdout.push(chunk);
        });

        child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

        child.on('error', error => {
            finish(() => reject(new GitError(`Failed to run git: ${error.message}`, fullArgs, null, '')));
        });

        child.on('close', code => {
            const out = Buffer.concat(stdout).toString('utf8');
            const err = Buffer.concat(stderr).toString('utf8').trim();
            if (code === 0) {
                finish(() => resolve(out));
                return;
            }
            const firstLine = err.split('\n').find(line => line.trim().length > 0) ?? `git exited with code ${code}`;
            finish(() => reject(new GitError(firstLine, fullArgs, code, err)));
        });

        if (options.input !== undefined) {
            child.stdin.end(options.input);
        } else {
            child.stdin.end();
        }
    });
}

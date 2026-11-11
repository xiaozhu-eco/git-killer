import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GitContentProvider } from './contentProvider';
import type { GitRepository } from './git/repository';

function label(ref: string): string {
    if (ref === 'EMPTY') {
        return 'empty';
    }
    if (ref === 'WORKTREE') {
        return 'working tree';
    }
    return ref.slice(0, 8);
}

export async function openFileDiff(
    repo: GitRepository,
    provider: GitContentProvider,
    from: string,
    to: string,
    relPath: string
): Promise<void> {
    const absolute = path.join(repo.root, relPath);
    const left =
        from === 'EMPTY' ? provider.emptyUri(absolute, repo.root) : provider.uriFor(absolute, repo.root, from);
    const right =
        to === 'WORKTREE'
            ? vscode.Uri.file(absolute)
            : to === 'EMPTY'
                ? provider.emptyUri(absolute, repo.root)
                : provider.uriFor(absolute, repo.root, to);

    const title = `${path.basename(relPath)} (${label(from)} ↔ ${label(to)})`;
    await vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true });
}

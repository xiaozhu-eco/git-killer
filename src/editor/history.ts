import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GitContentProvider } from '../contentProvider';
import { openFileDiff } from '../diff';
import type { LogEntry } from '../git/parsers';
import type { RepositoryManager } from '../git/repositoryManager';
import { relativeTime, withProgress } from '../output';

interface HistoryPick extends vscode.QuickPickItem {
    entry: LogEntry;
}

export async function showFileHistory(
    manager: RepositoryManager,
    provider: GitContentProvider,
    uri?: vscode.Uri
): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target || target.scheme !== 'file') {
        void vscode.window.showInformationMessage('Open a file inside a Git repository first.');
        return;
    }

    const repo = await manager.resolveRepo(target);
    if (!repo) {
        void vscode.window.showInformationMessage('This file is not inside a Git repository.');
        return;
    }

    const relative = path.relative(repo.root, target.fsPath).split(path.sep).join('/');
    const entries = await withProgress(`Loading history of ${path.basename(relative)}`, () =>
        repo.fileLog(relative)
    );
    if (entries.length === 0) {
        void vscode.window.showInformationMessage(`No history found for ${relative}.`);
        return;
    }

    const picked = await vscode.window.showQuickPick<HistoryPick>(
        entries.map(entry => ({
            label: entry.subject || entry.sha.slice(0, 8),
            description: `${entry.sha.slice(0, 7)} · ${entry.author} · ${relativeTime(entry.time)}`,
            entry,
        })),
        {
            placeHolder: `History of ${relative} (${entries.length} commits)`,
            matchOnDescription: true,
        }
    );
    if (!picked) {
        return;
    }

    const details = await repo.commitDetails(picked.entry.sha);
    await openFileDiff(repo, provider, details.parents[0] ?? 'EMPTY', picked.entry.sha, relative);
}

export async function showLineHistory(
    manager: RepositoryManager,
    provider: GitContentProvider,
    editor?: vscode.TextEditor
): Promise<void> {
    const active = editor ?? vscode.window.activeTextEditor;
    if (!active || active.document.uri.scheme !== 'file') {
        void vscode.window.showInformationMessage('Open a file inside a Git repository first.');
        return;
    }

    const repo = await manager.resolveRepo(active.document.uri);
    if (!repo) {
        void vscode.window.showInformationMessage('This file is not inside a Git repository.');
        return;
    }

    const relative = path.relative(repo.root, active.document.uri.fsPath).split(path.sep).join('/');
    const line = active.selection.active.line + 1;
    const entries = await withProgress(`Loading history of ${path.basename(relative)}:${line}`, () =>
        repo.lineLog(relative, line)
    );
    if (entries.length === 0) {
        void vscode.window.showInformationMessage(`No line history found for ${relative}:${line}.`);
        return;
    }

    const picked = await vscode.window.showQuickPick<HistoryPick>(
        entries.map(entry => ({
            label: entry.subject || entry.sha.slice(0, 8),
            description: `${entry.sha.slice(0, 7)} · ${entry.author} · ${relativeTime(entry.time)}`,
            entry,
        })),
        {
            placeHolder: `History of ${relative}:${line}`,
            matchOnDescription: true,
        }
    );
    if (!picked) {
        return;
    }

    const details = await repo.commitDetails(picked.entry.sha);
    await openFileDiff(repo, provider, details.parents[0] ?? 'EMPTY', picked.entry.sha, relative);
}

import * as vscode from 'vscode';

export const output = vscode.window.createOutputChannel('Git Killer');

export function showGitError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[error] ${message}`);
    void vscode.window.showErrorMessage(message, 'Show Output').then(choice => {
        if (choice === 'Show Output') {
            output.show(true);
        }
    });
}

export function logCommand(args: string[]): void {
    output.appendLine(`$ git ${args.map(arg => (arg.includes(' ') ? JSON.stringify(arg) : arg)).join(' ')}`);
}

export async function confirmDestructive(title: string, detail: string): Promise<boolean> {
    const enabled = vscode.workspace.getConfiguration('gitKiller').get<boolean>('confirmDestructive', true);
    if (!enabled) {
        return true;
    }
    const choice = await vscode.window.showWarningMessage(title, { modal: true, detail }, 'Yes');
    return choice === 'Yes';
}

export async function withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title, cancellable: false },
        task
    );
}

export function formatDate(seconds: number): string {
    if (!seconds) {
        return '';
    }
    return new Date(seconds * 1000).toLocaleString();
}

export function relativeTime(seconds: number): string {
    if (!seconds) {
        return '';
    }
    const now = Date.now();
    const diff = Math.round((seconds * 1000 - now) / 1000);
    const abs = Math.abs(diff);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (abs < 60) {
        return formatter.format(diff, 'second');
    }
    if (abs < 3600) {
        return formatter.format(Math.round(diff / 60), 'minute');
    }
    if (abs < 86400) {
        return formatter.format(Math.round(diff / 3600), 'hour');
    }
    if (abs < 86400 * 30) {
        return formatter.format(Math.round(diff / 86400), 'day');
    }
    if (abs < 86400 * 365) {
        return formatter.format(Math.round(diff / (86400 * 30)), 'month');
    }
    return formatter.format(Math.round(diff / (86400 * 365)), 'year');
}

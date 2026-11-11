import * as path from 'node:path';
import * as vscode from 'vscode';
import type { RepositoryManager } from './git/repositoryManager';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
    static readonly scheme = 'git-killer';

    private readonly cache = new Map<string, string>();

    constructor(private readonly manager: RepositoryManager) { }

    uriFor(absPath: string, root: string, ref: string): vscode.Uri {
        const query = new URLSearchParams({ ref, root }).toString();
        return vscode.Uri.file(absPath).with({ scheme: GitContentProvider.scheme, query });
    }

    emptyUri(absPath: string, root: string): vscode.Uri {
        return this.uriFor(absPath, root, 'EMPTY');
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const params = new URLSearchParams(uri.query);
        const ref = params.get('ref') ?? '';
        const root = params.get('root') ?? '';
        if (ref === 'EMPTY') {
            return '';
        }
        const repo = this.manager.getByRoot(root);
        if (!repo) {
            return '';
        }
        const relative = path.relative(repo.root, uri.path).split(path.sep).join('/');
        const key = uri.toString();
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const content = await repo.show(ref, relative);
            const result = content.includes('\u0000')
                ? `Binary file not shown (${ref.slice(0, 8)}:${relative})`
                : content;
            if (this.cache.size > 400) {
                this.cache.clear();
            }
            this.cache.set(key, result);
            return result;
        } catch {
            return '';
        }
    }

    invalidate(): void {
        this.cache.clear();
    }
}

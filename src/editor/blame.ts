import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BlameLine } from '../git/parsers';
import type { GitRepository } from '../git/repository';
import type { RepositoryManager } from '../git/repositoryManager';
import { formatDate, relativeTime } from '../output';

const CACHE_LIMIT = 30;

export class BlameController implements vscode.Disposable {
    private readonly decoration = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 2em',
            color: new vscode.ThemeColor('editorCodeLens.foreground'),
            fontStyle: 'italic',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    private readonly statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    private readonly disposables: vscode.Disposable[] = [];
    private readonly cache = new Map<string, { version: number; head: string; lines: BlameLine[] }>();
    private timer?: NodeJS.Timeout;
    private decoratedEditor?: vscode.TextEditor;
    private enabled: boolean;
    private hoverEnabled: boolean;
    private statusBarEnabled: boolean;

    constructor(private readonly manager: RepositoryManager) {
        this.enabled = this.readConfig('enabled', true);
        this.hoverEnabled = this.readConfig('hover', true);
        this.statusBarEnabled = this.readConfig('statusBar', true);
        this.statusBar.command = 'gitKiller.openCommit';
        this.statusBar.name = 'Git Killer Blame';

        this.disposables.push(
            this.decoration,
            this.statusBar,
            vscode.window.onDidChangeActiveTextEditor(() => this.schedule()),
            vscode.window.onDidChangeTextEditorSelection(event => {
                if (event.textEditor === vscode.window.activeTextEditor) {
                    this.schedule();
                }
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document === vscode.window.activeTextEditor?.document) {
                    this.schedule();
                }
            }),
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('gitKiller.blame')) {
                    this.applyConfiguration();
                }
            }),
            vscode.languages.registerHoverProvider(
                { scheme: 'file' },
                { provideHover: (document, position) => this.provideHover(document, position) }
            )
        );

        this.schedule();
    }

    private readConfig<T>(key: string, fallback: T): T {
        return vscode.workspace.getConfiguration('gitKiller').get<T>(`blame.${key}`, fallback);
    }

    private applyConfiguration(): void {
        this.enabled = this.readConfig('enabled', true);
        this.hoverEnabled = this.readConfig('hover', true);
        this.statusBarEnabled = this.readConfig('statusBar', true);
        this.schedule();
    }

    async toggle(): Promise<void> {
        const next = !this.enabled;
        const configuration = vscode.workspace.getConfiguration('gitKiller');
        const target =
            configuration.inspect<boolean>('blame.enabled')?.workspaceValue !== undefined
                ? vscode.ConfigurationTarget.Workspace
                : vscode.ConfigurationTarget.Global;
        await configuration.update('blame.enabled', next, target);
        this.applyConfiguration();
        if (!next) {
            this.clear();
        }
    }

    private schedule(): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.update();
        }, 120);
    }

    private clear(): void {
        if (this.decoratedEditor) {
            this.decoratedEditor.setDecorations(this.decoration, []);
            this.decoratedEditor = undefined;
        }
        this.statusBar.hide();
    }

    private async update(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file' || !this.enabled) {
            this.clear();
            return;
        }

        const document = editor.document;
        const repo = await this.manager.resolveRepo(document.uri);
        if (!repo) {
            this.clear();
            return;
        }

        const version = document.version;
        const line = editor.selection.active.line;
        let lines: BlameLine[];
        try {
            lines = await this.getBlame(repo, document, version);
        } catch {
            this.clear();
            return;
        }

        const active = vscode.window.activeTextEditor;
        if (!active || active.document !== document || active.document.version !== version) {
            return;
        }

        const info = lines.find(entry => entry.line === line + 1);
        if (!info) {
            this.clear();
            return;
        }

        if (this.decoratedEditor && this.decoratedEditor !== editor) {
            this.decoratedEditor.setDecorations(this.decoration, []);
        }
        this.decoratedEditor = editor;

        const textLine = document.lineAt(line);
        const text = `  ${info.author}, ${relativeTime(info.authorTime)} · ${truncate(info.summary, 100)}`;
        editor.setDecorations(this.decoration, [
            {
                range: new vscode.Range(line, 0, line, textLine.text.length),
                renderOptions: { after: { contentText: text } },
                hoverMessage: this.buildHover(info, repo.root),
            },
        ]);

        if (this.statusBarEnabled) {
            this.statusBar.text = `$(git-commit) ${info.author} · ${info.sha.slice(0, 7)}`;
            this.statusBar.tooltip = new vscode.MarkdownString(
                `**${escapeMarkdown(info.summary)}**\n\n${escapeMarkdown(info.author)} · ${formatDate(info.authorTime)}\n\n\`${info.sha}\``
            );
            this.statusBar.command = {
                command: 'gitKiller.openCommit',
                title: 'Open Commit',
                arguments: [info.sha, repo.root],
            };
            this.statusBar.show();
        } else {
            this.statusBar.hide();
        }
    }

    private async getBlame(
        repo: GitRepository,
        document: vscode.TextDocument,
        version: number
    ): Promise<BlameLine[]> {
        const head = await repo.head();
        const headSha = head.sha ?? 'HEAD';
        const key = `${repo.root}\u0000${document.uri.fsPath}`;
        const cached = this.cache.get(key);
        if (cached && cached.version === version && cached.head === headSha) {
            return cached.lines;
        }

        const relative = path.relative(repo.root, document.uri.fsPath).split(path.sep).join('/');
        const lines = await repo.blame(relative, 'HEAD');
        if (this.cache.size > CACHE_LIMIT) {
            this.cache.clear();
        }
        this.cache.set(key, { version, head: headSha, lines });
        return lines;
    }

    private async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        if (!this.hoverEnabled || !this.readConfig('enabled', true)) {
            return undefined;
        }
        const repo = await this.manager.resolveRepo(document.uri);
        if (!repo) {
            return undefined;
        }
        let lines: BlameLine[];
        try {
            lines = await this.getBlame(repo, document, document.version);
        } catch {
            return undefined;
        }
        const info = lines.find(entry => entry.line === position.line + 1);
        if (!info) {
            return undefined;
        }
        return new vscode.Hover(this.buildHover(info, repo.root));
    }

    private buildHover(info: BlameLine, root?: string): vscode.MarkdownString {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.supportThemeIcons = true;
        markdown.appendMarkdown(`**${escapeMarkdown(info.summary)}**\n\n`);
        markdown.appendMarkdown(`${escapeMarkdown(info.author)} · ${formatDate(info.authorTime)}\n\n`);
        markdown.appendMarkdown(`\`${info.sha.slice(0, 12)}\`\n\n`);
        const args = encodeURIComponent(JSON.stringify(root ? [info.sha, root] : [info.sha]));
        markdown.appendMarkdown(
            `[$(git-commit) Open in graph](command:gitKiller.openCommit?${args}) · [$(history) File history](command:gitKiller.fileHistory)`
        );
        return markdown;
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.clear();
        this.disposables.forEach(disposable => disposable.dispose());
        this.cache.clear();
    }
}

function truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_{}[\]()#+\-.!|>]/g, match => `\\${match}`);
}

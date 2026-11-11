import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function run(): Promise<void> {
    const extension = vscode.extensions.getExtension('geocat.git-killer');
    assert.ok(extension, 'Git Killer extension should be installed');
    await extension.activate();

    const expectedCommands = [
        'gitKiller.showGraph',
        'gitKiller.switchBranch',
        'gitKiller.compareRefs',
        'gitKiller.toggleBlame',
        'gitKiller.fileHistory',
        'gitKiller.lineHistory',
    ];
    const commands = await vscode.commands.getCommands(true);
    for (const command of expectedCommands) {
        assert.ok(commands.includes(command), `command ${command} should be registered`);
    }

    const fixture = process.env.GK_FIXTURE;
    const sha = process.env.GK_SHA;
    assert.ok(fixture, 'GK_FIXTURE env var is required');
    assert.ok(sha, 'GK_SHA env var is required');

    // Give the repository manager a moment to discover the workspace repository.
    await delay(1500);

    const fileUri = vscode.Uri.file(path.join(fixture, 'a.txt')).with({
        scheme: 'git-killer',
        query: new URLSearchParams({ ref: sha, root: fixture }).toString(),
    });
    const document = await vscode.workspace.openTextDocument(fileUri);
    assert.ok(document.getText().includes('three'), 'content provider should return the file at HEAD');

    await vscode.commands.executeCommand('gitKiller.showGraph', fixture);
    await delay(1500);

    const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
    const graphTab = tabs.find(tab => {
        const input = tab.input as { viewType?: string } | undefined;
        return input?.viewType?.endsWith('gitKiller.graph') === true;
    });
    assert.ok(graphTab, 'commit graph tab should be opened');

    await vscode.commands.executeCommand('gitKiller.refresh');
    await delay(300);

    await vscode.window.tabGroups.close(graphTab);
}

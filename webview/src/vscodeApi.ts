import type { WebviewToHost } from '../../src/protocol';

interface VsCodeApi {
    postMessage(message: unknown): void;
    getState<T>(): T | undefined;
    setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode = acquireVsCodeApi();

export function post(message: WebviewToHost): void {
    vscode.postMessage(message);
}

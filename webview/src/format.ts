export function relativeTime(seconds: number): string {
    if (!seconds) {
        return '';
    }
    const diff = Math.round((seconds * 1000 - Date.now()) / 1000);
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

export function formatDate(seconds: number): string {
    return seconds ? new Date(seconds * 1000).toLocaleString() : '';
}

export function shortSha(sha: string): string {
    return sha.slice(0, 7);
}

export function basename(filePath: string): string {
    const index = filePath.lastIndexOf('/');
    return index === -1 ? filePath : filePath.slice(index + 1);
}

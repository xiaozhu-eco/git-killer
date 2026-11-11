import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
} as const;

export function IconRepo(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M2.2 4.3h4.1L7.6 5.9H14v6.6H2.2z" />
            <path d="M2.2 4.3v8.2" />
        </svg>
    );
}

export function IconBranch(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <circle cx="5" cy="3.2" r="1.4" />
            <circle cx="5" cy="12.8" r="1.4" />
            <circle cx="11" cy="5.2" r="1.4" />
            <path d="M5 4.6v6.8" />
            <path d="M5 8h3.4A2.6 2.6 0 0 0 11 5.4" />
        </svg>
    );
}

export function IconGraph(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <circle cx="4" cy="12" r="1.3" />
            <circle cx="4" cy="4" r="1.3" />
            <circle cx="12" cy="8" r="1.3" />
            <path d="M4 5.4v5.2" />
            <path d="M5.3 11.1c3.8 0 5.4-.8 5.4-2.1" />
        </svg>
    );
}

export function IconRefresh(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M13 8a5 5 0 1 1-1.6-3.7" />
            <path d="M13 3.3V6h-2.7" />
        </svg>
    );
}

export function IconChevron(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
    );
}

export function IconCheck(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M3 8.4 6.3 11.7 13 5" />
        </svg>
    );
}

export function IconWarning(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M8 2.4 14 13H2L8 2.4Z" />
            <path d="M8 6.1v3.4" />
            <path d="M8 11.7h.01" />
        </svg>
    );
}

export function IconFetch(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M4.9 11.8h6.2a2.3 2.3 0 0 0 .3-4.6 3 3 0 0 0-5.8-.8 2.4 2.4 0 0 0-.7 5.4Z" />
        </svg>
    );
}

export function IconPull(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M8 2.5v6.7" />
            <path d="M5.8 7.1 8 9.3l2.2-2.2" />
            <path d="M3 13h10" />
        </svg>
    );
}

export function IconPush(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M8 10.6V3.9" />
            <path d="M5.8 6.1 8 3.9l2.2 2.2" />
            <path d="M3 13h10" />
        </svg>
    );
}

export function IconStash(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <rect x="2.4" y="3" width="11.2" height="3" rx="0.9" />
            <path d="M3.5 6v6.6h9V6" />
            <path d="M6.4 9h3.2" />
        </svg>
    );
}

export function IconPop(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <rect x="2.4" y="3" width="11.2" height="3" rx="0.9" />
            <path d="M3.5 6v6.6h9V6" />
            <path d="M8 11.6V7.4" />
            <path d="M6.6 8.8 8 7.4l1.4 1.4" />
        </svg>
    );
}
export function IconSearch(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <circle cx="7" cy="7" r="4.1" />
            <path d="M10.2 10.2 14 14" />
        </svg>
    );
}

export function IconClose(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M3.6 3.6 12.4 12.4" />
            <path d="M12.4 3.6 3.6 12.4" />
        </svg>
    );
}

export function IconPanel(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <rect x="2.3" y="3" width="11.4" height="10" rx="1.1" />
            <path d="M10.1 3v10" />
        </svg>
    );
}

export function IconCloud(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M4.9 11.8h6.2a2.3 2.3 0 0 0 .3-4.6 3 3 0 0 0-5.8-.8 2.4 2.4 0 0 0-.7 5.4Z" />
        </svg>
    );
}

export function IconCommit(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 2.5v3.2M8 10.3v3.2" />
        </svg>
    );
}

export function IconCopy(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <rect x="5" y="5" width="7.6" height="8" rx="1" />
            <path d="M10.6 5V3.5h-7v8H5" />
        </svg>
    );
}

export function IconDiff(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M3 3v10M13 3v10" />
            <path d="M5.5 8h5" />
            <path d="M8 5.5 10.5 8 8 10.5" />
        </svg>
    );
}

export function IconTag(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M2.6 3h5.3l5.5 5.5-5.2 5.2L2.6 8.3z" />
            <circle cx="5.6" cy="5.6" r="0.9" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function IconUndo(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M5.4 5.6h4.2a3.4 3.4 0 0 1 0 6.8H6.2" />
            <path d="M7.6 3.4 5.4 5.6l2.2 2.2" />
        </svg>
    );
}

export function IconCheckout(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M2.5 8h8" />
            <path d="M8 5.5 10.5 8 8 10.5" />
            <path d="M13 3.5v9" />
        </svg>
    );
}

export function IconMerge(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <circle cx="4.5" cy="3.5" r="1.4" />
            <circle cx="4.5" cy="12.5" r="1.4" />
            <circle cx="11.5" cy="12.5" r="1.4" />
            <path d="M4.5 5v6" />
            <path d="M5.9 4.4h2.4a3.2 3.2 0 0 1 3.2 3.2v3.4" />
        </svg>
    );
}

export function IconRebase(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <circle cx="4.5" cy="3.8" r="1.4" />
            <circle cx="11.5" cy="12.2" r="1.4" />
            <path d="M4.5 5.2v1.9a3.2 3.2 0 0 0 3.2 3.2h1.5" />
            <path d="M7.8 8.6 10 10.3 7.8 12" />
        </svg>
    );
}

export function IconArrowRight(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M2.5 8h10" />
            <path d="M9.5 5 12.5 8 9.5 11" />
        </svg>
    );
}
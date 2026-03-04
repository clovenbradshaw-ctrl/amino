/** Formatting utilities */

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || singular + 's');
}

export function timeAgo(date: Date | string | number): string {
  const now = Date.now();
  const then = typeof date === 'number' ? date : new Date(date).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as unknown as T;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function classNames(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(' ');
}

export function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    if (!groups[k]) groups[k] = [];
    groups[k].push(item);
  }
  return groups;
}

export function sortBy<T>(items: T[], key: (item: T) => any, direction: 'asc' | 'desc' = 'asc'): T[] {
  const sorted = [...items].sort((a, b) => {
    const va = key(a);
    const vb = key(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb);
    }
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  });
  return direction === 'desc' ? sorted.reverse() : sorted;
}

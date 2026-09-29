export function normalizeTaskIdentityTitle(title: string): string {
  let value = title.trim().toLowerCase();
  const colon = value.match(/^(.{2,40}?)[：:]\s*(.+)$/);
  if (colon && /[、，,；;]/.test(colon[2])) value = colon[1];
  const paren = value.match(/^(.{2,40}?)[（(](.+)[）)]$/);
  if (paren && /[、，,；;]/.test(paren[2])) value = paren[1];

  return value
    .replace(/发送给/g, '发给')
    .replace(/发送/g, '发')
    .replace(/看看|看一下|查看一下/g, '看')
    .replace(/想好/g, '想')
    .replace(/对应的/g, '对应')
    .replace(/[\s\-—_，。；：、,.!?！？（）()【】\[\]{}“”"'·]/g, '');
}

function bigramDice(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  if (a === b) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const counts = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i += 1) {
    const key = left[i] + left[i + 1];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const key = right[i] + right[i + 1];
    const count = counts.get(key) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(key, count - 1);
    }
  }

  return (2 * overlap) / ((left.length - 1) + (right.length - 1));
}

export function taskTitlesEquivalent(a: string, b: string): boolean {
  const left = normalizeTaskIdentityTitle(a);
  const right = normalizeTaskIdentityTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 5 && longer.includes(shorter) && shorter.length / longer.length >= 0.76) {
    return true;
  }

  return bigramDice(left, right) >= 0.84;
}

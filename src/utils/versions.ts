function parseVersion(version: string) {
  const normalized = version.split(/[^\d.]/)[0] ?? '';
  const parts = normalized.split('.').map((value) => Number.parseInt(value, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

export function isMinimumVersion(actualVersion: string, minimumVersion: string) {
  const actual = parseVersion(actualVersion);
  const minimum = parseVersion(minimumVersion);

  for (let index = 0; index < minimum.length; index += 1) {
    const actualPart = actual[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;

    if (actualPart > minimumPart) return true;
    if (actualPart < minimumPart) return false;
  }

  return true;
}

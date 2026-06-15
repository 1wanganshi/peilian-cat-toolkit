export function buildApiUrl(baseUrl: string, path: string): string {
  const cleanBase = baseUrl.trim().replace(/\/+$/u, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

export function buildOpenAiCompatibleBaseUrls(baseUrl: string): string[] {
  const cleanBase = baseUrl.trim().replace(/\/+$/u, '');
  if (!cleanBase) return [];

  const urls = [cleanBase];
  if (!/\/v\d+(?:\/)?$/u.test(cleanBase)) {
    urls.push(`${cleanBase}/v1`);
  }

  return Array.from(new Set(urls));
}

const USER_AGENT = 'uae-job-radar/0.1 (personal job alerts)';

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string, detail = '') {
    super(`HTTP ${status} from ${url.split('?')[0]}${detail ? `: ${detail}` : ''}`);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches JSON with a timeout, retrying network errors and 5xx responses twice. A 429 waits as
 * long as the server asks (up to 30 seconds) and tries once more; any other 4xx is the caller's
 * problem, such as a wrong slug, and fails at once.
 */
export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let lastError: unknown;
  let wait = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(wait || 1000 * 2 ** attempt);
    wait = 0;
    try {
      const response = await fetch(url, {
        ...init,
        headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...init.headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return (await response.json()) as T;
      // Services often say why in the body, such as "You are not subscribed to this API."
      const body = await response.text().catch(() => '');
      const detail = body.match(/"message"\s*:\s*"([^"]{1,200})"/)?.[1] ?? '';
      lastError = new HttpError(response.status, url, detail);
      if (response.status === 429 && attempt === 0) {
        const seconds = Number(response.headers.get('retry-after'));
        wait = Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 10_000, 30_000);
        continue;
      }
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

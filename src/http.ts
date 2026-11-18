const USER_AGENT = 'uae-job-radar/0.1 (personal job alerts)';

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`HTTP ${status} from ${url}`);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches JSON with a timeout, retrying network errors and 5xx responses twice. A 4xx is the
 * caller's problem (a wrong slug, a rate limit), so it fails at once.
 */
export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...init.headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return (await response.json()) as T;
      lastError = new HttpError(response.status, url);
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

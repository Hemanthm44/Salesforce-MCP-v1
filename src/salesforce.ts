const API_VERSION = "v68.0";
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 300;

const SLOW = "Salesforce is slow to respond, please try again.";
const UNREACHABLE = "Could not reach Salesforce, please try again.";
const UNAVAILABLE = "Salesforce is temporarily unavailable, please try again.";
const EMPTY = "Salesforce sent an unexpected response, please try again.";

type Session = { accessToken: string; instanceUrl: string };

let session: Session | null = null;

export class SalesforceError extends Error {
  status: number;
  transient: boolean;

  constructor(message: string, status: number, transient = false) {
    super(message);
    this.status = status;
    this.transient = transient;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

async function fetchOnce(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (isTimeout(err)) {
      throw new SalesforceError(SLOW, 504, true);
    }
    throw new SalesforceError(UNREACHABLE, 503, true);
  }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    const res = await fetchOnce(url, init);
    if (res.status < 500) {
      return res;
    }
    void res.body?.cancel();
    console.warn(`Salesforce returned HTTP ${res.status}; retrying once.`);
  } catch (err) {
    if (!(err instanceof SalesforceError) || !err.transient) {
      throw err;
    }
    console.warn(`${err.message} Retrying once.`);
  }
  await sleep(RETRY_DELAY_MS);
  return fetchOnce(url, init);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    if (isTimeout(err)) {
      throw new SalesforceError(SLOW, 504, true);
    }
    return null;
  }
}

function readConfig() {
  const instanceUrl = process.env.SF_INSTANCE_URL;
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  if (!instanceUrl || !clientId || !clientSecret) {
    throw new Error("Server is missing SF_INSTANCE_URL, SF_CLIENT_ID or SF_CLIENT_SECRET.");
  }
  return { instanceUrl, clientId, clientSecret };
}

async function requestToken(): Promise<Session> {
  const { instanceUrl, clientId, clientSecret } = readConfig();
  const res = await fetchWithRetry(`${instanceUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (res.status >= 500) {
    void res.body?.cancel();
    throw new SalesforceError(UNAVAILABLE, res.status, true);
  }
  const data = ((await readJson(res)) ?? {}) as {
    access_token?: string;
    instance_url?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`Salesforce login failed: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`);
  }
  return { accessToken: data.access_token, instanceUrl: data.instance_url ?? instanceUrl };
}

async function getSession(forceRefresh: boolean): Promise<Session> {
  if (!session || forceRefresh) {
    session = await requestToken();
  }
  return session;
}

export async function sfGet<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { accessToken, instanceUrl } = await getSession(attempt > 0);
    const res = await fetchWithRetry(`${instanceUrl}/services/data/${API_VERSION}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (res.status === 401 && attempt === 0) {
      void res.body?.cancel();
      continue;
    }
    if (res.status >= 500) {
      void res.body?.cancel();
      throw new SalesforceError(UNAVAILABLE, res.status, true);
    }
    const data = await readJson(res);
    if (!res.ok) {
      const first = (Array.isArray(data) ? data[0] : data) as { message?: string } | null;
      throw new SalesforceError(first?.message ?? `HTTP ${res.status}`, res.status);
    }
    if (data === null) {
      throw new SalesforceError(EMPTY, 502, true);
    }
    return data as T;
  }
  throw new SalesforceError("Could not refresh the Salesforce session.", 401);
}
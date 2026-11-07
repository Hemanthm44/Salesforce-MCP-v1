const API_VERSION = "v68.0";

type Session = { accessToken: string; instanceUrl: string };

let session: Session | null = null;

export class SalesforceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
  const res = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
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
    const res = await fetch(`${instanceUrl}/services/data/${API_VERSION}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (res.status === 401 && attempt === 0) {
      continue;
    }
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const first = (Array.isArray(data) ? data[0] : data) as { message?: string } | null;
      throw new SalesforceError(first?.message ?? `HTTP ${res.status}`, res.status);
    }
    return data as T;
  }
  throw new SalesforceError("Could not refresh the Salesforce session.", 401);
}
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
  idempotencyKey?: string;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public raw?: unknown,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type ValidationIssue = { msg?: unknown; loc?: unknown };

/**
 * FastAPI sends `detail` as a string for HTTPExceptions but as a list of issues
 * for request validation (422). Always return a readable string: rendering the
 * raw list as a React child crashes the page.
 */
export function errorMessage(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((issue: ValidationIssue) => {
        if (typeof issue?.msg !== "string") return null;
        // "Value error, …" is pydantic's prefix; drop it for people.
        return issue.msg.replace(/^Value error, /, "");
      })
      .filter((m): m is string => !!m);
    if (messages.length > 0) return messages.join(" ");
  }
  return undefined;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers = {}, token, idempotencyKey } = options;

  // Multipart uploads: the browser sets Content-Type with the boundary itself.
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const reqHeaders: Record<string, string> = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...headers,
  };

  if (token) reqHeaders["Authorization"] = `Bearer ${token}`;
  if (idempotencyKey) reqHeaders["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: reqHeaders,
    credentials: "include",
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new ApiError(res.status, errorMessage(data?.detail) ?? res.statusText, data);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const API_BASE = "/v1";
export const STORAGE_KEY = "cuescope_api_key";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

interface ApiOptions extends RequestInit {}

// עוטף fetch: מצרף מפתח API מ-localStorage, וזורק UnauthorizedError במקום
// 401 גולמי כדי שקוד הקורא יוכל להחזיר את המשתמש למסך הכניסה בלי לפרסר
// סטטוס קוד בעצמו. תואם 1:1 להתנהגות api() הישנה ב-app.js.
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T | null> {
  const key = localStorage.getItem(STORAGE_KEY);
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": key || "",
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem(STORAGE_KEY);
    throw new UnauthorizedError();
  }

  if (res.status === 204) return null;

  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || "שגיאה לא צפויה");
  return body.data as T;
}

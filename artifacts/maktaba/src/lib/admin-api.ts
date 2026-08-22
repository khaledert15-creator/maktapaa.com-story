import { useCallback, useEffect, useState } from "react";

export async function adminApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || "تعذر الاتصال بالخادم");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function useAdminResource<T>(url: string) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi<T>(url));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload };
}

export type ManualPaymentSetting = {
  method: "instapay" | "mobile_wallet";
  displayNameAr: string;
  transferDestination: string;
  accountHolderName: string | null;
  instructionsAr: string | null;
};

export type CustomerPaymentAttempt = {
  id: number;
  amount: number;
  transferMethod: "instapay" | "mobile_wallet";
  status: "pending_verification" | "confirmed" | "rejected" | "needs_review";
  rejectionReason: string | null;
  hasProof: boolean;
  createdAt: string;
  reviewedAt: string | null;
};

async function customerPaymentApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "تعذر الاتصال بالخادم");
  return body as T;
}

export const getManualPaymentSettings = () => customerPaymentApi<ManualPaymentSetting[]>("/api/payments/settings");
export const getOrderPaymentAttempts = (orderNumber: string) => customerPaymentApi<CustomerPaymentAttempt[]>(`/api/orders/${encodeURIComponent(orderNumber)}/payment-attempts`);
export const submitOrderPaymentAttempt = (orderNumber: string, body: FormData) => customerPaymentApi<{ id: number; status: string; statusLabel: string; amount: number; riskLevel: string; previousUseCount: number; hasProof: boolean; createdAt: string }>(`/api/orders/${encodeURIComponent(orderNumber)}/payment-attempts`, { method: "POST", body });

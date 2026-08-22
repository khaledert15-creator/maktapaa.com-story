import { randomInt } from "node:crypto";

const ORDER_NUMBER_CONSTRAINT = "orders_order_number_unique";

type PostgresError = {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
};

export function generateOrderNumber(now = new Date()): string {
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `MK${year}${month}${day}-${randomInt(10_000, 100_000)}`;
}

export function isPostgresUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  const visited = new Set<unknown>();

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as PostgresError;
    if (candidate.code === "23505" && (!constraint || candidate.constraint === constraint)) return true;
    current = candidate.cause;
  }

  return false;
}

export async function withUniqueOrderNumber<T>(
  create: (orderNumber: string) => Promise<T>,
  options: { maxAttempts?: number; generate?: () => string } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const generate = options.generate ?? generateOrderNumber;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await create(generate());
    } catch (error) {
      lastError = error;
      if (!isPostgresUniqueViolation(error, ORDER_NUMBER_CONSTRAINT) || attempt === maxAttempts - 1) throw error;
    }
  }

  throw lastError;
}

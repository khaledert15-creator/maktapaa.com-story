import bcrypt from "bcryptjs";
import { db, customersTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function requireCustomerAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.customerId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session?.adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (isAdminSessionExpired(req.session.adminLastActivityAt)) {
    clearAdminSession(req);
    res.status(401).json({ error: "انتهت جلسة الإدارة لعدم النشاط. سجّل الدخول مرة أخرى." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.adminId));
  if (!user?.isActive) {
    clearAdminSession(req);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.session.adminRole = user.role;
  req.session.adminPermissions = user.permissions;
  req.session.adminLastActivityAt = Date.now();
  next();
}

export function isAdminSessionExpired(lastActivityAt: number | undefined, now = Date.now(), timeoutMs = config.ADMIN_IDLE_TIMEOUT_MS): boolean {
  return typeof lastActivityAt !== "number" || now - lastActivityAt > timeoutMs;
}

function clearAdminSession(req: Request): void {
  req.session.adminId = undefined;
  req.session.adminRole = undefined;
  req.session.adminPermissions = undefined;
  req.session.adminLastActivityAt = undefined;
}

export function requireAdminPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session?.adminId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (
      req.session.adminRole === "owner" ||
      req.session.adminRole === "administrator" ||
      hasPermission(req.session.adminPermissions, permission)
    ) {
      next();
      return;
    }

    res.status(403).json({ error: "ليس لديك صلاحية لتنفيذ هذا الإجراء" });
  };
}

export function hasAdminPermission(req: Request, permission: string): boolean {
  return req.session.adminRole === "owner" || req.session.adminRole === "administrator" || hasPermission(req.session.adminPermissions, permission);
}

function hasPermission(permissions: string[] | undefined, permission: string): boolean {
  if (permissions?.includes(permission)) return true;
  if (permission === "content.view") return Boolean(permissions?.includes("content.manage") || permissions?.includes("branding.manage"));
  return false;
}

export async function getCustomerFromSession(req: Request) {
  if (!req.session?.customerId) return null;
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, req.session.customerId as number));
  return customer || null;
}

export async function getAdminFromSession(req: Request) {
  if (!req.session?.adminId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.adminId as number));
  return user || null;
}

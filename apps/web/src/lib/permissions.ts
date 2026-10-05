"use client";

import { useCallback } from "react";
import { hasPermission, isSuperAdmin, useAuth } from "./auth";

/**
 * `can("orders.edit")` for the signed-in user. A courtesy for hiding controls
 * the API would refuse anyway — never the access check itself.
 */
export function useCan() {
  const { user } = useAuth();
  const can = useCallback((code: string) => hasPermission(user, code), [user]);
  return { can, isSuper: isSuperAdmin(user), user };
}

import type { Role } from "@/lib/role";
import { RBAC_MATRIX, type RoleKey } from "./business-rules";

function mapRole(role: Role): RoleKey {
  if (role === "ADMIN") return "ADMIN";
  if (role === "SENIOR") return "SENIOR";
  return "JUNIOR";
}

export function canEditLevelRules(role: Role): boolean {
  return RBAC_MATRIX[mapRole(role)].canEditLevelRules;
}

export function canEditCompanySettings(role: Role): boolean {
  return RBAC_MATRIX[mapRole(role)].canEditCompanySettings;
}

export function canManageUsers(role: Role): boolean {
  return RBAC_MATRIX[mapRole(role)].canManageUsers;
}

export function canEditEmployees(role: Role): boolean {
  return RBAC_MATRIX[mapRole(role)].canEditEmployees;
}

export function canTriggerGlSync(role: Role): boolean {
  return RBAC_MATRIX[mapRole(role)].canTriggerGlSync;
}

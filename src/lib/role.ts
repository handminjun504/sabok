export const Role = {
  ADMIN: "ADMIN",
  SENIOR: "SENIOR",
  JUNIOR: "JUNIOR",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export function parseRole(v: string): Role {
  if (v === Role.ADMIN || v === Role.SENIOR || v === Role.JUNIOR) return v;
  return Role.JUNIOR;
}

/**
 * Platform role definitions and hierarchy for StreamKit
 * Matches the platform_role enum in 20261111000004_platform_roles.sql
 */

export type PlatformRole =
  | "super_admin"
  | "platform_admin"
  | "billing_admin"
  | "support_admin"
  | "creator_admin"
  | "viewer";

export const PLATFORM_ROLES: PlatformRole[] = [
  "super_admin",
  "platform_admin",
  "billing_admin",
  "support_admin",
  "creator_admin",
  "viewer",
];

export const PLATFORM_ROLE_HIERARCHY: Record<PlatformRole, number> = {
  super_admin: 6,
  platform_admin: 5,
  billing_admin: 4,
  support_admin: 3,
  creator_admin: 2,
  viewer: 1,
};

/**
 * Check if a role meets or exceeds a minimum required role
 */
export function hasRole(userRole: PlatformRole | null | undefined, minRole: PlatformRole): boolean {
  if (!userRole) return false;
  return PLATFORM_ROLE_HIERARCHY[userRole] >= PLATFORM_ROLE_HIERARCHY[minRole];
}

/**
 * Get the highest role from an array of roles
 */
export function getHighestRole(roles: PlatformRole[]): PlatformRole {
  if (!roles.length) return "viewer";
  return roles.reduce((highest, role) =>
    PLATFORM_ROLE_HIERARCHY[role] > PLATFORM_ROLE_HIERARCHY[highest] ? role : highest
  );
}

/**
 * Human-readable role labels for UI
 */
export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super Administrator",
  platform_admin: "Platform Administrator",
  billing_admin: "Billing Administrator",
  support_admin: "Support Administrator",
  creator_admin: "Creator Administrator",
  viewer: "Viewer",
};

/**
 * Role descriptions for admin UI
 */
export const PLATFORM_ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  super_admin: "Full platform control including role management and system configuration",
  platform_admin: "Platform operations, user management, and content moderation",
  billing_admin: "Payment configuration, transaction review, and financial reporting",
  support_admin: "User support, ticket management, and escalation handling",
  creator_admin: "Creator onboarding, verification, and dashboard oversight",
  viewer: "Read-only access to public platform information",
};

/**
 * Permissions matrix - what each role can do
 */
export interface PlatformPermissions {
  manageRoles: boolean;
  manageUsers: boolean;
  managePaymentConfig: boolean;
  viewTransactions: boolean;
  manageDonationPhotos: boolean;
  viewAuditLogs: boolean;
  manageIntegrations: boolean;
  viewHealthMetrics: boolean;
  manageSystemConfig: boolean;
}

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermissions> = {
  super_admin: {
    manageRoles: true,
    manageUsers: true,
    managePaymentConfig: true,
    viewTransactions: true,
    manageDonationPhotos: true,
    viewAuditLogs: true,
    manageIntegrations: true,
    viewHealthMetrics: true,
    manageSystemConfig: true,
  },
  platform_admin: {
    manageRoles: false,
    manageUsers: true,
    managePaymentConfig: false,
    viewTransactions: true,
    manageDonationPhotos: true,
    viewAuditLogs: true,
    manageIntegrations: true,
    viewHealthMetrics: true,
    manageSystemConfig: false,
  },
  billing_admin: {
    manageRoles: false,
    manageUsers: false,
    managePaymentConfig: true,
    viewTransactions: true,
    manageDonationPhotos: false,
    viewAuditLogs: true,
    manageIntegrations: false,
    viewHealthMetrics: true,
    manageSystemConfig: false,
  },
  support_admin: {
    manageRoles: false,
    manageUsers: true,
    managePaymentConfig: false,
    viewTransactions: true,
    manageDonationPhotos: true,
    viewAuditLogs: true,
    manageIntegrations: false,
    viewHealthMetrics: false,
    manageSystemConfig: false,
  },
  creator_admin: {
    manageRoles: false,
    manageUsers: false,
    managePaymentConfig: false,
    viewTransactions: false,
    manageDonationPhotos: true,
    viewAuditLogs: false,
    manageIntegrations: false,
    viewHealthMetrics: false,
    manageSystemConfig: false,
  },
  viewer: {
    manageRoles: false,
    manageUsers: false,
    managePaymentConfig: false,
    viewTransactions: false,
    manageDonationPhotos: false,
    viewAuditLogs: false,
    manageIntegrations: false,
    viewHealthMetrics: false,
    manageSystemConfig: false,
  },
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: PlatformRole | null | undefined, permission: keyof PlatformPermissions): boolean {
  if (!role) return false;
  return PLATFORM_ROLE_PERMISSIONS[role][permission];
}
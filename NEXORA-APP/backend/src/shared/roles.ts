export const ROLES = ['client', 'designer', 'admin', 'owner'] as const;
export type Role = typeof ROLES[number];
export type IdentityVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

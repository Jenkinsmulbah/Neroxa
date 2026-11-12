import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      fullName: string;
      role: 'client' | 'designer' | 'admin' | 'owner';
      accountStatus: 'active' | 'suspended' | 'disabled';
      identityVerificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
    };
    csrfToken?: string;
  }
}

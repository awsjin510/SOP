import type { Timestamp } from 'firebase/firestore';

// docs/data-model.md 的型別定義
// W1 只用得到 UserDoc，其他先留型別未來階段填欄位

export interface UserPreferences {
  language: 'zh-TW' | 'en';
  theme: 'light' | 'dark' | 'auto';
  defaultTargetAudience?: string;
}

export interface ApiUsageLimit {
  monthly_usd_limit: number;
  notification_threshold: number;
}

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  preferences: UserPreferences;
  apiUsageLimit: ApiUsageLimit;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  organizationId: string | null;
  role: 'admin' | 'member' | null;
}

// W3+ 才會用到，先留 placeholder
export interface SopDoc {
  id: string;
  sopId: string;
  owner: string;
  members: string[];
  visibility: 'private' | 'organization' | 'public';
  title: string;
  category?: string;
  tags: string[];
  targetAudience: string;
  estimatedDuration: string;
  difficulty: '初級' | '中級' | '進階';
  authors: string[];
  currentVersion: string;
  totalVersions: number;
  stepsCount: number;
  troubleshootingCount: number;
  glossaryCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastReviewedAt?: Timestamp;
  status: 'active' | 'archived' | 'draft';
}

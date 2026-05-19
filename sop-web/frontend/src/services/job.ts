/**
 * MVP 下的 Job 模型：所有狀態存在記憶體（stores/current-job.ts）。
 * 這裡只放型別宣告 + helper，不再寫 Firestore。
 */

export type JobStatus =
  | 'idle'
  | 'reading'
  | 'extracting'
  | 'building_ir'
  | 'completed'
  | 'failed';

export interface JobUploadedFile {
  /** 原始檔名（顯示用） */
  name: string;
  /** 已分類的型別 */
  type: 'transcript' | 'document' | 'screenshot';
  /** Blob 內容（純記憶體，未上傳）*/
  blob: Blob;
  /** 來源 File 大小 */
  size: number;
}

export interface JobProgress {
  status: JobStatus;
  /** 0–100 */
  percent: number;
  /** 顯示給使用者的描述（"正在分析訪談…"）*/
  message: string;
}

export interface ProgressReporter {
  (progress: JobProgress): void;
}

/** 產生一個 short job id（顯示用，不需全域唯一） */
export function newJobId(): string {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

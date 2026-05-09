import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTask,
} from 'firebase/storage';
import { storage } from '@/firebase/config';

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
}

export interface UploadResult {
  storagePath: string;
  downloadUrl: string;
}

/**
 * 上傳檔案到使用者私有路徑：users/{uid}/jobs/{jobId}/{filename}
 * 規則上 Storage 只允許使用者寫入自己 uid 路徑（見 storage.rules）。
 */
export async function uploadJobFile(
  uid: string,
  jobId: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const path = `users/${uid}/jobs/${jobId}/${sanitizeFilename(file.name)}`;
  const ref = storageRef(storage, path);
  const task: UploadTask = uploadBytesResumable(ref, file, {
    contentType: file.type,
  });

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snap.bytesTransferred,
            totalBytes: snap.totalBytes,
            percent:
              snap.totalBytes > 0
                ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
                : 0,
          });
        }
      },
      (err) => reject(err),
      () => {
        getDownloadURL(task.snapshot.ref)
          .then((url) =>
            resolve({
              storagePath: path,
              downloadUrl: url,
            }),
          )
          .catch(reject);
      },
    );
  });
}

/**
 * 不允許路徑越界、空白、特殊字元。
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\./g, '_')
    .replace(/[/\\]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\w.\-一-鿿]/g, '_');
}

// W3 暫時用：把 File 讀成純文字（給 transcript 用）
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

// 檔案類型白名單（依規格 docs/security.md）
export const ALLOWED_MIME_TYPES = new Map<string, string>([
  ['text/plain', '.txt'],
  ['text/markdown', '.md'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.docx',
  ],
  [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xlsx',
  ],
  ['application/pdf', '.pdf'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface FileValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateFile(file: File): FileValidationResult {
  // 有些瀏覽器對 .txt / .md 給空 type，根據副檔名 fallback
  const inferred = inferMimeType(file);
  if (!ALLOWED_MIME_TYPES.has(inferred)) {
    return { valid: false, reason: `不支援的檔案類型：${inferred || '未知'}` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      valid: false,
      reason: `檔案大小超過 50MB 上限（目前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`,
    };
  }
  return { valid: true };
}

export function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return '';
}

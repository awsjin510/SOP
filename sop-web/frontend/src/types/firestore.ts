/**
 * 保留的型別（移除 Firestore Timestamp 依賴）。
 *
 * 檔名暫保留 `firestore.ts` 是因為許多現有 import 路徑指到這裡；下一輪整理時
 * 可以改名為 `sop-types.ts`。
 */

/**
 * 對 IR 中 image_id 的具體檔案參照（給 Word/PDF 渲染器用）。
 *
 * MVP 下不再上傳 Firebase Storage，所以 `storagePath` / `downloadUrl` 都改成
 * 本地 ObjectURL 或 base64 data URL。
 */
export interface ImageAsset {
  storagePath: string;
  downloadUrl: string;
  contentType: string;
  /** 原始檔名（讓使用者識別） */
  sourceFile: string;
}

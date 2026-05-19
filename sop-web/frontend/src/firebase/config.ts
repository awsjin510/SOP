/**
 * Firebase has been removed from this MVP.
 *
 * 這個檔案保留只是因為還有少數舊檔案 import 它的型別 export；運行時不再做任何
 * Firebase 初始化。所有原本透過 auth/db/storage/functions 的呼叫都已經改寫為
 * 純前端（記憶體 + BYOK Anthropic 直連）。下一輪清理時整個檔案連同 src/firebase/
 * 目錄可以刪除。
 */

export const app = null;
export const auth = null;
export const db = null;
export const storage = null;
export const functions = null;

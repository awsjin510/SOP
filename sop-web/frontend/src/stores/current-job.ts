import { defineStore } from 'pinia';
import type { JobUploadedFile, JobStatus } from '@/services/job';

/**
 * 當前抽取 job 的記憶體狀態。
 *
 * 流程：
 *   NewSopPage 把 files / meta 寫進來 → 跳 /progress
 *   JobProgressPage 讀 files / meta，呼叫 pipeline；progress 透過 reporter
 *   寫回 status / percent / message → 完成後寫 result IR → 跳 /result
 */
interface CurrentJobState {
  files: JobUploadedFile[];
  title: string;
  status: JobStatus;
  percent: number;
  message: string;
  error: string | null;
}

export const useCurrentJobStore = defineStore('current-job', {
  state: (): CurrentJobState => ({
    files: [],
    title: '',
    status: 'idle',
    percent: 0,
    message: '',
    error: null,
  }),

  getters: {
    isRunning: (s): boolean =>
      s.status !== 'idle' && s.status !== 'completed' && s.status !== 'failed',
    hasFiles: (s): boolean => s.files.length > 0,
  },

  actions: {
    queue(payload: { files: JobUploadedFile[]; title: string }): void {
      this.files = payload.files;
      this.title = payload.title;
      this.status = 'idle';
      this.percent = 0;
      this.message = '';
      this.error = null;
    },
    report(status: JobStatus, percent: number, message: string): void {
      this.status = status;
      this.percent = percent;
      this.message = message;
    },
    fail(error: string): void {
      this.status = 'failed';
      this.error = error;
    },
    succeed(message = '完成'): void {
      this.status = 'completed';
      this.percent = 100;
      this.message = message;
    },
    reset(): void {
      this.files = [];
      this.title = '';
      this.status = 'idle';
      this.percent = 0;
      this.message = '';
      this.error = null;
    },
  },
});

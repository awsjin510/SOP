import { initializeApp } from 'firebase-admin/app';

initializeApp();

// W1：只暴露 helloWorld 用於驗證前端→Cloud Functions 管線。
// W2 起會新增 claudeProxy；onUserSignedUp 等延後到需要時再加（user doc 由前端 getOrCreateUser 處理）。
export { helloWorld } from './hello';

import { initializeApp } from 'firebase-admin/app';

initializeApp();

// W1: helloWorld（前端→functions 管線打通驗證）
// W2: claudeProxy（代理 Anthropic API、速率/月度限制、用量追蹤）
export { helloWorld } from './hello';
export { claudeProxy } from './claude-proxy';

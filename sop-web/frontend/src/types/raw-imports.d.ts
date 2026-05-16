// Vite 的 ?raw query：把任何檔案內容當字串引入
declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

// Vite 的 ?url query：回傳檔案的最終 URL（用於 worker 等資源）
declare module '*?url' {
  const url: string;
  export default url;
}

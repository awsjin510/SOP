// Vite 的 ?raw query：把任何檔案內容當字串引入
declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

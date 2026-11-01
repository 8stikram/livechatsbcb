declare module '*.png' {
  const url: string;
  export default url;
}

declare module '*.png?asset' {
  const path: string;
  export default path;
}

declare module '*.css';

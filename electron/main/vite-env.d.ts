/// <reference types="vite/client" />

/**
 * Ambient declarations for Vite's `?raw` imports used to bundle the mobile
 * PWA assets (HTML/CSS/JS/JSON/SVG) directly into the main process bundle.
 *
 * Without these, TypeScript flags the imports as missing modules.
 */
declare module '*.html?raw' {
  const content: string
  export default content
}
declare module '*.css?raw' {
  const content: string
  export default content
}
declare module '*.js?raw' {
  const content: string
  export default content
}
declare module '*.json?raw' {
  const content: string
  export default content
}
declare module '*.svg?raw' {
  const content: string
  export default content
}

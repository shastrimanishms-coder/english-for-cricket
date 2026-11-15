// Ambient declarations for CSS imports.
// Metro/NativeWind handle these at bundle time; TypeScript needs the shapes.
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.css';

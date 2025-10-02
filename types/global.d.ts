// Ambient type declarations for editor/tsserver to avoid installing @types/node when not desired

declare module "vite" {
  import type { UserConfigExport } from "vite";
  const defineConfig: (config: UserConfigExport) => UserConfigExport;
  export { defineConfig };
}

declare module "@vitejs/plugin-react-swc" {
  type ReactSwcPlugin = (...args: unknown[]) => unknown;
  const reactPlugin: ReactSwcPlugin;
  export default reactPlugin;
}

// Minimal Node globals used in config files
declare const __dirname: string;
declare const process: {
  cwd(): string;
  env: { [key: string]: string | undefined };
};

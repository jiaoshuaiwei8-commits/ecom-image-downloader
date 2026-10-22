import { defineConfig, type UserConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 三次独立构建：
 *   --mode content     内容脚本（必须是单文件 IIFE，不能有 ESM import）
 *   --mode background  Service Worker（同样是单文件 IIFE）
 *   --mode preview     预览页（ESM + HTML 入口）
 * 这样避免了 @crxjs 之类的插件依赖，构建产物结构完全可控。
 */
const rootDir = process.cwd();
const alias = { '@shared': resolve(rootDir, 'src/shared') };

function libBuild(entry: string, fileName: string): UserConfig {
  return {
    root: rootDir,
    publicDir: false,
    resolve: { alias },
    build: {
      target: 'chrome110',
      outDir: 'dist',
      // 清理由 scripts/clean.mjs 统一处理，避免多次构建互相删除产物
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: resolve(rootDir, entry),
        formats: ['iife'],
        name: 'EID',
        fileName: () => fileName,
      },
      rollupOptions: {
        output: { extend: true, inlineDynamicImports: true },
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'content') return libBuild('src/content/index.ts', 'content.js');
  if (mode === 'background') return libBuild('src/background/index.ts', 'background.js');

  return {
    root: resolve(rootDir, 'src/preview'),
    // 扩展页面用 file 协议式的相对路径，base 必须是 './'，
    // 否则 Vite 会输出 /assets/...，在 chrome-extension:// 下解析到扩展根目录而 404
    base: './',
    // manifest.json 必须落在 dist 根目录，不能跟着预览页进 dist/preview
    publicDir: false,
    resolve: { alias },
    build: {
      target: 'chrome110',
      outDir: resolve(rootDir, 'dist/preview'),
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(rootDir, 'src/preview/index.html'),
      },
    },
    plugins: [
      {
        name: 'eid-copy-manifest',
        closeBundle() {
          mkdirSync(resolve(rootDir, 'dist'), { recursive: true });
          copyFileSync(
            resolve(rootDir, 'public/manifest.json'),
            resolve(rootDir, 'dist/manifest.json'),
          );
        },
      },
    ],
  };
});

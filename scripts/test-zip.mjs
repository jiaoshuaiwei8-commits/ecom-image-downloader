/**
 * 自研 zip 写入器的冒烟测试（Node 24 可直接跑 .ts）。
 * 跑法：node scripts/test-zip.mjs
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createZip } from '../src/shared/zip.ts';

const encoder = new TextEncoder();
const zip = createZip([
  { name: '商品-01.txt', data: encoder.encode('hello zip') },
  { name: 'sub/商品-02.txt', data: encoder.encode('第二张图') },
]);

writeFileSync('dist/__ziptest.zip', new Uint8Array(await zip.arrayBuffer()));

execSync(
  'powershell -NoProfile -Command "Remove-Item -Recurse -Force dist/__ziptest -ErrorAction SilentlyContinue; Expand-Archive -Path dist/__ziptest.zip -DestinationPath dist/__ziptest"',
  { stdio: 'inherit' },
);

const { readFileSync, readdirSync } = await import('node:fs');
const files = readdirSync('dist/__ziptest', { recursive: true });
console.log('解压出的条目：', files);
console.log('内容校验：', readFileSync('dist/__ziptest/商品-01.txt', 'utf8'));

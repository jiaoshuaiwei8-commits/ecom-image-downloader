import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 开发模式：并行启动三个 vite build --watch。
 * MV3 无法用 HMR 热替换内容脚本，所以这里的“dev”= 保存即重新构建，
 * 你在 chrome://extensions 里点一下刷新即可加载最新产物。
 */
const cwd = process.cwd();
rmSync(resolve(cwd, 'dist'), { recursive: true, force: true });

const modes = [
  { mode: 'content', color: '\x1b[36m' },
  { mode: 'background', color: '\x1b[35m' },
  { mode: 'preview', color: '\x1b[32m' },
];

const children = modes.map(({ mode, color }) => {
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'build', '--mode', mode, '--watch'],
    { cwd, shell: process.platform === 'win32' },
  );

  const write = (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) process.stdout.write(`${color}[${mode}]\x1b[0m ${line}\n`);
    }
  };

  child.stdout.on('data', write);
  child.stderr.on('data', write);
  child.on('exit', (code) => {
    if (code) console.error(`\x1b[31m[${mode}] 退出，code=${code}\x1b[0m`);
  });
  return child;
});

const shutdown = () => {
  for (const child of children) child.kill();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('\x1b[32m[eid]\x1b[0m 监听中，修改源码后到 chrome://extensions 点刷新\n');

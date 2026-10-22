import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

rmSync(resolve(process.cwd(), 'dist'), { recursive: true, force: true });
console.log('[eid] dist 已清空');

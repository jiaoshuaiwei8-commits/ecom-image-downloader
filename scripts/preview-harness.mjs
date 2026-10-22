/**
 * 预览页冒烟验证用：把构建产物 index.html 复制一份，注入 chrome API 桩 + 假数据，
 * 然后用本地 HTTP 服务打开（ESM 不能用 file:// 加载）。
 * 仅用于本地验证，不参与扩展构建。
 *
 * 跑法：node scripts/preview-harness.mjs
 */
import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve('dist/preview');
const html = await readFile(join(root, 'index.html'), 'utf8');
const assets = await readdir(join(root, 'assets'));
const js = assets.find((name) => name.endsWith('.js'));
if (!js) throw new Error('dist/preview/assets 下没有 js 产物，请先 npm run build');

const seeds = Array.from({ length: 18 }, (_, i) => i + 1);
const fakeImages = seeds.map((n) => ({
  url: `https://picsum.photos/seed/eid${n}/900/900`,
  candidates: [],
  key: `picsum/eid${n}`,
  width: n % 5 === 0 ? 0 : 900,
  height: n % 5 === 0 ? 0 : 900,
  source: ['img', 'lazy', 'srcset', 'background'][n % 4],
  broken: false,
}));

const stub = `
<script>
  window.__EID_FAKE__ = {
    site: 'taobao',
    siteName: '淘宝 / 天猫',
    shortName: 'taobao',
    pageUrl: 'https://item.taobao.com/item.htm?id=1',
    pageTitle: '纯棉短袖T恤 夏季新款 宽松百搭 -淘宝网',
    collectedAt: Date.now(),
    scanned: 40,
    trimmed: 6,
    images: ${JSON.stringify(fakeImages)},
  };
  window.chrome = {
    runtime: { lastError: undefined, sendMessage: async () => ({ ok: false, error: 'harness stub' }) },
    storage: { session: { get: (key, cb) => cb({ [key]: window.__EID_FAKE__ }) } },
    downloads: { download: (_options, cb) => cb && cb(1) },
  };
</script>`;

await writeFile(join(root, '__harness.html'), html.replace('<head>', `<head>${stub}`));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(5178, () => {
  console.log('预览页冒烟地址： http://localhost:5178/__harness.html');
});

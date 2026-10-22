/** 站点自带的标题后缀，下载文件名里去掉，避免每个文件都拖一条长尾巴 */
const TITLE_NOISE = /\s*[-_|]\s*(?:淘宝网|天猫|Tmall\.com|tmall\.com|京东|JD\.COM|jd\.com|拼多多|商家后台).*$/i;

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]+/g;

/** 把商品标题压成安全的文件名片段 */
export function slugifyTitle(title: string, fallback = '未命名商品'): string {
  let text = title.replace(TITLE_NOISE, '').trim();
  if (!text) text = fallback;
  text = text
    .replace(ILLEGAL, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  // 中文一个字约等于两个字符宽度，40 个字符已经足够辨识
  if (text.length > 40) text = text.slice(0, 40).replace(/[-.]+$/, '');
  return text || fallback;
}

/** taobao-商品标题-01.png */
export function buildFileName(shortName: string, slug: string, index: number, total: number): string {
  const pad = total >= 100 ? 3 : 2;
  return `${shortName}-${slug}-${String(index).padStart(pad, '0')}.png`;
}

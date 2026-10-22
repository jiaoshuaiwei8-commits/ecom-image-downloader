import type { SiteConfig } from './sites';
import type { SiteId } from './types';

/** 明显的占位图 / 追踪像素 / 图标 */
const NOISE_PATTERN =
  /(?:spacer|transparent|1x1|pixel\.(?:gif|png)|blank\.(?:gif|png)|placeholder|sprite|loading\.(?:gif|png|svg))/i;

/** CDN 的图片变换类查询参数，去掉后通常能拿到未经压缩的原图 */
const TRANSFORM_PARAMS =
  /^(?:imageMogr2|imageView2|imageView|imageslim|x-oss-process|thumbnail|resize|quality|compress|param)$/i;

/**
 * 把属性值 / CSS 里的相对地址补全为绝对地址。
 * 过滤 data:、blob:、javascript: 等不可能是商品图的协议。
 */
export function absoluteUrl(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!value) return null;
  if (/^(?:data:|blob:|javascript:|about:)/i.test(value)) return null;

  // 协议相对地址：//img.alicdn.com/xxx.jpg
  const normalized = value.startsWith('//') ? `https:${value}` : value;
  try {
    const url = new URL(normalized, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** 去掉 CDN 的图片变换查询参数；无参数剩余时把 ? 也去掉 */
export function stripTransformQuery(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  let touched = false;
  for (const key of [...url.searchParams.keys()]) {
    if (TRANSFORM_PARAMS.test(key)) {
      url.searchParams.delete(key);
      touched = true;
    }
  }
  if (!touched) return href;
  return url.search;
}

/**
 * 缩略图 → 原图。
 * 返回 primary（首选）与 candidates（含备选，按优先级排列）。
 */
export function restoreOriginal(href: string, site: SiteConfig): { primary: string; candidates: string[] } {
  const cleaned = stripTransformQuery(href);
  let primary = cleaned;

  // 主规则反复应用（后缀可能叠加两三层）
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const rule of site.rewrites) {
      if (rule.fallbackOnly) continue;
      const next = primary.replace(rule.pattern, rule.replace);
      if (next !== primary) {
        primary = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const fallbacks: string[] = [];
  for (const rule of site.rewrites) {
    if (!rule.fallbackOnly) continue;
    const next = primary.replace(rule.pattern, rule.replace);
    if (next !== primary) fallbacks.push(next);
  }

  // 最后兜底：完全去掉查询串
  const bare = primary.split('?')[0];
  if (bare !== primary) fallbacks.push(bare);

  const candidates = dedupe([primary, ...fallbacks]);
  return { primary, candidates };
}

/** 去重键：host + path，忽略协议与查询参数 */
export function dedupeKey(href: string): string {
  try {
    const url = new URL(href);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return href.split('?')[0].toLowerCase();
  }
}

export function isNoiseImage(href: string): boolean {
  return NOISE_PATTERN.test(href);
}

/** 从 srcset 中挑宽度最大的一项 */
export function pickLargestFromSrcset(srcset: string, base: string): string | null {
  const parts = srcset.split(',').map((s) => s.trim()).filter(Boolean);
  let best: { url: string; score: number } | null = null;

  for (const part of parts) {
    const [rawUrl, descriptor] = part.split(/\s+/);
    const url = absoluteUrl(rawUrl, base);
    if (!url) continue;

    let score = 1;
    if (descriptor) {
      const w = /^(\d+)w$/i.exec(descriptor);
      const x = /^([\d.]+)x$/i.exec(descriptor);
      if (w) score = Number(w[1]);
      else if (x) score = Number(x[1]) * 1000;
    }
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url ?? null;
}

/** 从 CSS 的 background-image / image-set() 中提取所有 url() */
export function extractBackgroundUrls(value: string, base: string): string[] {
  const urls: string[] = [];
  const re = /url\((['"]?)([^'")]+)\1\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const url = absoluteUrl(match[2], base);
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * 网格里显示用的缩略图地址：走 CDN 的缩放参数，能省下大量流量。
 * 加载失败时前端会自动回退到原图。
 */
export function thumbnailUrl(href: string, siteId: SiteId): string {
  if (siteId === 'taobao' && /alicdn\.com/i.test(href) && /\.(jpe?g|png|webp)$/i.test(href)) {
    return `${href}_400x400.jpg`;
  }
  if (siteId === 'jd' && /360buyimg\.com/i.test(href) && href.includes('/jfs/')) {
    return href.replace('/jfs/', '/s400x400_jfs/');
  }
  return href;
}

export function dedupe<T>(list: T[]): T[] {
  return [...new Set(list)];
}

import type { SiteConfig } from '@shared/sites';
import type { CollectedImage, CollectResult, ImageSourceKind } from '@shared/types';
import {
  absoluteUrl,
  dedupeKey,
  extractBackgroundUrls,
  isNoiseImage,
  pickLargestFromSrcset,
  restoreOriginal,
} from '@shared/imageUrl';
import { mapLimit, wait } from '@shared/utils';

/** 常见懒加载属性，淘宝/京东/拼多多用的名字各不相同 */
const IMG_ATTRS: Array<[string, ImageSourceKind]> = [
  ['src', 'img'],
  ['data-src', 'lazy'],
  ['data-lazy-src', 'lazy'],
  ['data-lazyload', 'lazy'],
  ['data-ks-lazyload', 'lazy'],
  ['data-original', 'lazy'],
  ['data-url', 'lazy'],
  ['data-img', 'lazy'],
  ['data-image', 'lazy'],
];

const MIN_SIZE = 100;
const PROBE_CONCURRENCY = 6;
/** 尺寸探测的时间预算：超时就不等了，剩下的交给预览页边显示边补 */
const PROBE_BUDGET_MS = 1200;
/** 自动滚动触发懒加载的时间预算 */
const LAZY_SCROLL_BUDGET_MS = 2000;

interface RawImage {
  url: string;
  source: ImageSourceKind;
  width: number;
  height: number;
}

export async function collectImages(site: SiteConfig): Promise<CollectResult> {
  // 1. 先滚一遍页面，把懒加载的图逼出来，再滚回原位
  await triggerLazyLoad();

  const raws: RawImage[] = [];
  scanRoot(document, document.baseURI, window, site, raws, false);
  scanIframes(site, raws);

  // 2. 归一化 + 去重 + 过滤
  const byKey = new Map<string, CollectedImage>();
  let trimmed = 0;

  for (const raw of raws) {
    const { primary, candidates } = restoreOriginal(raw.url, site);
    if (isNoiseImage(primary)) {
      trimmed += 1;
      continue;
    }
    if (raw.width > 0 && raw.height > 0 && raw.width < MIN_SIZE && raw.height < MIN_SIZE) {
      trimmed += 1;
      continue;
    }
    const key = dedupeKey(primary);
    if (!key) {
      trimmed += 1;
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        url: primary,
        candidates,
        key,
        width: raw.width,
        height: raw.height,
        source: raw.source,
        broken: false,
      });
      continue;
    }
    // 同一张图被多个元素引用：保留已知的最大尺寸
    if (raw.width * raw.height > existing.width * existing.height) {
      existing.width = raw.width;
      existing.height = raw.height;
    }
  }

  const images = [...byKey.values()];

  // 3. 并发探测真实尺寸（有总时间预算，不阻塞展示）
  await probeUnknownSizes(images);

  // 大图在前，符合「主图优先」的直觉
  images.sort((a, b) => b.width * b.height - a.width * a.height);

  return {
    site: site.id,
    siteName: site.name,
    shortName: site.shortName,
    pageUrl: location.href,
    pageTitle: document.title,
    images,
    collectedAt: Date.now(),
    scanned: raws.length,
    trimmed,
  };
}

/** 递归扫描一个 document（主文档或同源 iframe） */
function scanRoot(
  root: ParentNode,
  base: string,
  win: Window,
  site: SiteConfig,
  out: RawImage[],
  fromFrame: boolean,
): void {
  // ---- <img>：所有懒加载属性 + srcset ----
  root.querySelectorAll('img').forEach((element) => {
    const img = element as HTMLImageElement;
    const width = img.naturalWidth || 0;
    const height = img.naturalHeight || 0;

    for (const [attr, kind] of IMG_ATTRS) {
      const url = absoluteUrl(img.getAttribute(attr), base);
      if (url) out.push({ url, source: fromFrame ? 'iframe' : kind, width, height });
    }

    const srcset = img.getAttribute('srcset') ?? img.getAttribute('data-srcset');
    if (srcset) {
      const url = pickLargestFromSrcset(srcset, base);
      if (url) out.push({ url, source: fromFrame ? 'iframe' : 'srcset', width, height });
    }
  });

  // ---- <picture><source srcset> ----
  root.querySelectorAll('picture source').forEach((element) => {
    const url = pickLargestFromSrcset(element.getAttribute('srcset') ?? '', base);
    if (url) out.push({ url, source: 'picture', width: 0, height: 0 });
  });

  // ---- background-image：只扫站点配置的关键容器，避免全量 getComputedStyle ----
  const selectors = [...site.containerSelectors, '[style*="background"]'];
  let containers: Element[] = [];
  try {
    containers = [...root.querySelectorAll(selectors.join(','))];
  } catch {
    containers = [];
  }

  for (const element of containers) {
    if (site.skipSelectors.some((selector) => element.closest(selector))) continue;
    const background = win.getComputedStyle(element).backgroundImage;
    if (!background || background === 'none') continue;
    for (const url of extractBackgroundUrls(background, base)) {
      out.push({ url, source: 'background', width: 0, height: 0 });
    }
  }
}

/**
 * 同源 iframe 递归采集。
 * 淘宝的 desc 富文本、京东的详情长图常常在跨域 iframe 里 —— 跨域读不到 DOM，
 * 这部分只能依赖主文档里已经存在的 img/背景图，属已知限制。
 */
function scanIframes(site: SiteConfig, out: RawImage[]): void {
  document.querySelectorAll('iframe').forEach((element) => {
    const frame = element as HTMLIFrameElement;
    try {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win || !doc.body) return;
      scanRoot(doc, doc.baseURI, win, site, out, true);
    } catch {
      // 跨域 iframe：静默跳过
    }
  });
}

/**
 * 快速滚到底再滚回来，触发 IntersectionObserver 型懒加载。
 * 有总时间预算，长页面也不会把点击卡太久。
 */
async function triggerLazyLoad(): Promise<void> {
  const start = performance.now();
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const step = Math.max(400, Math.floor(window.innerHeight * 0.85));

  try {
    while (performance.now() - start < LAZY_SCROLL_BUDGET_MS) {
      const before = window.scrollY;
      window.scrollBy(0, step);
      await wait(70);
      // 已经到底，跳出
      if (window.scrollY === before) break;
    }
  } finally {
    window.scrollTo(originalX, originalY);
    await wait(120);
  }
}

async function probeUnknownSizes(images: CollectedImage[]): Promise<void> {
  const pending = images.filter((item) => item.width === 0);
  if (!pending.length) return;

  const deadline = performance.now() + PROBE_BUDGET_MS;
  await mapLimit(pending, PROBE_CONCURRENCY, async (item) => {
    if (performance.now() > deadline) return;
    await probeItem(item);
  });
}

/** 逐个试候选地址，第一个成功的就用来回填尺寸并替换 url */
async function probeItem(item: CollectedImage): Promise<void> {
  for (const candidate of item.candidates.slice(0, 3)) {
    const size = await loadImageSize(candidate);
    if (size) {
      item.url = candidate;
      item.width = size.width;
      item.height = size.height;
      item.broken = false;
      return;
    }
  }
  item.broken = true;
}

function loadImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // 部分 CDN 对站外 referer 会 403，探测时干脆不发 referer
    img.referrerPolicy = 'no-referrer';

    let settled = false;
    let timer = 0;

    const finish = (value: { width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(value);
    };

    timer = window.setTimeout(() => {
      img.src = '';
      finish(null);
    }, 4000);

    img.onload = () => finish(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

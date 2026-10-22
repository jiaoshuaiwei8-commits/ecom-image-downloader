import type { SiteId } from './types';

export interface RewriteRule {
  pattern: RegExp;
  replace: string;
  /**
   * true = 只作为「备选」地址生成，不参与首选地址的改写。
   * 用于那种「改了大概能拿到原图、但也可能直接 404」的规则。
   */
  fallbackOnly?: boolean;
}

export interface SiteConfig {
  id: SiteId;
  name: string;
  /** 下载文件名前缀 */
  shortName: string;
  /** 图片 CDN 域名，仅用于文档与排错 */
  imageHosts: string[];
  /** 判断当前地址是否为「商品详情页」 */
  isDetailPage: (url: URL) => boolean;
  /** background-image 扫描范围：只扫关键容器，避免全量遍历拖慢页面 */
  containerSelectors: string[];
  /** 跳过区域（logo / 图标 / 头像） */
  skipSelectors: string[];
  /** 缩略图 → 原图的改写规则 */
  rewrites: RewriteRule[];
}

/**
 * 淘宝 / 天猫（alicdn）常见缩略图后缀：
 *   xxx.jpg_430x430q90.jpg  →  xxx.jpg
 *   xxx.jpg_50x50xz.jpg     →  xxx.jpg
 *   xxx.jpg_.webp           →  xxx.jpg
 *   xxx.jpg_q90.jpg         →  xxx.jpg
 * 规则按顺序反复应用（最多 3 轮），因为后缀可能叠加。
 */
const ALI_REWRITES: RewriteRule[] = [
  { pattern: /\.(jpe?g|png|webp|avif)_\.(?:webp|avif)$/i, replace: '.$1' },
  { pattern: /_\d{2,4}x\d{2,4}[a-z0-9]*(?:\.(?:jpe?g|png|webp|avif))?$/i, replace: '' },
  { pattern: /_(?:q\d+|sum|b|pc|s\d+|v\d+)(?:\.(?:jpe?g|png|webp|avif))?$/i, replace: '' },
];

/**
 * 京东（360buyimg）：
 *   /s300x300_jfs/xxx.jpg  →  /jfs/xxx.jpg     （去掉尺寸段即原图，最可靠）
 *   /n0/jfs/xxx.jpg        →  /jfs/xxx.jpg     （n0/n1/n2 尺寸段，作为备选）
 *   xxx.jpg!q70.dpg.webp   →  xxx.jpg
 *   xxx.jpg.avif           →  xxx.jpg
 */
const JD_REWRITES: RewriteRule[] = [
  { pattern: /\/s\d{2,4}x\d{2,4}_jfs\//i, replace: '/jfs/' },
  { pattern: /![a-z]+\d+\.[a-z0-9.]+$/i, replace: '' },
  { pattern: /\.(jpe?g|png|webp)\.(?:avif|webp|dpg)$/i, replace: '.$1' },
  { pattern: /\/n\d{1,2}\//i, replace: '/', fallbackOnly: true },
];

/**
 * 拼多多（pddpic / mms 素材）：
 *   xxx.jpeg.a.jpeg        →  xxx.jpeg
 *   xxx.png_800x800.png    →  xxx.png
 *   xxx.jpg_.webp          →  xxx.jpg
 */
const PDD_REWRITES: RewriteRule[] = [
  { pattern: /\.(jpe?g|png|webp)\.a\.(?:jpe?g|png|webp|avif)$/i, replace: '.$1' },
  { pattern: /_\d{2,4}x\d{2,4}(?:\.(?:jpe?g|png|webp|avif))?$/i, replace: '' },
  { pattern: /_\.(?:webp|avif)$/i, replace: '' },
  { pattern: /\.(jpe?g|png)\.(?:webp|avif)$/i, replace: '.$1' },
];

export const SITES: Record<SiteId, SiteConfig> = {
  taobao: {
    id: 'taobao',
    name: '淘宝 / 天猫',
    shortName: 'taobao',
    imageHosts: ['img.alicdn.com', 'gw.alicdn.com', 'img.taobaocdn.com', 'img.tbcdn.cn'],
    isDetailPage(url) {
      const hostOk = /(^|\.)taobao\.com$|(^|\.)tmall\.com$/.test(url.hostname);
      if (!hostOk) return false;
      return /\/item\.htm/i.test(url.pathname) || url.searchParams.has('id');
    },
    containerSelectors: [
      '#J_UlThumb',
      '#J_UlThumb li',
      '.tb-thumb',
      '.tb-gallery',
      '.tb-pic',
      '#J_ImgBooth',
      '[class*="thumbnail"]',
      '[class*="Thumbnail"]',
    ],
    skipSelectors: ['[class*="logo"]', '[class*="icon"]', 'svg', '[class*="avatar"]'],
    rewrites: ALI_REWRITES,
  },

  jd: {
    id: 'jd',
    name: '京东',
    shortName: 'jd',
    imageHosts: ['img14.360buyimg.com', 'img30.360buyimg.com', 'm.360buyimg.com'],
    isDetailPage(url) {
      const hostOk = /(^|\.)jd\.com$|(^|\.)jd\.hk$/.test(url.hostname);
      if (!hostOk) return false;
      // 商品详情页形如 item.jd.com/100012043978.html
      return /\/\d+\.html$/.test(url.pathname);
    },
    containerSelectors: [
      '#spec-list',
      '#spec-list li',
      '.spec-items',
      '.spec-items li',
      '#preview',
      '.main-img',
      '[class*="thumb"]',
    ],
    skipSelectors: ['[class*="logo"]', '[class*="icon"]', 'svg', '[class*="avatar"]'],
    rewrites: JD_REWRITES,
  },

  pdd: {
    id: 'pdd',
    name: '拼多多商家版',
    shortName: 'pdd',
    imageHosts: ['img.pddpic.com', 'promotion.pddpic.com', 'commimg.pddpic.com'],
    isDetailPage(url) {
      if (url.hostname !== 'mms.pinduoduo.com') return false;
      // 商家后台：商品详情 / 商品编辑 / 商品发布
      return /\/goods\//i.test(url.pathname);
    },
    containerSelectors: [
      '[class*="goods-img"]',
      '[class*="goodsImg"]',
      '[class*="image-list"]',
      '[class*="img-list"]',
      '[class*="upload"]',
    ],
    skipSelectors: ['[class*="logo"]', '[class*="icon"]', 'svg', '[class*="avatar"]'],
    rewrites: PDD_REWRITES,
  },
};

/** 按 URL 匹配站点；不在支持列表内返回 null */
export function matchSite(href: string): SiteConfig | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  for (const site of Object.values(SITES)) {
    if (site.isDetailPage(url)) return site;
  }
  // 兜底：至少判断域名，供 SPA 页面（拼多多商家版）延迟进入详情页时使用
  if (url.hostname === 'mms.pinduoduo.com') return SITES.pdd;
  if (/item\.taobao\.com$|detail\.tmall\.com$/.test(url.hostname)) return SITES.taobao;
  if (/item\.jd\.com$|item\.jd\.hk$/.test(url.hostname)) return SITES.jd;
  return null;
}

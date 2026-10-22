/** 站点标识 */
export type SiteId = 'taobao' | 'jd' | 'pdd';

/** 图片的来源类型，用于预览页的「按来源筛选」 */
export type ImageSourceKind = 'img' | 'lazy' | 'srcset' | 'picture' | 'background' | 'iframe';

export interface CollectedImage {
  /** 归一化后的原图地址（首选） */
  url: string;
  /** 备选原图地址：首选加载失败时逐个回退 */
  candidates: string[];
  /** 去重键（host + path，去协议与查询参数） */
  key: string;
  /** 0 表示尚未探测到真实尺寸 */
  width: number;
  height: number;
  source: ImageSourceKind;
  /** 所有候选地址都加载失败 */
  broken: boolean;
}

export interface CollectResult {
  site: SiteId;
  siteName: string;
  /** 文件名前缀，如 taobao / jd / pdd */
  shortName: string;
  pageUrl: string;
  pageTitle: string;
  images: CollectedImage[];
  collectedAt: number;
  /** 扫描到的原始候选数量（含被过滤的） */
  scanned: number;
  /** 被过滤掉的数量 */
  trimmed: number;
}

export type Message =
  | { type: 'COLLECT_DONE'; payload: CollectResult }
  | { type: 'FETCH_IMAGE'; payload: { url: string } };

export interface FetchImageResult {
  ok: boolean;
  /** data:image/...;base64,... —— 用 data URL 而不是 ArrayBuffer，因为 runtime 消息是 JSON 序列化的 */
  dataUrl?: string;
  mime?: string;
  error?: string;
}

export interface OpenPreviewResult {
  ok: boolean;
  error?: string;
}

/** 采集结果在 chrome.storage.session 中的键名 */
export const STORAGE_KEY = 'eid:lastResult';

import type { CollectResult, FetchImageResult, Message, OpenPreviewResult } from '@shared/types';
import { STORAGE_KEY } from '@shared/types';
import { createTab, setSessionValue } from '@shared/chrome';

/** 单张图片的大小上限，超过就放弃（防止把 200MB 的图塞进消息里） */
const MAX_BYTES = 30 * 1024 * 1024;

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'COLLECT_DONE') {
    void handleCollectDone(message.payload)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true; // 异步响应
  }

  if (message.type === 'FETCH_IMAGE') {
    void fetchAsDataUrl(message.payload.url)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  }

  return false;
});

/**
 * 采集完成：结果写进 session storage（内存态，关浏览器即清），然后开预览页。
 * 之所以不把数据塞进 URL：上千张图的 JSON 会超长，而且会泄漏到历史记录里。
 */
async function handleCollectDone(result: CollectResult): Promise<OpenPreviewResult> {
  await setSessionValue<CollectResult>(STORAGE_KEY, result);
  await createTab(chrome.runtime.getURL('preview/index.html'));
  return { ok: true };
}

/**
 * 下载代理：预览页是扩展 origin，直接 fetch 图片域名会撞 CORS，
 * 而 canvas 一旦被跨域图片污染就再也导不出 PNG。
 * 这里用 host_permissions 在 Service Worker 里取字节，转成 dataURL 回传，
 * 预览页拿到的是「同源 dataURL」，canvas 永远不会被污染。
 */
async function fetchAsDataUrl(url: string): Promise<FetchImageResult> {
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: '不支持的图片地址' };
  }

  let lastError = '图片下载失败';
  // 先带 cookie（拼多多商家版素材需要登录态），失败再不带 cookie 重试
  for (const credentials of ['include', 'omit'] as const) {
    try {
      const response = await fetch(url, { credentials, redirect: 'follow' });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        lastError = '图片为空';
        continue;
      }
      if (buffer.byteLength > MAX_BYTES) {
        return { ok: false, error: '图片超过 30MB，已跳过' };
      }
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || guessMime(url);
      return { ok: true, mime, dataUrl: `data:${mime};base64,${arrayBufferToBase64(buffer)}` };
    } catch (error) {
      lastError = errorMessage(error);
    }
  }

  return { ok: false, error: lastError };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x2000; // 分块，避免 apply 参数过多导致栈溢出
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function guessMime(url: string): string {
  if (/\.png$/i.test(url)) return 'image/png';
  if (/\.webp$/i.test(url)) return 'image/webp';
  if (/\.avif$/i.test(url)) return 'image/avif';
  if (/\.gif$/i.test(url)) return 'image/gif';
  return 'image/jpeg';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

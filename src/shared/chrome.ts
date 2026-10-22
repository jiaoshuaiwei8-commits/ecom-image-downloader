/**
 * 把 chrome.* 的回调式 API 包成 Promise。
 * 统一在这里处理 chrome.runtime.lastError，避免每个调用点重复写。
 */

export function createTab(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

export function setSessionValue<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

export function getSessionValue<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.session.get(key, (items) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(items[key] as T | undefined);
    });
  });
}

export function downloadFile(options: chrome.downloads.DownloadOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error || downloadId === undefined) {
        reject(new Error(error?.message ?? '下载失败'));
      } else {
        resolve(downloadId);
      }
    });
  });
}

/** 把 blob 存成文件。用 blob URL 而不是 data URL：大图不会撑爆 URL 长度限制 */
export async function saveBlob(blob: Blob, filename: string): Promise<number> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await downloadFile({ url: objectUrl, filename, saveAs: false, conflictAction: 'uniquify' });
  } finally {
    // 等待下载真正开始后再回收，否则 Chrome 可能拿到已失效的 URL
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

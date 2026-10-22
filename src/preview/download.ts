import type { FetchImageResult } from '@shared/types';
import { convertToPng, dataUrlToBlob } from '@shared/png';
import { createZip, type ZipEntry } from '@shared/zip';
import { saveBlob } from '@shared/chrome';
import { mapLimit } from '@shared/utils';

export interface DownloadTask {
  url: string;
  filename: string;
}

export interface Progress {
  done: number;
  total: number;
  failed: number;
}

export interface DownloadOutcome {
  succeeded: number;
  failed: DownloadTask[];
}

export interface DownloadOptions {
  /** 透明背景压成白底 */
  flattenWhite: boolean;
}

/** 并发数：太高容易被 CDN 限流，3~4 是实测比较稳的区间 */
const CONCURRENCY = 3;

/**
 * 向 background 要图片字节。
 * 拿回来的是 dataURL，所以后续 canvas 绘制不会被跨域污染。
 */
async function fetchImageBlob(url: string): Promise<Blob> {
  const response = (await chrome.runtime.sendMessage({
    type: 'FETCH_IMAGE',
    payload: { url },
  })) as FetchImageResult | undefined;

  if (!response?.ok || !response.dataUrl) {
    throw new Error(response?.error ?? '获取图片失败');
  }
  return dataUrlToBlob(response.dataUrl);
}

/** 原图字节 → 真正的 PNG blob */
export async function toPngBlob(url: string, flattenWhite: boolean): Promise<Blob> {
  const source = await fetchImageBlob(url);
  const { blob } = await convertToPng(source, { flattenWhite });
  return blob;
}

/** 逐张转 PNG 并触发下载 */
export async function downloadTasks(
  tasks: DownloadTask[],
  options: DownloadOptions,
  onProgress: (progress: Progress) => void,
): Promise<DownloadOutcome> {
  let done = 0;
  let succeeded = 0;
  const failed: DownloadTask[] = [];

  await mapLimit(tasks, CONCURRENCY, async (task) => {
    try {
      const png = await toPngBlob(task.url, options.flattenWhite);
      await saveBlob(png, task.filename);
      succeeded += 1;
    } catch (error) {
      console.warn('[eid] 下载失败：', task.url, error);
      failed.push(task);
    } finally {
      done += 1;
      onProgress({ done, total: tasks.length, failed: failed.length });
    }
  });

  return { succeeded, failed };
}

/** 全部转 PNG 后打包成一个 zip */
export async function downloadZip(
  tasks: DownloadTask[],
  options: DownloadOptions,
  zipName: string,
  onProgress: (progress: Progress) => void,
): Promise<DownloadOutcome> {
  let done = 0;
  let succeeded = 0;
  const failed: DownloadTask[] = [];
  const entries: ZipEntry[] = [];

  await mapLimit(tasks, CONCURRENCY, async (task) => {
    try {
      const png = await toPngBlob(task.url, options.flattenWhite);
      entries.push({ name: task.filename, data: new Uint8Array(await png.arrayBuffer()) });
      succeeded += 1;
    } catch (error) {
      console.warn('[eid] 打包失败：', task.url, error);
      failed.push(task);
    } finally {
      done += 1;
      onProgress({ done, total: tasks.length, failed: failed.length });
    }
  });

  if (entries.length) {
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    await saveBlob(createZip(entries), zipName);
  }

  return { succeeded, failed };
}

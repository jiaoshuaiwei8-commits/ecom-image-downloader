export interface PngResult {
  blob: Blob;
  width: number;
  height: number;
}

export interface PngOptions {
  /** 铺白底：源图有透明通道时会被压成白底，默认关闭以保留透明度 */
  flattenWhite?: boolean;
}

/**
 * 任意格式（JPEG / WebP / AVIF / PNG）→ 真正的 PNG 字节流。
 *
 * 关键点：这里的输入必须是 blob / dataURL（不能是跨域 URL），
 * 否则 canvas 会被污染，转换时直接抛 SecurityError。
 * 所以图片字节统一由 background 用 host 权限 fetch 回来。
 */
export async function convertToPng(source: Blob, options: PngOptions = {}): Promise<PngResult> {
  const bitmap = await createImageBitmap(source);
  const { width, height } = bitmap;
  const flatten = options.flattenWhite ?? false;

  // 优先 OffscreenCanvas：不占 DOM，转换更快
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (flatten) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return { blob, width, height };
    }
  }

  // 回退：普通 canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 canvas 上下文');

  if (flatten) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('PNG 编码失败'))),
      'image/png',
    );
  });
  return { blob, width, height };
}

/** dataURL → Blob（预览页里把 background 返回的 base64 还原成字节） */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

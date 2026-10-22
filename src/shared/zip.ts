/**
 * 极简 ZIP 写入器：只用 store（不压缩）模式。
 * PNG 本身已是压缩格式，再套 deflate 几乎没收益，所以不引入 JSZip。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * TS 5.7 起 Uint8Array 带了 ArrayBufferLike 泛型，和 BlobPart 要求的 ArrayBuffer 不兼容。
 * 运行时这里始终是普通 ArrayBuffer，所以显式收窄一次。
 */
function asBlobPart(view: Uint8Array): BlobPart {
  return view as unknown as BlobPart;
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  const now = new Date();
  const dosTime = (((now.getHours() << 11) | (now.getMinutes() << 5) | ((now.getSeconds() / 2) | 0)) & 0xffff) >>> 0;
  const dosDate = ((((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff) >>> 0;

  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // ---- 本地文件头 ----
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // flag: 文件名为 UTF-8
    view.setUint16(8, 0, true); // method: store
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    parts.push(asBlobPart(header), asBlobPart(entry.data));

    // ---- 中央目录项 ----
    const dir = new Uint8Array(46 + nameBytes.length);
    const dirView = new DataView(dir.buffer);
    dirView.setUint32(0, 0x02014b50, true);
    dirView.setUint16(4, 20, true); // version made by
    dirView.setUint16(6, 20, true); // version needed
    dirView.setUint16(8, 0x0800, true);
    dirView.setUint16(10, 0, true);
    dirView.setUint16(12, dosTime, true);
    dirView.setUint16(14, dosDate, true);
    dirView.setUint32(16, crc, true);
    dirView.setUint32(20, size, true);
    dirView.setUint32(24, size, true);
    dirView.setUint16(28, nameBytes.length, true);
    dirView.setUint16(30, 0, true);
    dirView.setUint16(32, 0, true);
    dirView.setUint16(34, 0, true);
    dirView.setUint16(36, 0, true);
    dirView.setUint32(38, 0, true);
    dirView.setUint32(42, offset, true);
    dir.set(nameBytes, 46);
    central.push(dir);

    offset += header.length + size;
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...parts, ...central.map(asBlobPart), asBlobPart(end)], { type: 'application/zip' });
}

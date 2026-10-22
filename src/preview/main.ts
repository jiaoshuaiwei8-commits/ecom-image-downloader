import './style.css';
import type { CollectedImage, CollectResult } from '@shared/types';
import { STORAGE_KEY } from '@shared/types';
import { getSessionValue } from '@shared/chrome';
import { buildFileName, slugifyTitle } from '@shared/filename';
import { thumbnailUrl } from '@shared/imageUrl';
import { Lightbox } from './lightbox';
import { downloadTasks, downloadZip, type DownloadTask, type Progress } from './download';

interface Item extends CollectedImage {
  selected: boolean;
}

interface State {
  result: CollectResult | null;
  items: Item[];
  cards: HTMLElement[];
  minSize: number;
  source: string;
  whiten: boolean;
  busy: boolean;
  failed: DownloadTask[];
  slug: string;
}

const state: State = {
  result: null,
  items: [],
  cards: [],
  minSize: 0,
  source: 'all',
  whiten: false,
  busy: false,
  failed: [],
  slug: '商品',
};

const SOURCE_LABELS: Record<string, string> = {
  img: 'img',
  lazy: '懒加载',
  srcset: 'srcset',
  picture: 'picture',
  background: '背景图',
  iframe: 'iframe',
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少节点 #${id}`);
  return element as T;
}

const dom = {
  subtitle: byId<HTMLParagraphElement>('subtitle'),
  grid: byId<HTMLDivElement>('grid'),
  empty: byId<HTMLDivElement>('empty'),
  noMatch: byId<HTMLDivElement>('no-match'),
  filterSize: byId<HTMLSelectElement>('filter-size'),
  filterSource: byId<HTMLSelectElement>('filter-source'),
  optWhite: byId<HTMLInputElement>('opt-white'),
  selectedCount: byId<HTMLElement>('selected-count'),
  progressText: byId<HTMLElement>('progress-text'),
  progress: byId<HTMLDivElement>('progress'),
  progressBar: byId<HTMLDivElement>('progress-bar'),
  download: byId<HTMLButtonElement>('download'),
  zip: byId<HTMLButtonElement>('zip'),
  retry: byId<HTMLButtonElement>('retry'),
};

const lightbox = new Lightbox();

/* ------------------------------------------------------------------ */
/* 初始化                                                              */
/* ------------------------------------------------------------------ */

async function boot(): Promise<void> {
  const result = await getSessionValue<CollectResult>(STORAGE_KEY);

  if (!result || !result.images?.length) {
    dom.empty.hidden = false;
    dom.subtitle.textContent = '没有采集结果';
    return;
  }

  state.result = result;
  state.slug = slugifyTitle(result.pageTitle, '商品');
  state.items = result.images.map((image) => ({
    ...image,
    // 默认选中「大图或尺寸未知」的图，避免一进来就把图标类小图全勾上
    selected: image.width === 0 || image.width >= 400,
  }));

  dom.subtitle.textContent = `${result.siteName} · ${result.pageTitle} · 共 ${result.images.length} 张（过滤掉 ${result.trimmed} 个图标/重复项）`;

  renderGrid();
  syncSelection();
  applyFilter();
}

/* ------------------------------------------------------------------ */
/* 网格渲染                                                            */
/* ------------------------------------------------------------------ */

function renderGrid(): void {
  const fragment = document.createDocumentFragment();

  state.items.forEach((item, index) => {
    const card = createCard(item, index);
    fragment.appendChild(card);
    state.cards.push(card);
  });

  dom.grid.appendChild(fragment);
}

function createCard(item: Item, index: number): HTMLElement {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.index = String(index);
  if (item.selected) card.classList.add('selected');

  const thumb = document.createElement('div');
  thumb.className = 'thumb';

  const meta = document.createElement('div');
  meta.className = 'meta';
  renderMeta(meta, item);

  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  // 网格里先走 CDN 缩略图，原图留到下载和灯箱再用，1200 张图也不会拖爆内存
  image.src = thumbnailUrl(item.url, state.result?.site ?? 'taobao');

  let fallbackTried = item.url === image.src;
  image.addEventListener('load', () => {
    thumb.dataset.loaded = '1';
    if (!item.width && image.naturalWidth > 0) {
      item.width = image.naturalWidth;
      item.height = image.naturalHeight;
      renderMeta(meta, item);
      scheduleFilter();
    }
  });
  image.addEventListener('error', () => {
    // 缩略图地址失效时回退原图，原图也失败才标记坏图
    if (!fallbackTried) {
      fallbackTried = true;
      image.src = item.url;
      return;
    }
    card.classList.add('broken');
    item.broken = true;
    renderMeta(meta, item);
  });

  thumb.appendChild(image);

  const check = document.createElement('label');
  check.className = 'check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = item.selected;
  box.addEventListener('change', () => {
    item.selected = box.checked;
    card.classList.toggle('selected', item.selected);
    syncSelection();
  });
  check.appendChild(box);

  const zoom = document.createElement('button');
  zoom.type = 'button';
  zoom.className = 'zoom';
  zoom.title = '查看大图';
  zoom.textContent = '⤢';

  card.append(thumb, check, meta, zoom);

  card.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.check')) return;
    if (target === image || target.closest('.zoom')) {
      openLightbox(index);
      return;
    }
    // 点卡片空白处 = 切换选中
    item.selected = !item.selected;
    box.checked = item.selected;
    card.classList.toggle('selected', item.selected);
    syncSelection();
  });

  return card;
}

function renderMeta(meta: HTMLElement, item: Item): void {
  meta.replaceChildren();

  const dim = document.createElement('span');
  dim.className = 'dim';
  if (item.broken) dim.textContent = '无法加载';
  else if (item.width && item.height) dim.textContent = `${item.width} × ${item.height}`;
  else dim.textContent = '尺寸未知';

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = SOURCE_LABELS[item.source] ?? item.source;

  meta.append(dim, tag);
}

/* ------------------------------------------------------------------ */
/* 筛选                                                                */
/* ------------------------------------------------------------------ */

function matches(item: Item): boolean {
  if (state.source !== 'all' && item.source !== state.source) return false;
  if (state.minSize > 0) {
    // 尺寸还不知道的图先不参与尺寸筛选，等它加载完会重新判断
    if (!item.width) return false;
    if (Math.max(item.width, item.height) < state.minSize) return false;
  }
  return true;
}

let filterQueued = false;

function scheduleFilter(): void {
  if (filterQueued) return;
  filterQueued = true;
  requestAnimationFrame(() => {
    filterQueued = false;
    applyFilter();
  });
}

function applyFilter(): void {
  let visible = 0;
  state.cards.forEach((card, index) => {
    const show = matches(state.items[index]);
    card.hidden = !show;
    if (show) visible += 1;
  });

  dom.noMatch.hidden = visible > 0 || state.items.length === 0;
}

/* ------------------------------------------------------------------ */
/* 选择                                                                */
/* ------------------------------------------------------------------ */

function syncSelection(): void {
  let count = 0;
  for (const item of state.items) if (item.selected) count += 1;

  dom.selectedCount.textContent = `已选 ${count} 张`;
  dom.download.disabled = count === 0 || state.busy;
  dom.zip.disabled = count === 0 || state.busy;
}

function bulkSelect(action: 'all' | 'none' | 'invert'): void {
  state.items.forEach((item, index) => {
    if (action === 'all') item.selected = true;
    else if (action === 'none') item.selected = false;
    else item.selected = !item.selected;

    const card = state.cards[index];
    card.classList.toggle('selected', item.selected);
    const box = card.querySelector<HTMLInputElement>('.check input');
    if (box) box.checked = item.selected;
  });
  syncSelection();
}

/* ------------------------------------------------------------------ */
/* 灯箱                                                                */
/* ------------------------------------------------------------------ */

function openLightbox(index: number): void {
  const entries = state.items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item }) => matches(item));

  const position = entries.findIndex((entry) => entry.itemIndex === index);
  lightbox.open(
    entries.map((entry) => entry.item.url),
    position < 0 ? 0 : position,
  );
}

/* ------------------------------------------------------------------ */
/* 下载                                                                */
/* ------------------------------------------------------------------ */

function selectedTasks(): DownloadTask[] {
  const selected = state.items.filter((item) => item.selected);
  const result = state.result!;
  return selected.map((item, index) => ({
    url: item.url,
    filename: buildFileName(result.shortName, state.slug, index + 1, selected.length),
  }));
}

function setBusy(busy: boolean, label?: string): void {
  state.busy = busy;
  dom.download.textContent = busy ? (label ?? '处理中…') : '下载为 PNG';
  dom.zip.textContent = busy ? '处理中…' : '打包下载 ZIP';

  if (busy) {
    dom.download.disabled = true;
    dom.zip.disabled = true;
    dom.progress.hidden = false;
    dom.progressBar.style.width = '0%';
  } else {
    syncSelection();
  }
}

function updateProgress(progress: Progress): void {
  const percent = progress.total ? (progress.done / progress.total) * 100 : 0;
  dom.progress.hidden = false;
  dom.progressBar.style.width = `${percent}%`;
  dom.progressText.textContent = `已完成 ${progress.done} / ${progress.total}${
    progress.failed ? ` · 失败 ${progress.failed}` : ''
  }`;
}

function finishProgress(succeeded: number, failed: DownloadTask[]): void {
  dom.progressText.textContent =
    failed.length > 0 ? `完成 ${succeeded} 张，失败 ${failed.length} 张` : `已完成 ${succeeded} 张`;
  state.failed = failed;
  dom.retry.hidden = failed.length === 0;
}

async function runDownload(tasks: DownloadTask[], label: string): Promise<void> {
  if (state.busy || !tasks.length) return;
  setBusy(true, label);
  try {
    const outcome = await downloadTasks(tasks, { flattenWhite: state.whiten }, updateProgress);
    finishProgress(outcome.succeeded, outcome.failed);
  } finally {
    setBusy(false);
  }
}

async function runZip(tasks: DownloadTask[]): Promise<void> {
  if (state.busy || !tasks.length) return;
  const result = state.result!;
  setBusy(true, '正在打包…');
  try {
    const outcome = await downloadZip(
      tasks,
      { flattenWhite: state.whiten },
      `${result.shortName}-${state.slug}.zip`,
      updateProgress,
    );
    finishProgress(outcome.succeeded, outcome.failed);
  } finally {
    setBusy(false);
  }
}

/* ------------------------------------------------------------------ */
/* 事件绑定                                                            */
/* ------------------------------------------------------------------ */

document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((button) => {
  button.addEventListener('click', () => {
    bulkSelect(button.dataset.act as 'all' | 'none' | 'invert');
  });
});

dom.filterSize.addEventListener('change', () => {
  state.minSize = Number(dom.filterSize.value) || 0;
  applyFilter();
});

dom.filterSource.addEventListener('change', () => {
  state.source = dom.filterSource.value;
  applyFilter();
});

dom.optWhite.addEventListener('change', () => {
  state.whiten = dom.optWhite.checked;
});

dom.download.addEventListener('click', () => {
  void runDownload(selectedTasks(), '下载中…');
});

dom.zip.addEventListener('click', () => {
  const tasks = selectedTasks();
  if (tasks.length > 200 && !confirm(`即将转换并打包 ${tasks.length} 张 PNG，可能需要较长时间，继续吗？`)) {
    return;
  }
  void runZip(tasks);
});

dom.retry.addEventListener('click', () => {
  const tasks = state.failed;
  dom.retry.hidden = true;
  void runDownload(tasks, '重试中…');
});

void boot();

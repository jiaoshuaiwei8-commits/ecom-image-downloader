/**
 * 右下角悬浮按钮。
 * 全部样式包在 Shadow DOM 里 —— 淘宝/京东的全局 CSS 极其野蛮，
 * 裸 div 会被改得面目全非，也容易反过来污染页面。
 */

const POSITION_KEY = 'eid:fabPosition';
const MARGIN = 16;

export interface FloatingButtonHandle {
  setLoading(loading: boolean): void;
  flash(message: string, kind?: 'info' | 'error'): void;
  setVisible(visible: boolean): void;
}

interface SavedPosition {
  left: number;
  top: number;
}

const STYLE = `
  :host { all: initial; }
  .wrap {
    position: fixed;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .fab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    padding: 0 22px;
    border: 0;
    border-radius: 999px;
    background: #1f2430;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: .5px;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(15, 18, 26, .28);
    transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
    user-select: none;
    touch-action: none;
  }
  .fab:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(15, 18, 26, .34); }
  .fab:active { transform: translateY(0) scale(.98); }
  .fab[disabled] { cursor: progress; background: #3b4252; }
  .spinner {
    display: none;
    width: 16px; height: 16px;
    border: 2px solid rgba(255, 255, 255, .35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: eid-spin .8s linear infinite;
  }
  .fab[data-loading="1"] .spinner { display: block; }
  @keyframes eid-spin { to { transform: rotate(360deg); } }
  .toast {
    position: absolute;
    right: 0;
    bottom: 60px;
    max-width: 260px;
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(31, 36, 48, .96);
    color: #fff;
    font-size: 13px;
    line-height: 1.5;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity .2s ease, transform .2s ease;
    pointer-events: none;
    white-space: normal;
  }
  .toast[data-show="1"] { opacity: 1; transform: translateY(0); }
  .toast[data-kind="error"] { background: rgba(178, 44, 44, .97); }
  .wrap[data-hidden="1"] { display: none; }
`;

export function mountButton(onClick: () => void): FloatingButtonHandle {
  const host = document.createElement('div');
  host.id = 'eid-fab-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${STYLE}</style>
    <div class="wrap" data-hidden="1">
      <div class="toast" data-show="0"></div>
      <button class="fab" type="button">
        <span class="spinner"></span>
        <span class="label">获取图片</span>
      </button>
    </div>
  `;

  document.documentElement.appendChild(host);

  const wrap = shadow.querySelector<HTMLElement>('.wrap')!;
  const button = shadow.querySelector<HTMLButtonElement>('.fab')!;
  const label = shadow.querySelector<HTMLElement>('.label')!;
  const toast = shadow.querySelector<HTMLElement>('.toast')!;

  let toastTimer = 0;
  let dragged = false;

  // ---------- 位置：默认右下角，拖动后记住 ----------
  const applyPosition = (position: SavedPosition | null) => {
    if (!position) {
      wrap.style.right = '24px';
      wrap.style.bottom = '24px';
      return;
    }
    const left = Math.min(Math.max(position.left, MARGIN), window.innerWidth - 140);
    const top = Math.min(Math.max(position.top, MARGIN), window.innerHeight - 80);
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  };

  applyPosition(null);

  chrome.storage.local.get(POSITION_KEY, (items) => {
    const saved = items[POSITION_KEY] as SavedPosition | undefined;
    if (saved) applyPosition(saved);
  });

  // ---------- 拖动 ----------
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let pointerId = -1;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    dragged = false;
    const rect = wrap.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originLeft = rect.left;
    originTop = rect.top;
    button.setPointerCapture(pointerId);
  });

  button.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragged && Math.hypot(dx, dy) < 4) return;

    dragged = true;
    const left = Math.min(Math.max(originLeft + dx, MARGIN), window.innerWidth - 140);
    const top = Math.min(Math.max(originTop + dy, MARGIN), window.innerHeight - 80);
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  });

  const endDrag = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = -1;
    if (!dragged) return;
    const rect = wrap.getBoundingClientRect();
    chrome.storage.local.set({ [POSITION_KEY]: { left: rect.left, top: rect.top } });
  };
  button.addEventListener('pointerup', endDrag);
  button.addEventListener('pointercancel', endDrag);

  button.addEventListener('click', () => {
    // 拖动结束的那次 click 不算点击
    if (dragged) {
      dragged = false;
      return;
    }
    onClick();
  });

  return {
    setLoading(loading) {
      button.dataset.loading = loading ? '1' : '0';
      button.disabled = loading;
      label.textContent = loading ? '采集中…' : '获取图片';
    },
    flash(message, kind = 'info') {
      toast.textContent = message;
      toast.dataset.kind = kind;
      toast.dataset.show = '1';
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.dataset.show = '0';
      }, 3200);
    },
    setVisible(visible) {
      wrap.dataset.hidden = visible ? '0' : '1';
    },
  };
}

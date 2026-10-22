/**
 * 大图预览灯箱：左右方向键切换、Esc 关闭、点击遮罩关闭。
 * 只展示当前筛选条件下可见的图片，避免翻到被过滤掉的图。
 */
export class Lightbox {
  private root: HTMLDivElement;
  private image: HTMLImageElement;
  private counter: HTMLSpanElement;
  private urls: string[] = [];
  private index = 0;
  private onKeyDown = (event: KeyboardEvent) => this.handleKey(event);

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'lightbox';
    this.root.dataset.open = '0';
    this.root.innerHTML = `
      <button type="button" class="lb-btn close" aria-label="关闭">✕</button>
      <button type="button" class="lb-btn prev" aria-label="上一张">‹</button>
      <img alt="" />
      <button type="button" class="lb-btn next" aria-label="下一张">›</button>
      <span class="counter"></span>
    `;
    document.body.appendChild(this.root);

    this.image = this.root.querySelector('img')!;
    this.counter = this.root.querySelector<HTMLSpanElement>('.counter')!;

    this.root.querySelector('.close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.prev')!.addEventListener('click', (event) => {
      event.stopPropagation();
      this.step(-1);
    });
    this.root.querySelector('.next')!.addEventListener('click', (event) => {
      event.stopPropagation();
      this.step(1);
    });
    // 点击遮罩（而不是图片本身）关闭
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
  }

  open(urls: string[], index: number): void {
    if (!urls.length) return;
    this.urls = urls;
    this.index = Math.max(0, Math.min(index, urls.length - 1));
    this.render();
    this.root.dataset.open = '1';
    document.addEventListener('keydown', this.onKeyDown);
  }

  close(): void {
    this.root.dataset.open = '0';
    this.image.removeAttribute('src');
    document.removeEventListener('keydown', this.onKeyDown);
  }

  private step(delta: number): void {
    if (!this.urls.length) return;
    this.index = (this.index + delta + this.urls.length) % this.urls.length;
    this.render();
  }

  private render(): void {
    this.image.src = this.urls[this.index];
    this.counter.textContent = `${this.index + 1} / ${this.urls.length}`;
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.step(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.step(1);
    }
  }
}

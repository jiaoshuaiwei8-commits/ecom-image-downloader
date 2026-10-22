import { matchSite } from '@shared/sites';
import { mountButton } from './button';
import { collectImages } from './collector';

declare global {
  interface Window {
    __EID_LOADED__?: boolean;
  }
}

interface SendResponse {
  ok?: boolean;
  error?: string;
}

function main(): void {
  // 同一页面可能被注入两次（扩展更新 / bfcache 恢复），加个守卫
  if (window.__EID_LOADED__) return;

  const site = matchSite(location.href);
  if (!site) return;
  window.__EID_LOADED__ = true;

  let busy = false;
  const button = mountButton(() => {
    void run();
  });

  async function run(): Promise<void> {
    if (busy) return;
    busy = true;
    button.setLoading(true);

    try {
      const result = await collectImages(site!);

      if (!result.images.length) {
        button.flash('没找到可下载的图片，先往下滚一下页面再试', 'error');
        return;
      }

      const response = (await chrome.runtime.sendMessage({
        type: 'COLLECT_DONE',
        payload: result,
      })) as SendResponse | undefined;

      if (response?.ok) {
        button.flash(`已提取 ${result.images.length} 张图片，正在打开预览…`);
      } else {
        button.flash(response?.error ?? '打开预览页失败，请重试', 'error');
      }
    } catch (error) {
      button.flash(error instanceof Error ? error.message : '采集失败，请重试', 'error');
    } finally {
      button.setLoading(false);
      busy = false;
    }
  }

  // 拼多多商家版是 SPA：从列表页点进商品详情不会重新加载页面，
  // 所以按钮显隐要跟着路由变化实时更新。
  const refreshVisibility = () => {
    button.setVisible(site.isDetailPage(new URL(location.href)));
  };

  refreshVisibility();
  window.addEventListener('popstate', refreshVisibility);
  window.setInterval(refreshVisibility, 1500);
}

main();

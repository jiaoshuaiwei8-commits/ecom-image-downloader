(function() {
  "use strict";
  const ALI_REWRITES = [
    { pattern: /\.(jpe?g|png|webp|avif)_\.(?:webp|avif)$/i, replace: ".$1" },
    { pattern: /_\d{2,4}x\d{2,4}[a-z0-9]*(?:\.(?:jpe?g|png|webp|avif))?$/i, replace: "" },
    { pattern: /_(?:q\d+|sum|b|pc|s\d+|v\d+)(?:\.(?:jpe?g|png|webp|avif))?$/i, replace: "" }
  ];
  const JD_REWRITES = [
    { pattern: /\/s\d{2,4}x\d{2,4}_jfs\//i, replace: "/jfs/" },
    { pattern: /![a-z]+\d+\.[a-z0-9.]+$/i, replace: "" },
    { pattern: /\.(jpe?g|png|webp)\.(?:avif|webp|dpg)$/i, replace: ".$1" },
    { pattern: /\/n\d{1,2}\//i, replace: "/", fallbackOnly: true }
  ];
  const PDD_REWRITES = [
    { pattern: /\.(jpe?g|png|webp)\.a\.(?:jpe?g|png|webp|avif)$/i, replace: ".$1" },
    { pattern: /_\d{2,4}x\d{2,4}(?:\.(?:jpe?g|png|webp|avif))?$/i, replace: "" },
    { pattern: /_\.(?:webp|avif)$/i, replace: "" },
    { pattern: /\.(jpe?g|png)\.(?:webp|avif)$/i, replace: ".$1" }
  ];
  const SITES = {
    taobao: {
      id: "taobao",
      name: "淘宝 / 天猫",
      shortName: "taobao",
      imageHosts: ["img.alicdn.com", "gw.alicdn.com", "img.taobaocdn.com", "img.tbcdn.cn"],
      isDetailPage(url) {
        const hostOk = /(^|\.)taobao\.com$|(^|\.)tmall\.com$/.test(url.hostname);
        if (!hostOk) return false;
        return /\/item\.htm/i.test(url.pathname) || url.searchParams.has("id");
      },
      containerSelectors: [
        "#J_UlThumb",
        "#J_UlThumb li",
        ".tb-thumb",
        ".tb-gallery",
        ".tb-pic",
        "#J_ImgBooth",
        '[class*="thumbnail"]',
        '[class*="Thumbnail"]'
      ],
      skipSelectors: ['[class*="logo"]', '[class*="icon"]', "svg", '[class*="avatar"]'],
      rewrites: ALI_REWRITES
    },
    jd: {
      id: "jd",
      name: "京东",
      shortName: "jd",
      imageHosts: ["img14.360buyimg.com", "img30.360buyimg.com", "m.360buyimg.com"],
      isDetailPage(url) {
        const hostOk = /(^|\.)jd\.com$|(^|\.)jd\.hk$/.test(url.hostname);
        if (!hostOk) return false;
        return /\/\d+\.html$/.test(url.pathname);
      },
      containerSelectors: [
        "#spec-list",
        "#spec-list li",
        ".spec-items",
        ".spec-items li",
        "#preview",
        ".main-img",
        '[class*="thumb"]'
      ],
      skipSelectors: ['[class*="logo"]', '[class*="icon"]', "svg", '[class*="avatar"]'],
      rewrites: JD_REWRITES
    },
    pdd: {
      id: "pdd",
      name: "拼多多商家版",
      shortName: "pdd",
      imageHosts: ["img.pddpic.com", "promotion.pddpic.com", "commimg.pddpic.com"],
      isDetailPage(url) {
        if (url.hostname !== "mms.pinduoduo.com") return false;
        return /\/goods\//i.test(url.pathname);
      },
      containerSelectors: [
        '[class*="goods-img"]',
        '[class*="goodsImg"]',
        '[class*="image-list"]',
        '[class*="img-list"]',
        '[class*="upload"]'
      ],
      skipSelectors: ['[class*="logo"]', '[class*="icon"]', "svg", '[class*="avatar"]'],
      rewrites: PDD_REWRITES
    }
  };
  function matchSite(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    for (const site of Object.values(SITES)) {
      if (site.isDetailPage(url)) return site;
    }
    if (url.hostname === "mms.pinduoduo.com") return SITES.pdd;
    if (/item\.taobao\.com$|detail\.tmall\.com$/.test(url.hostname)) return SITES.taobao;
    if (/item\.jd\.com$|item\.jd\.hk$/.test(url.hostname)) return SITES.jd;
    return null;
  }
  const POSITION_KEY = "eid:fabPosition";
  const MARGIN = 16;
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
  function mountButton(onClick) {
    const host = document.createElement("div");
    host.id = "eid-fab-host";
    const shadow = host.attachShadow({ mode: "open" });
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
    const wrap = shadow.querySelector(".wrap");
    const button = shadow.querySelector(".fab");
    const label = shadow.querySelector(".label");
    const toast = shadow.querySelector(".toast");
    let toastTimer = 0;
    let dragged = false;
    const applyPosition = (position) => {
      if (!position) {
        wrap.style.right = "24px";
        wrap.style.bottom = "24px";
        return;
      }
      const left = Math.min(Math.max(position.left, MARGIN), window.innerWidth - 140);
      const top = Math.min(Math.max(position.top, MARGIN), window.innerHeight - 80);
      wrap.style.left = `${left}px`;
      wrap.style.top = `${top}px`;
      wrap.style.right = "auto";
      wrap.style.bottom = "auto";
    };
    applyPosition(null);
    chrome.storage.local.get(POSITION_KEY, (items) => {
      const saved = items[POSITION_KEY];
      if (saved) applyPosition(saved);
    });
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let pointerId = -1;
    button.addEventListener("pointerdown", (event) => {
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
    button.addEventListener("pointermove", (event) => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!dragged && Math.hypot(dx, dy) < 4) return;
      dragged = true;
      const left = Math.min(Math.max(originLeft + dx, MARGIN), window.innerWidth - 140);
      const top = Math.min(Math.max(originTop + dy, MARGIN), window.innerHeight - 80);
      wrap.style.left = `${left}px`;
      wrap.style.top = `${top}px`;
      wrap.style.right = "auto";
      wrap.style.bottom = "auto";
    });
    const endDrag = (event) => {
      if (pointerId !== event.pointerId) return;
      pointerId = -1;
      if (!dragged) return;
      const rect = wrap.getBoundingClientRect();
      chrome.storage.local.set({ [POSITION_KEY]: { left: rect.left, top: rect.top } });
    };
    button.addEventListener("pointerup", endDrag);
    button.addEventListener("pointercancel", endDrag);
    button.addEventListener("click", () => {
      if (dragged) {
        dragged = false;
        return;
      }
      onClick();
    });
    return {
      setLoading(loading) {
        button.dataset.loading = loading ? "1" : "0";
        button.disabled = loading;
        label.textContent = loading ? "采集中…" : "获取图片";
      },
      flash(message, kind = "info") {
        toast.textContent = message;
        toast.dataset.kind = kind;
        toast.dataset.show = "1";
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
          toast.dataset.show = "0";
        }, 3200);
      },
      setVisible(visible) {
        wrap.dataset.hidden = visible ? "0" : "1";
      }
    };
  }
  const NOISE_PATTERN = /(?:spacer|transparent|1x1|pixel\.(?:gif|png)|blank\.(?:gif|png)|placeholder|sprite|loading\.(?:gif|png|svg))/i;
  const TRANSFORM_PARAMS = /^(?:imageMogr2|imageView2|imageView|imageslim|x-oss-process|thumbnail|resize|quality|compress|param)$/i;
  function absoluteUrl(raw, base) {
    if (!raw) return null;
    const value = raw.trim().replace(/^['"]|['"]$/g, "");
    if (!value) return null;
    if (/^(?:data:|blob:|javascript:|about:)/i.test(value)) return null;
    const normalized = value.startsWith("//") ? `https:${value}` : value;
    try {
      const url = new URL(normalized, base);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.href;
    } catch {
      return null;
    }
  }
  function stripTransformQuery(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return href;
    }
    let touched = false;
    for (const key of [...url.searchParams.keys()]) {
      if (TRANSFORM_PARAMS.test(key)) {
        url.searchParams.delete(key);
        touched = true;
      }
    }
    if (!touched) return href;
    return url.search;
  }
  function restoreOriginal(href, site) {
    const cleaned = stripTransformQuery(href);
    let primary = cleaned;
    for (let pass = 0; pass < 3; pass += 1) {
      let changed = false;
      for (const rule of site.rewrites) {
        if (rule.fallbackOnly) continue;
        const next = primary.replace(rule.pattern, rule.replace);
        if (next !== primary) {
          primary = next;
          changed = true;
        }
      }
      if (!changed) break;
    }
    const fallbacks = [];
    for (const rule of site.rewrites) {
      if (!rule.fallbackOnly) continue;
      const next = primary.replace(rule.pattern, rule.replace);
      if (next !== primary) fallbacks.push(next);
    }
    const bare = primary.split("?")[0];
    if (bare !== primary) fallbacks.push(bare);
    const candidates = dedupe([primary, ...fallbacks]);
    return { primary, candidates };
  }
  function dedupeKey(href) {
    try {
      const url = new URL(href);
      return `${url.hostname}${url.pathname}`.toLowerCase();
    } catch {
      return href.split("?")[0].toLowerCase();
    }
  }
  function isNoiseImage(href) {
    return NOISE_PATTERN.test(href);
  }
  function pickLargestFromSrcset(srcset, base) {
    const parts = srcset.split(",").map((s) => s.trim()).filter(Boolean);
    let best = null;
    for (const part of parts) {
      const [rawUrl, descriptor] = part.split(/\s+/);
      const url = absoluteUrl(rawUrl, base);
      if (!url) continue;
      let score = 1;
      if (descriptor) {
        const w = /^(\d+)w$/i.exec(descriptor);
        const x = /^([\d.]+)x$/i.exec(descriptor);
        if (w) score = Number(w[1]);
        else if (x) score = Number(x[1]) * 1e3;
      }
      if (!best || score > best.score) best = { url, score };
    }
    return best?.url ?? null;
  }
  function extractBackgroundUrls(value, base) {
    const urls = [];
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    let match;
    while (match = re.exec(value)) {
      const url = absoluteUrl(match[2], base);
      if (url) urls.push(url);
    }
    return urls;
  }
  function dedupe(list) {
    return [...new Set(list)];
  }
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function mapLimit(items, limit, task) {
    const results = new Array(items.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await task(items[index], index);
      }
    };
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }
  const IMG_ATTRS = [
    ["src", "img"],
    ["data-src", "lazy"],
    ["data-lazy-src", "lazy"],
    ["data-lazyload", "lazy"],
    ["data-ks-lazyload", "lazy"],
    ["data-original", "lazy"],
    ["data-url", "lazy"],
    ["data-img", "lazy"],
    ["data-image", "lazy"]
  ];
  const MIN_SIZE = 100;
  const PROBE_CONCURRENCY = 6;
  const PROBE_BUDGET_MS = 1200;
  const LAZY_SCROLL_BUDGET_MS = 2e3;
  async function collectImages(site) {
    await triggerLazyLoad();
    const raws = [];
    scanRoot(document, document.baseURI, window, site, raws, false);
    scanIframes(site, raws);
    const byKey = /* @__PURE__ */ new Map();
    let trimmed = 0;
    for (const raw of raws) {
      const { primary, candidates } = restoreOriginal(raw.url, site);
      if (isNoiseImage(primary)) {
        trimmed += 1;
        continue;
      }
      if (raw.width > 0 && raw.height > 0 && raw.width < MIN_SIZE && raw.height < MIN_SIZE) {
        trimmed += 1;
        continue;
      }
      const key = dedupeKey(primary);
      if (!key) {
        trimmed += 1;
        continue;
      }
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          url: primary,
          candidates,
          key,
          width: raw.width,
          height: raw.height,
          source: raw.source,
          broken: false
        });
        continue;
      }
      if (raw.width * raw.height > existing.width * existing.height) {
        existing.width = raw.width;
        existing.height = raw.height;
      }
    }
    const images = [...byKey.values()];
    await probeUnknownSizes(images);
    images.sort((a, b) => b.width * b.height - a.width * a.height);
    return {
      site: site.id,
      siteName: site.name,
      shortName: site.shortName,
      pageUrl: location.href,
      pageTitle: document.title,
      images,
      collectedAt: Date.now(),
      scanned: raws.length,
      trimmed
    };
  }
  function scanRoot(root, base, win, site, out, fromFrame) {
    root.querySelectorAll("img").forEach((element) => {
      const img = element;
      const width = img.naturalWidth || 0;
      const height = img.naturalHeight || 0;
      for (const [attr, kind] of IMG_ATTRS) {
        const url = absoluteUrl(img.getAttribute(attr), base);
        if (url) out.push({ url, source: fromFrame ? "iframe" : kind, width, height });
      }
      const srcset = img.getAttribute("srcset") ?? img.getAttribute("data-srcset");
      if (srcset) {
        const url = pickLargestFromSrcset(srcset, base);
        if (url) out.push({ url, source: fromFrame ? "iframe" : "srcset", width, height });
      }
    });
    root.querySelectorAll("picture source").forEach((element) => {
      const url = pickLargestFromSrcset(element.getAttribute("srcset") ?? "", base);
      if (url) out.push({ url, source: "picture", width: 0, height: 0 });
    });
    const selectors = [...site.containerSelectors, '[style*="background"]'];
    let containers = [];
    try {
      containers = [...root.querySelectorAll(selectors.join(","))];
    } catch {
      containers = [];
    }
    for (const element of containers) {
      if (site.skipSelectors.some((selector) => element.closest(selector))) continue;
      const background = win.getComputedStyle(element).backgroundImage;
      if (!background || background === "none") continue;
      for (const url of extractBackgroundUrls(background, base)) {
        out.push({ url, source: "background", width: 0, height: 0 });
      }
    }
  }
  function scanIframes(site, out) {
    document.querySelectorAll("iframe").forEach((element) => {
      const frame = element;
      try {
        const doc = frame.contentDocument;
        const win = frame.contentWindow;
        if (!doc || !win || !doc.body) return;
        scanRoot(doc, doc.baseURI, win, site, out, true);
      } catch {
      }
    });
  }
  async function triggerLazyLoad() {
    const start = performance.now();
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const step = Math.max(400, Math.floor(window.innerHeight * 0.85));
    try {
      while (performance.now() - start < LAZY_SCROLL_BUDGET_MS) {
        const before = window.scrollY;
        window.scrollBy(0, step);
        await wait(70);
        if (window.scrollY === before) break;
      }
    } finally {
      window.scrollTo(originalX, originalY);
      await wait(120);
    }
  }
  async function probeUnknownSizes(images) {
    const pending = images.filter((item) => item.width === 0);
    if (!pending.length) return;
    const deadline = performance.now() + PROBE_BUDGET_MS;
    await mapLimit(pending, PROBE_CONCURRENCY, async (item) => {
      if (performance.now() > deadline) return;
      await probeItem(item);
    });
  }
  async function probeItem(item) {
    for (const candidate of item.candidates.slice(0, 3)) {
      const size = await loadImageSize(candidate);
      if (size) {
        item.url = candidate;
        item.width = size.width;
        item.height = size.height;
        item.broken = false;
        return;
      }
    }
    item.broken = true;
  }
  function loadImageSize(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      let settled = false;
      let timer = 0;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(value);
      };
      timer = window.setTimeout(() => {
        img.src = "";
        finish(null);
      }, 4e3);
      img.onload = () => finish(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
      img.onerror = () => finish(null);
      img.src = url;
    });
  }
  function main() {
    if (window.__EID_LOADED__) return;
    const site = matchSite(location.href);
    if (!site) return;
    window.__EID_LOADED__ = true;
    let busy = false;
    const button = mountButton(() => {
      void run();
    });
    async function run() {
      if (busy) return;
      busy = true;
      button.setLoading(true);
      try {
        const result = await collectImages(site);
        if (!result.images.length) {
          button.flash("没找到可下载的图片，先往下滚一下页面再试", "error");
          return;
        }
        const response = await chrome.runtime.sendMessage({
          type: "COLLECT_DONE",
          payload: result
        });
        if (response?.ok) {
          button.flash(`已提取 ${result.images.length} 张图片，正在打开预览…`);
        } else {
          button.flash(response?.error ?? "打开预览页失败，请重试", "error");
        }
      } catch (error) {
        button.flash(error instanceof Error ? error.message : "采集失败，请重试", "error");
      } finally {
        button.setLoading(false);
        busy = false;
      }
    }
    const refreshVisibility = () => {
      button.setVisible(site.isDetailPage(new URL(location.href)));
    };
    refreshVisibility();
    window.addEventListener("popstate", refreshVisibility);
    window.setInterval(refreshVisibility, 1500);
  }
  main();
})();

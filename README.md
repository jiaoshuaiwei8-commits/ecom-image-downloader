# 电商图片提取下载器（Chrome 扩展）

在淘宝 / 天猫 / 京东 / 拼多多商家版的商品详情页点一下右下角按钮，把页面里的商品图全部抓出来，在独立预览页勾选后批量下载为 **PNG**。

- Manifest V3 + TypeScript + Vite，前端零框架（原生 DOM + CSS）
- 采集结果在扩展自己的页面里展示，不受站点 CSP 干扰
- 图片字节由 Service Worker 代取，彻底绕开 canvas 跨域污染

---

## 一、方案概述

```
content script（注入按钮 + 采集）
        │  chrome.runtime.sendMessage(COLLECT_DONE)
        ▼
background service worker  ──►  chrome.storage.session  ──►  打开 preview/index.html
        ▲
        │  FETCH_IMAGE（带 host 权限 fetch 图片原始字节，转 dataURL 回传）
        ▼
preview 页（网格展示 / 勾选 / 转 PNG / chrome.downloads / 自研 zip）
```

选型理由：

| 决策 | 原因 |
| --- | --- |
| 不用 `@crxjs/vite-plugin` | 三次独立的 `vite build` 就够用，产物结构完全可控，少一个易变的插件依赖 |
| 内容脚本用 IIFE 单文件 | MV3 的内容脚本不支持 ESM import，必须打平 |
| 预览页用独立 HTML 入口 | 扩展页面拥有完整 `chrome.*` 权限，可直接调 `chrome.downloads` |
| 图片字节走 background | 预览页 fetch 图片域名会触发 CORS，canvas 被污染后 `toBlob` 直接失败 |
| 自研 store 模式 zip | PNG 已压缩，deflate 无收益；省掉 JSZip 依赖 |
| 网格用 CDN 缩略图 | 1200 张原图会吃掉几百 MB 内存，缩略图 + `loading="lazy"` + `content-visibility` 才扛得住 |

目录结构：

```
电商图片下载器/
├── public/manifest.json            # MV3 清单（构建时复制到 dist 根目录）
├── scripts/
│   ├── clean.mjs                   # 构建前清空 dist
│   └── dev.mjs                     # 并行 watch 三个构建目标
├── src/
│   ├── shared/
│   │   ├── types.ts                # 消息协议与数据类型
│   │   ├── sites.ts                # 站点配置表：匹配规则 / 容器选择器 / 原图还原规则
│   │   ├── imageUrl.ts             # URL 归一化、缩略图还原、去重键、缩略图地址
│   │   ├── filename.ts             # 商品标题 → 安全文件名
│   │   ├── chrome.ts               # chrome.* 回调 API 的 Promise 封装 + saveBlob
│   │   ├── png.ts                  # 任意格式 → 真正的 PNG（OffscreenCanvas）
│   │   ├── zip.ts                  # 极简 ZIP 写入器（store 模式）
│   │   └── utils.ts                # mapLimit / wait
│   ├── content/
│   │   ├── index.ts                # 注入入口、SPA 路由下的按钮显隐
│   │   ├── button.ts               # Shadow DOM 悬浮按钮（可拖动、记忆位置）
│   │   └── collector.ts            # 采集：懒加载、srcset、背景图、iframe、尺寸探测
│   ├── background/index.ts         # 消息路由、图片代理、打开预览页
│   └── preview/
│       ├── index.html              # 预览页骨架
│       ├── main.ts                 # 网格渲染、筛选、选择、下载调度
│       ├── download.ts             # 转 PNG + 并发下载 / 打包
│       ├── lightbox.ts             # 大图预览灯箱
│       └── style.css               # 亮/暗色主题、响应式网格
├── vite.config.ts                  # 三种构建目标
├── tsconfig.json
└── package.json
```

---

## 二、构建与加载

> 仓库里已经放了一份构建好的 `dist/`，只想装来用的话可以跳过构建，直接看下面的「加载扩展」。

```bash
npm install
npm run build      # 产物在 dist/
# 或者开发模式（保存即重新构建，无 HMR）
npm run dev
```

加载扩展：

1. 打开 `chrome://extensions`，右上角打开「开发者模式」。
2. 点「加载已解压的扩展程序」，选择本项目的 **`dist` 目录**（不是项目根目录）。
3. 修改代码后：`npm run build` → 回到 `chrome://extensions` 点该扩展卡片上的刷新按钮 → 刷新业务页面。

`dist/` 的产物结构：

```
dist/
├── manifest.json
├── content.js
├── background.js
└── preview/
    ├── index.html
    └── assets/*.js|css
```

---

## 三、各站点的采集策略

### 淘宝 / 天猫（`item.taobao.com`、`detail.tmall.com`）

- 详情页判定：域名为 `*.taobao.com` / `*.tmall.com`，且路径含 `item.htm` 或带 `id` 参数。
- 主图区容器：`#J_UlThumb`、`.tb-thumb`、`.tb-gallery`、`.tb-pic`。
- **已知坑**：主图缩略图是 `background-image` 而不是 `<img>`，所以要额外扫背景图；缩略列表懒加载，必须先滚动页面。
- 原图还原（`img.alicdn.com`）：

| 页面上的地址 | 还原后 |
| --- | --- |
| `xxx.jpg_430x430q90.jpg` | `xxx.jpg` |
| `xxx.jpg_50x50xz.jpg` | `xxx.jpg` |
| `xxx.jpg_q90.jpg` | `xxx.jpg` |
| `xxx.jpg_.webp` | `xxx.jpg` |

### 京东（`item.jd.com`、`item.jd.hk`、`npcitem.jd.hk`）

- 详情页判定：域名匹配，路径为 `/<商品ID>.html`。
- 主图区容器：`#spec-list`、`.spec-items`、`#preview`。
- 原图还原（`*.360buyimg.com`）：

| 页面上的地址 | 还原后 |
| --- | --- |
| `/s300x300_jfs/t1/xxx.jpg` | `/jfs/t1/xxx.jpg` |
| `/n0/jfs/t1/xxx.jpg` | `/jfs/t1/xxx.jpg`（作为**备选**，未必成立） |
| `xxx.jpg!q70.dpg.webp` | `xxx.jpg` |
| `xxx.jpg.avif` | `xxx.jpg` |

- **已知坑**：商品详情长图在 `desc` 的跨域 iframe 里，DOM 读不到，只能采到主文档已有的图。

### 拼多多商家版（`mms.pinduoduo.com`）

- 只需要商品相关页面：路径包含 `/goods/`（商品详情、商品编辑、商品发布）。
- 容器：`[class*="goods-img"]`、`[class*="image-list"]`、`[class*="upload"]`。
- 原图还原（`*.pddpic.com`）：

| 页面上的地址 | 还原后 |
| --- | --- |
| `xxx.jpeg.a.jpeg` | `xxx.jpeg` |
| `xxx.png_800x800.png` | `xxx.png` |
| `xxx.jpg_.webp` | `xxx.jpg` |
| `?imageMogr2/...` | 去掉查询参数 |

- **已知坑**：商家后台是 SPA，从列表点进详情页不会重新加载，所以按钮显隐每 1.5 秒跟随路由重算；素材图需要登录态，background 取字节时会带 cookie（失败再降级为不带 cookie 重试）。

---

## 四、验证清单

1. 打开淘宝/京东任意商品详情页，右下角应出现深色胶囊按钮「获取图片」。
2. 点击后按钮显示「采集中…」，页面自动快速滚动一遍（逼出懒加载图），随后新标签页打开预览。
3. 预览页顶部显示商品标题与张数，网格里出现图片卡片；卡片右下角显示真实分辨率与来源类型。
4. 点「全选」→「下载为 PNG」，底部显示 `已完成 x / y`；浏览器下载目录里出现 `taobao-商品标题-01.png`。
5. 用图片查看器确认文件类型是 **PNG**（不是改了后缀的 JPEG 字节流）。
6. 点「打包下载 ZIP」应得到一个可直接解压的 zip。
7. 拖动按钮到任意位置后刷新页面，位置应被记住。

---

## 五、本地自检脚本

```bash
node scripts/test-zip.mjs        # 生成一个测试 zip 并交给 Windows 解压，验证自研 zip 写入器
node scripts/preview-harness.mjs # 用桩数据把预览页跑在 http://localhost:5178/__harness.html
```

第二个脚本会把 `chrome.*` 和一份假采集结果注入构建产物，方便在没有真实商品页的情况下调 UI。

---

## 六、已知限制与后续方向

限制：

- **跨域 iframe 内的图取不到**（淘宝 desc 富文本、京东详情长图）。需要在 `manifest` 里给 iframe 域名加 `all_frames: true` 的内容脚本，或从商品接口拿图，属于下一步工作。
- **画中画/Canvas 渲染的主图**（少数活动页）无法从 DOM 采到。
- 需要登录态的图（拼多多素材、淘宝部分主图）依赖浏览器当前 cookie；未登录时会显示「无法加载」。
- 单张图上限 30MB；ZIP 一次打包建议不超过 300 张（内存占用）。
- 下载并发固定为 3，防止 CDN 限流；大量图片时整体耗时较长。
- ZIP 里中文文件名使用 UTF-8 标记，Windows 资源管理器老版本可能显示乱码，用 7-Zip / Bandizip 打开正常。

可扩展方向：

- 新站点：在 `src/shared/sites.ts` 增加一条配置（匹配规则 + 容器选择器 + 还原规则）即可接入 Amazon、1688、Shopify 等。
- 按颜色/尺寸分组：从商品规格接口取 SKU 数据，把图片按配色分目录打包。
- 相似图去重：计算图片 dHash，过滤同一张主图的不同尺寸版本。
- 采集历史：把每次结果存到 `chrome.storage.local`，预览页加一个历史侧栏。
- 一键复制图片直链 / 导出 CSV 清单。

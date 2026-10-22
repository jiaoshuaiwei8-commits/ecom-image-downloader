(function() {
  "use strict";
  const STORAGE_KEY = "eid:lastResult";
  function createTab(url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  function setSessionValue(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.set({ [key]: value }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  const MAX_BYTES = 30 * 1024 * 1024;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "COLLECT_DONE") {
      void handleCollectDone(message.payload).then(sendResponse).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }
    if (message.type === "FETCH_IMAGE") {
      void fetchAsDataUrl(message.payload.url).then(sendResponse).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }
    return false;
  });
  async function handleCollectDone(result) {
    await setSessionValue(STORAGE_KEY, result);
    await createTab(chrome.runtime.getURL("preview/index.html"));
    return { ok: true };
  }
  async function fetchAsDataUrl(url) {
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: "不支持的图片地址" };
    }
    let lastError = "图片下载失败";
    for (const credentials of ["include", "omit"]) {
      try {
        const response = await fetch(url, { credentials, redirect: "follow" });
        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          continue;
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0) {
          lastError = "图片为空";
          continue;
        }
        if (buffer.byteLength > MAX_BYTES) {
          return { ok: false, error: "图片超过 30MB，已跳过" };
        }
        const mime = response.headers.get("content-type")?.split(";")[0]?.trim() || guessMime(url);
        return { ok: true, mime, dataUrl: `data:${mime};base64,${arrayBufferToBase64(buffer)}` };
      } catch (error) {
        lastError = errorMessage(error);
      }
    }
    return { ok: false, error: lastError };
  }
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  function guessMime(url) {
    if (/\.png$/i.test(url)) return "image/png";
    if (/\.webp$/i.test(url)) return "image/webp";
    if (/\.avif$/i.test(url)) return "image/avif";
    if (/\.gif$/i.test(url)) return "image/gif";
    return "image/jpeg";
  }
  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }
})();

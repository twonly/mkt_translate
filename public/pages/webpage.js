const state = {
  config: null,
  fragments: [],
  currentFragmentIds: [],
  viewerDoc: null,
  ttsLoading: false
};

const els = {
  fetchForm: document.getElementById("fetch-form"),
  fetchBtn: document.getElementById("fetch-btn"),
  webUrl: document.getElementById("web-url"),
  viewerFrame: document.getElementById("viewer-frame"),
  viewerPlaceholder: document.getElementById("viewer-placeholder"),
  sidebarForm: document.getElementById("sidebar-form"),
  selectedText: document.getElementById("selected-text"),
  targetLanguage: document.getElementById("sidebar-target-language"),
  model: document.getElementById("sidebar-model"),
  glossary: document.getElementById("sidebar-glossary"),
  translateSelection: document.getElementById("translate-selection"),
  translateFull: document.getElementById("translate-full"),
  result: document.getElementById("sidebar-result"),
  ttsAudio: document.getElementById("sidebar-tts"),
  statusMessage: document.getElementById("status-message")
};

const apiFetch = async (url, options = {}) => {
  const config = {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  };

  if (options.body !== undefined) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  if (options.cache) {
    config.cache = options.cache;
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `请求失败 (${response.status})`);
  }

  return data;
};

const setStatus = (message, type = "info", duration = 4000) => {
  if (!els.statusMessage) return;
  els.statusMessage.textContent = message || "";
  els.statusMessage.dataset.type = type;
  if (duration > 0) {
    setTimeout(() => {
      if (els.statusMessage.textContent === message) {
        els.statusMessage.textContent = "";
        els.statusMessage.dataset.type = "";
      }
    }, duration);
  }
};

const populateSidebarConfig = (config) => {
  els.targetLanguage.innerHTML = config.languages
    .map(
      (lang) =>
        `<option value="${lang.value}">${lang.label}</option>`
    )
    .join("");
  els.targetLanguage.value = "ja-JP";

  els.model.innerHTML = config.models
    .map((model) => `<option value="${model.value}">${model.label}</option>`)
    .join("");

  state.config.ttsVoices = config.ttsVoices || [];
};

const initConfig = async () => {
  try {
    const config = await apiFetch("/api/config", { cache: "no-store" });
    state.config = config;
    populateSidebarConfig(config);
    setStatus("配置信息已加载", "success", 2500);
  } catch (error) {
    setStatus(error.message || "配置信息加载失败", "error", 6000);
  }
};

const renderPlaceholder = (text) => {
  els.viewerPlaceholder.textContent = text;
  els.viewerPlaceholder.hidden = false;
  els.viewerFrame.hidden = true;
};

const escapeHTML = (text = "") =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderPage = ({ rawHtml }) => {
  const doc = els.viewerFrame.contentDocument || els.viewerFrame.contentWindow.document;
  let htmlContent = rawHtml;
  if (!htmlContent || !htmlContent.trim()) {
    htmlContent = state.fragments
      .map(
        (fragment) =>
          `<div class="fragment-block" data-fragment-id="${fragment.id}">${escapeHTML(fragment.text)}</div>`
      )
      .join("");
    if (!htmlContent) {
      htmlContent = '<p style="color:#7d8aa6;text-align:center;margin-top:40px;">未解析到正文内容，请复制文本后翻译。</p>';
    }
  }

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><style>body{font-family:Inter,system-ui,sans-serif;padding:24px;max-width:860px;margin:0 auto;line-height:1.7;font-size:15px;color:#1a2233;background:#fff} h1,h2,h3{margin-top:24px}</style></head><body>${htmlContent}</body></html>`);
  doc.close();
  els.viewerPlaceholder.hidden = true;
  els.viewerFrame.hidden = false;
  state.viewerDoc = doc;
  attachSelectionHandlers();
};

const handleFetch = async (event) => {
  event.preventDefault();
  if (state.fetching) return;
  const url = els.webUrl.value.trim();
  if (!url) {
    setStatus("请输入有效的网址", "error");
    return;
  }
  state.fetching = true;
  els.fetchBtn.textContent = "抓取中...";
  setStatus("正在抓取网页，请稍候..." );
  try {
    const data = await apiFetch("/api/webpage/fetch", {
      method: "POST",
      body: { url }
    });
    state.fragments = data.textFragments || [];
    renderPage(data);
    setStatus("抓取成功，可在左侧圈选段落", "success", 3000);
  } catch (error) {
    renderPlaceholder("抓取失败，请检查网址或稍后再试。");
    setStatus(error.message || "抓取失败", "error", 6000);
  } finally {
    state.fetching = false;
    els.fetchBtn.textContent = "抓取网页";
  }
};

const attachSelectionHandlers = () => {
  if (!state.viewerDoc) return;
  const doc = state.viewerDoc;
  doc.addEventListener("mouseup", () => {
    const selection = doc.getSelection();
    if (!selection) return;
    const text = selection.toString().trim();
    if (!text) return;
    els.selectedText.value = text;
    setStatus("已填入选中的文本，可点击翻译", "info", 2500);
  });
  doc.querySelectorAll("[data-fragment-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const text = node.textContent.trim();
      if (!text) return;
      els.selectedText.value = text;
      setStatus("已选择段落，可点击翻译", "info", 2500);
    });
  });
};

const renderTranslation = (record) => {
  if (!record) {
    els.result.innerHTML = '<p class="placeholder">翻译后将在此展示译文。</p>';
    return;
  }
  const glossarySnapshot = record.glossarySnapshot || [];
  const highlighted = glossarySnapshot.reduce((acc, term) => {
    if (!term?.target) return acc;
    const regex = new RegExp(term.target, "g");
    return acc.replace(regex, `<mark class="glossary-hit">${term.target}</mark>`);
  }, record.translation?.text || "译文为空");

  els.result.innerHTML = `
    <div class="translation-text">${highlighted}</div>
  `;
};

const handleTranslate = async (sourceText) => {
  const payload = {
    sourceText,
    targetLanguage: els.targetLanguage.value,
    model: els.model.value,
    glossaryId: els.glossary.value || undefined,
    tone: state.config?.defaultTone,
    audience: state.config?.defaultAudience,
    domain: "官网内容"
  };

  try {
    const data = await apiFetch("/api/translate", {
      method: "POST",
      body: payload
    });
    const record = data.record;
    renderTranslation(record);
    state.currentRecord = record;
    setStatus("翻译完成，请确认译文", "success", 3000);
  } catch (error) {
    setStatus(error.message || "翻译失败", "error", 6000);
  }
};

const handleTranslateSelection = () => {
  const text = els.selectedText.value.trim();
  if (!text) {
    setStatus("请先在左侧圈选要翻译的内容", "error", 4000);
    return;
  }
  handleTranslate(text);
};

const handleTranslateFull = () => {
  if (!state.fragments.length) {
    setStatus("请先抓取网页再翻译整页", "error", 4000);
    return;
  }
  const text = state.fragments.map((frag) => frag.text).join("\n\n");
  els.selectedText.value = text;
  handleTranslate(text);
};

const handleTts = async () => {
  if (!state.currentRecord?.translation?.text || state.ttsLoading) return;
  state.ttsLoading = true;
  setStatus("正在生成语音...", "info", 2000);
  try {
    const voice = state.config.ttsVoices?.[0]?.id;
    const data = await apiFetch("/api/tts", {
      method: "POST",
      body: {
        text: state.currentRecord.translation.text,
        voiceId: voice,
        format: "mp3"
      }
    });
    if (data.url && els.ttsAudio) {
      els.ttsAudio.src = data.url;
      els.ttsAudio.hidden = false;
      await els.ttsAudio.play().catch(() => {});
    }
  } catch (error) {
    setStatus(error.message || "语音生成失败", "error", 4000);
  } finally {
    state.ttsLoading = false;
  }
};

const init = async () => {
  await initConfig();
  renderPlaceholder("请输入网址并抓取页面。");
  els.fetchForm.addEventListener("submit", handleFetch);
  els.translateSelection.addEventListener("click", handleTranslateSelection);
  els.translateFull.addEventListener("click", handleTranslateFull);
  els.ttsAudio?.addEventListener("play", () => setStatus("正在播放语音", "info", 1500));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.metaKey) {
      handleTranslateSelection();
    }
  });
  const ttsButton = document.createElement("button");
  ttsButton.textContent = "朗读译文";
  ttsButton.className = "ghost small";
  ttsButton.addEventListener("click", handleTts);
  els.result.parentElement?.querySelector(".card-header")?.appendChild(ttsButton);
};

window.addEventListener("load", init);

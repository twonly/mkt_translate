const state = {
  config: null,
  history: [],
  currentRecord: null,
  basePromptTemplate: "",
  defaultPrompt: "",
  savedDefaults: {},
  glossaries: [],
  glossaryDetails: {},
  glossaryDomains: [],
  selectedGlossaryId: "",
  filters: {
    search: "",
    starredOnly: false
  },
  statusTimer: null,
  isTranslating: false,
  isEvaluating: false
};

const els = {
  form: document.getElementById("translate-form"),
  sourceText: document.getElementById("source-text"),
  targetLanguage: document.getElementById("target-language"),
  model: document.getElementById("model"),
  domain: document.getElementById("domain"),
  domainOptions: document.getElementById("domain-options"),
  tone: document.getElementById("tone"),
  audience: document.getElementById("audience"),
  temperature: document.getElementById("temperature"),
  glossary: document.getElementById("glossary"),
  glossaryDomain: document.getElementById("glossary-domain"),
  glossarySelect: document.getElementById("glossary-select"),
  glossaryPreview: document.getElementById("glossary-preview"),
  glossaryPreviewBtn: document.getElementById("glossary-preview-btn"),
  prompt: document.getElementById("prompt"),
  resetPrompt: document.getElementById("reset-prompt-btn"),
  saveDefaultsBtn: document.getElementById("save-defaults-btn"),
  translateBtn: document.getElementById("translate-btn"),
  translationResult: document.getElementById("translation-result"),
  evaluationResult: document.getElementById("evaluation-result"),
  evaluateBtn: document.getElementById("evaluate-btn"),
  noteInput: document.getElementById("note-input"),
  saveNoteBtn: document.getElementById("save-note-btn"),
  historyList: document.getElementById("history-list"),
  historySearch: document.getElementById("history-search"),
  starFilter: document.getElementById("star-filter"),
  exportJsonBtn: document.getElementById("export-json-btn"),
  exportCsvBtn: document.getElementById("export-csv-btn"),
  statusMessage: document.getElementById("status-message")
};

const escapeHTML = (text = "") =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDateTime = (value) => {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

const formatDuration = (value) => {
  if (typeof value !== "number") return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
};

const formatUsage = (usage) => {
  if (!usage) return "—";
  const { prompt_tokens, completion_tokens, total_tokens } = usage;
  const parts = [];
  if (prompt_tokens !== undefined) {
    parts.push(`Prompt ${prompt_tokens}`);
  }
  if (completion_tokens !== undefined) {
    parts.push(`Completion ${completion_tokens}`);
  }
  if (total_tokens !== undefined) {
    parts.push(`Total ${total_tokens}`);
  }
  return parts.join(" · ") || "—";
};

const averageScore = (scores) => {
  if (!scores) return null;
  const values = Object.values(scores).filter(
    (item) => typeof item === "number" && !Number.isNaN(item)
  );
  if (!values.length) return null;
  return (values.reduce((acc, val) => acc + val, 0) / values.length).toFixed(1);
};

const ensureSelectOption = (selectElement, value, label = value) => {
  if (!selectElement || !value) return;
  const exists = Array.from(selectElement.options).some(
    (option) => option.value === value
  );
  if (!exists) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label || value;
    selectElement.appendChild(option);
  }
};

const ensureGlossaryOption = (id, label) => {
  if (!id) return;
  ensureSelectOption(els.glossarySelect, id, label);
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightGlossaryText = (text, glossaryEntries = []) => {
  if (!text) return "";
  const targets = glossaryEntries
    .map((entry) => (typeof entry === "string" ? entry : entry?.target))
    .filter(Boolean)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!targets.length) {
    return escapeHTML(text);
  }

  const uniqueTargets = Array.from(new Set(targets)).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(uniqueTargets.map((item) => escapeRegExp(item)).join("|"), "g");
  let lastIndex = 0;
  let result = "";

  text.replace(pattern, (match, offset) => {
    result += escapeHTML(text.slice(lastIndex, offset));
    result += `<mark class="glossary-hit">${escapeHTML(match)}</mark>`;
    lastIndex = offset + match.length;
    return match;
  });

  result += escapeHTML(text.slice(lastIndex));
  return result;
};

const applyDefaultsToForm = (defaults = {}) => {
  if (!defaults || typeof defaults !== "object") return;
  const {
    targetLanguage,
    model,
    tone,
    audience,
    domain,
    promptTemplate,
    temperature,
    glossaryId
  } = defaults;

  if (targetLanguage) {
    ensureSelectOption(els.targetLanguage, targetLanguage, targetLanguage);
    els.targetLanguage.value = targetLanguage;
  }
  if (model) {
    ensureSelectOption(els.model, model, model);
    els.model.value = model;
  }
  if (tone) {
    els.tone.value = tone;
  }
  if (audience) {
    els.audience.value = audience;
  }
  if (domain) {
    els.domain.value = domain;
  }
  if (typeof temperature === "number" && !Number.isNaN(temperature)) {
    els.temperature.value = temperature;
  }
  if (promptTemplate) {
    els.prompt.value = promptTemplate;
    state.defaultPrompt = promptTemplate;
  }
  if (glossaryId) {
    state.selectedGlossaryId = glossaryId;
  }
};

const formatDirection = (direction) => {
  if (!direction) return "";
  const from = direction.source || "";
  const to = direction.target || "";
  if (!from && !to) return "";
  return `${from}→${to}`;
};

const getFilteredGlossaries = () => {
  const target = els.targetLanguage.value;
  const domainFilter = els.glossaryDomain.value;
  return state.glossaries.filter((item) => {
    if (target && item.direction?.target && item.direction.target !== target) {
      return false;
    }
    if (domainFilter && item.domain !== domainFilter) {
      return false;
    }
    return true;
  });
};

const refreshGlossaryDomains = () => {
  const domains = Array.from(
    new Set(state.glossaries.map((item) => item.domain).filter(Boolean))
  ).sort();
  state.glossaryDomains = domains;
  els.glossaryDomain.innerHTML = `
    <option value="">全部领域</option>
    ${domains.map((domain) => `<option value="${domain}">${escapeHTML(domain)}</option>`).join("")}
  `;
};

const refreshGlossaryOptions = ({ preserveSelection = true, autoSelectFirst = true } = {}) => {
  const previous = preserveSelection ? state.selectedGlossaryId : "";
  const filtered = getFilteredGlossaries();

  const optionHtml = filtered
    .map((item) => {
      const label = `${escapeHTML(item.name)} · ${escapeHTML(
        formatDirection(item.direction)
      )} · ${item.termsCount}条`;
      return `<option value="${item.id}">${label}</option>`;
    })
    .join("");

  els.glossarySelect.innerHTML = `<option value="">不使用术语库</option>${optionHtml}`;

  let selected = previous;
  const isSelectedAvailable = filtered.some((item) => item.id === selected);

  if (!isSelectedAvailable) {
    selected = "";
  }

  if (!selected && autoSelectFirst && filtered.length) {
    selected = filtered[0].id;
  }

  state.selectedGlossaryId = selected;
  els.glossarySelect.value = selected || "";

  return { filtered, selected };
};

const renderGlossaryPreview = async (glossaryId) => {
  if (!glossaryId) {
    els.glossaryPreview.classList.add("placeholder");
    els.glossaryPreview.innerHTML =
      "不勾选术语库时，可继续使用下方自定义术语表。";
    return;
  }

  const cached = state.glossaryDetails[glossaryId];
  if (cached) {
    const previewTerms = cached.terms.slice(0, 5);
    els.glossaryPreview.classList.remove("placeholder");
    els.glossaryPreview.innerHTML = `
      <strong>${escapeHTML(cached.name)}</strong> · ${escapeHTML(
        cached.domain
      )} · ${escapeHTML(formatDirection(cached.direction))}
      <br />
      ${previewTerms
        .map(
          (term) =>
            `${escapeHTML(term.source)} <span style="color:var(--text-muted);">→</span> ${escapeHTML(term.target)}`
        )
        .join("<br />")}
      ${
        cached.terms.length > previewTerms.length
          ? `<br /><span class="badge">共 ${cached.terms.length} 条</span>`
          : ""
      }
    `;
    return;
  }

  els.glossaryPreview.classList.remove("placeholder");
  els.glossaryPreview.textContent = "术语加载中...";

  try {
    const data = await apiFetch(`/api/glossaries/${glossaryId}`);
    if (data.glossary) {
      state.glossaryDetails[glossaryId] = data.glossary;
      renderGlossaryPreview(glossaryId);
    } else {
      els.glossaryPreview.textContent = "未找到术语库详情";
    }
  } catch (error) {
    els.glossaryPreview.textContent = error.message || "术语加载失败";
  }
};

const setSelectedGlossary = (glossaryId, { updatePreview = true } = {}) => {
  state.selectedGlossaryId = glossaryId || "";
  els.glossarySelect.value = state.selectedGlossaryId;
  if (updatePreview) {
    renderGlossaryPreview(state.selectedGlossaryId);
  }
};

const loadGlossaries = async () => {
  const data = await apiFetch("/api/glossaries");
  state.glossaries = Array.isArray(data.items) ? data.items : [];
  refreshGlossaryDomains();
  const selectedItem = state.glossaries.find(
    (item) => item.id === state.selectedGlossaryId
  );
  if (selectedItem?.domain) {
    ensureSelectOption(els.glossaryDomain, selectedItem.domain, selectedItem.domain);
    els.glossaryDomain.value = selectedItem.domain;
  } else {
    els.glossaryDomain.value = "";
  }

  const { selected } = refreshGlossaryOptions({ preserveSelection: true, autoSelectFirst: true });
  setSelectedGlossary(selected, { updatePreview: true });
};

const handleGlossaryDomainChange = () => {
  const { selected } = refreshGlossaryOptions({ preserveSelection: true, autoSelectFirst: true });
  setSelectedGlossary(selected, { updatePreview: true });
};

const handleTargetLanguageChange = () => {
  const { selected } = refreshGlossaryOptions({ preserveSelection: false, autoSelectFirst: true });
  setSelectedGlossary(selected, { updatePreview: true });
};

const setStatus = (message = "", type = "info", duration = 3600) => {
  if (state.statusTimer) {
    clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }
  if (!message) {
    els.statusMessage.textContent = "";
    els.statusMessage.dataset.type = "";
    return;
  }
  els.statusMessage.textContent = message;
  els.statusMessage.dataset.type = type;
  if (duration > 0) {
    state.statusTimer = setTimeout(() => {
      if (els.statusMessage.textContent === message) {
        els.statusMessage.textContent = "";
        els.statusMessage.dataset.type = "";
      }
    }, duration);
  }
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

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.error || data?.message || `请求失败 (${response.status})`;
    throw new Error(errorMessage);
  }

  return data;
};

const populateConfig = (config) => {
  state.config = config;
  state.basePromptTemplate = config.defaultPromptTemplate;
  state.savedDefaults = config.savedDefaults || {};
  state.defaultPrompt =
    state.savedDefaults.promptTemplate || config.defaultPromptTemplate;

  els.targetLanguage.innerHTML = config.languages
    .map(
      (lang) =>
        `<option value="${lang.value}">${escapeHTML(lang.label)}</option>`
    )
    .join("");

  els.model.innerHTML = config.models
    .map(
      (model) =>
        `<option value="${model.value}">${escapeHTML(model.label)}</option>`
    )
    .join("");

  els.domainOptions.innerHTML = config.domains
    .map((domain) => `<option value="${escapeHTML(domain)}"></option>`)
    .join("");

  els.tone.placeholder = config.defaultTone;
  els.audience.placeholder = config.defaultAudience;
  els.prompt.value = state.defaultPrompt;

  applyDefaultsToForm(state.savedDefaults);
};

const upsertHistory = (record) => {
  const index = state.history.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    state.history[index] = record;
  } else {
    state.history.unshift(record);
  }
};

const getFilteredHistory = () => {
  const search = state.filters.search.trim().toLowerCase();
  const starredOnly = state.filters.starredOnly;

  return state.history.filter((record) => {
    if (starredOnly && !record.starred) return false;
    if (!search) return true;
    const candidates = [
      record.sourceText,
      record.translation?.text,
      record.userNote,
      record.targetLanguage,
      record.model
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return candidates.includes(search);
  });
};

const renderTranslation = () => {
  const container = els.translationResult;
  const record = state.currentRecord;

  if (!record) {
    container.innerHTML =
      '<p class="placeholder">完成翻译后将在此展示译文。</p>';
    return;
  }

  const metadata = record.translation?.metadata || {};
  const glossaryLibrary = record.glossaryLibrary;
  const glossarySnapshot = Array.isArray(record.glossarySnapshot)
    ? record.glossarySnapshot
    : [];
  const glossaryBadge = record.glossary
    ? `<span class="badge">术语表启用</span>`
    : "";
  const glossaryLibBadge = glossaryLibrary
    ? `<span class="badge">${escapeHTML(glossaryLibrary.name)} · ${escapeHTML(
        glossaryLibrary.domain || ""
      )}</span>`
    : "";
  const mockBadge = metadata.isMock ? `<span class="badge">MOCK</span>` : "";

  const glossaryListHtml = glossarySnapshot.length
    ? `<div class="glossary-preview"><strong>术语预览</strong><br />${glossarySnapshot
        .slice(0, 8)
        .map(
          (item) =>
            `${escapeHTML(item.source)} <span style="color:var(--text-muted);">→</span> ${escapeHTML(item.target)}`
        )
        .join("<br />")}${
        glossarySnapshot.length > 8
          ? `<br /><span class="badge">共 ${glossarySnapshot.length} 条</span>`
          : ""
      }</div>`
    : "";
  const translationText = record.translation?.text || "未获取到译文";
  const highlightedTranslation = highlightGlossaryText(
    translationText,
    glossarySnapshot
  );
  const glossaryHighlightNote = glossarySnapshot.length
    ? '<div class="glossary-explain">译文中带底色的词语来自所选术语库，方便核对术语命中情况。</div>'
    : "";

  container.innerHTML = `
    <div class="meta-grid">
      <div class="meta-item"><strong>目标语言</strong><br />${escapeHTML(
        record.targetLanguage || "—"
      )}</div>
      <div class="meta-item"><strong>模型</strong><br />${escapeHTML(
        record.model || "—"
      )}</div>
      <div class="meta-item"><strong>耗时</strong><br />${formatDuration(
        metadata.durationMs
      )}</div>
      <div class="meta-item"><strong>Token</strong><br />${formatUsage(
        metadata.usage
      )}</div>
      <div class="meta-item"><strong>温度</strong><br />${
        metadata.temperature ?? "—"
      }</div>
      <div class="meta-item"><strong>术语库</strong><br />${
        glossaryLibrary?.name
          ? `${escapeHTML(glossaryLibrary.name)} (${escapeHTML(
              formatDirection(glossaryLibrary.direction)
            )})`
          : "—"
      }</div>
    </div>
    <div class="translation-text">${highlightedTranslation}</div>
    ${glossaryHighlightNote}
    <div class="history-meta">
      ${record.domain ? `<span class="badge">${escapeHTML(record.domain)}</span>` : ""}
      ${record.tone ? `<span class="badge">${escapeHTML(record.tone)}</span>` : ""}
      ${record.audience ? `<span class="badge">${escapeHTML(record.audience)}</span>` : ""}
      ${glossaryBadge}
      ${glossaryLibBadge}
      ${mockBadge}
    </div>
    ${glossaryListHtml}
  `;
};

const renderEvaluation = () => {
  const container = els.evaluationResult;
  const record = state.currentRecord;

  if (!record) {
    container.innerHTML =
      '<p class="placeholder">点击“评估翻译”查看多维度评分。</p>';
    els.evaluateBtn.disabled = true;
    return;
  }

  els.evaluateBtn.disabled = false;

  const evaluation = record.evaluation;

  if (!evaluation) {
    container.innerHTML =
      '<p class="placeholder">尚未评估，请点击“评估翻译”。</p>';
    return;
  }

  if (evaluation.parseError) {
    container.innerHTML = `
      <div class="issues-list">
        <div class="issue-item">
          <strong>解析失败：</strong>${escapeHTML(
            evaluation.parseError
          )}<br />
          <span>${escapeHTML(evaluation.rawContent || "")}</span>
        </div>
      </div>
    `;
    return;
  }

  const scores = evaluation.scores || {};
  const avg = averageScore(scores);
  const issues = Array.isArray(evaluation.issues)
    ? evaluation.issues
    : [];
  const metadata = evaluation.metadata || {};

  container.innerHTML = `
    <div class="meta-grid">
      <div class="meta-item"><strong>平均分</strong><br />${avg ?? "—"}</div>
      <div class="meta-item"><strong>推荐动作</strong><br />${escapeHTML(
        evaluation.recommendation || "—"
      )}</div>
      <div class="meta-item"><strong>耗时</strong><br />${formatDuration(
        metadata.durationMs
      )}</div>
      <div class="meta-item"><strong>Token</strong><br />${formatUsage(
        metadata.usage
      )}</div>
    </div>
    <div class="evaluation-scores">
      <div class="score-card">
        <strong>${scores.accuracy ?? "—"}</strong>
        <div>语义准确度</div>
      </div>
      <div class="score-card">
        <strong>${scores.fluency ?? "—"}</strong>
        <div>语言流畅度</div>
      </div>
      <div class="score-card">
        <strong>${scores.toneConsistency ?? "—"}</strong>
        <div>语气一致性</div>
      </div>
      <div class="score-card">
        <strong>${scores.terminologyAndFormat ?? "—"}</strong>
        <div>术语/格式遵循</div>
      </div>
    </div>
    <div>
      <h3>整体点评</h3>
      <p>${escapeHTML(evaluation.overall_comment || "—")}</p>
    </div>
    <div>
      <h3>问题与建议</h3>
      ${
        issues.length
          ? `<div class="issues-list">
              ${issues
                .map(
                  (issue) => `
                    <div class="issue-item">
                      <strong>${escapeHTML(
                        issue.type || "issue"
                      )}</strong> · ${escapeHTML(issue.comment || "")}
                      ${
                        issue.excerpt
                          ? `<div style="margin-top:6px;font-size:12px;color:var(--text-primary);">片段：${escapeHTML(
                              issue.excerpt
                            )}</div>`
                          : ""
                      }
                    </div>
                  `
                )
                .join("")}
            </div>`
          : '<p class="placeholder">未发现明显问题。</p>'
      }
    </div>
  `;
};

const renderHistoryList = () => {
  const records = getFilteredHistory();
  const container = els.historyList;

  if (!records.length) {
    container.innerHTML =
      '<p class="placeholder">暂无符合条件的历史记录。</p>';
    return;
  }

  container.innerHTML = records
    .map((record) => {
      const evaluation = record.evaluation;
      const avgScore = evaluation ? averageScore(evaluation.scores) : null;
      const noteBadge = record.userNote
        ? `<span class="badge">已备注</span>`
        : "";
      const glossaryBadge = record.glossaryLibrary
        ? `<span class="badge">术语库 ${escapeHTML(record.glossaryLibrary.name)}</span>`
        : "";

      return `
        <div class="history-item" data-id="${record.id}">
          <div class="history-item-header">
            <div>
              <div class="history-meta">
                <span>${formatDateTime(record.createdAt)}</span>
                <span>${escapeHTML(record.targetLanguage || "—")}</span>
                <span>${escapeHTML(record.model || "—")}</span>
                ${
                  avgScore
                    ? `<span class="badge">评分 ${avgScore}</span>`
                    : ""
                }
                ${noteBadge}
                ${glossaryBadge}
              </div>
              <div class="history-snippet">
                ${escapeHTML(
                  (record.sourceText || "").slice(0, 80) ||
                    "（无原文）"
                )}
              </div>
            </div>
            <div class="history-item-actions">
              <button
                class="star-btn ${record.starred ? "active" : ""}"
                data-action="star"
                data-id="${record.id}"
              >
                ${record.starred ? "★ 星标" : "☆ 星标"}
              </button>
              <button
                class="secondary"
                data-action="load"
                data-id="${record.id}"
              >
                加载
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
};

const updateControls = () => {
  const hasRecord = Boolean(state.currentRecord);
  els.evaluateBtn.disabled = !hasRecord || state.isEvaluating;
  els.saveNoteBtn.disabled = !hasRecord;
  els.translateBtn.disabled = state.isTranslating;
};

const renderApp = () => {
  renderTranslation();
  renderEvaluation();
  renderHistoryList();
  updateControls();

  if (state.currentRecord) {
    els.noteInput.value = state.currentRecord.userNote || "";
  } else {
    els.noteInput.value = "";
  }

  els.glossarySelect.value = state.selectedGlossaryId || "";

  renderGlossaryPreview(state.selectedGlossaryId);
};

const handleTranslate = async (event) => {
  event.preventDefault();
  if (state.isTranslating) return;

  const payload = {
    sourceText: els.sourceText.value.trim(),
    targetLanguage: els.targetLanguage.value,
    model: els.model.value,
    domain: els.domain.value.trim(),
    tone: els.tone.value.trim() || els.tone.placeholder,
    audience: els.audience.value.trim() || els.audience.placeholder,
    temperature: Number.parseFloat(els.temperature.value) || 0.3,
    glossary: els.glossary.value.trim(),
    prompt: els.prompt.value,
    glossaryId: state.selectedGlossaryId
  };

  if (!payload.sourceText) {
    setStatus("请填写需要翻译的原文。", "error");
    return;
  }

  state.isTranslating = true;
  els.translateBtn.textContent = "翻译中...";
  updateControls();

  try {
    const data = await apiFetch("/api/translate", {
      method: "POST",
      body: payload
    });
    const { record } = data;
    if (!record) throw new Error("未获取到翻译结果");

    upsertHistory(record);
    state.currentRecord = record;
    setSelectedGlossary(record.glossaryId, { updatePreview: false });
    refreshGlossaryOptions({ preserveSelection: true });
    setStatus("翻译完成，可进行评估。", "success");
    renderApp();
  } catch (error) {
    setStatus(error.message || "翻译失败", "error", 6000);
  } finally {
    state.isTranslating = false;
    els.translateBtn.textContent = "立即翻译";
    updateControls();
  }
};

const handleSaveDefaults = async () => {
  const parsedTemperature = Number.parseFloat(els.temperature.value);
  const payload = {
    targetLanguage: els.targetLanguage.value || undefined,
    model: els.model.value || undefined,
    tone: els.tone.value.trim(),
    audience: els.audience.value.trim(),
    domain: els.domain.value.trim(),
    promptTemplate: els.prompt.value.trim(),
    temperature: Number.isNaN(parsedTemperature) ? undefined : parsedTemperature,
    glossaryId: state.selectedGlossaryId || undefined
  };

  const sanitized = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value === "") return;
    sanitized[key] = value;
  });

  try {
    const data = await apiFetch("/api/settings", {
      method: "PUT",
      body: sanitized
    });
    state.savedDefaults = data;
    state.defaultPrompt = data.promptTemplate || state.basePromptTemplate;
    setStatus("默认设置已保存。", "success");
  } catch (error) {
    setStatus(error.message || "默认设置保存失败", "error", 6000);
  }
};

const handleEvaluate = async () => {
  if (!state.currentRecord || state.isEvaluating) return;

  state.isEvaluating = true;
  els.evaluateBtn.textContent = "评估中...";
  updateControls();

  try {
    const data = await apiFetch("/api/evaluate", {
      method: "POST",
      body: { recordId: state.currentRecord.id }
    });
    const record = data.record;
    if (record) {
      upsertHistory(record);
      state.currentRecord = record;
      setSelectedGlossary(record.glossaryId, { updatePreview: false });
      refreshGlossaryOptions({ preserveSelection: true });
    } else if (state.currentRecord) {
      state.currentRecord.evaluation = data.evaluation;
    }
    setStatus("评估完成。", "success");
    renderApp();
  } catch (error) {
    setStatus(error.message || "评估失败", "error", 6000);
  } finally {
    state.isEvaluating = false;
    els.evaluateBtn.textContent = "评估翻译";
    updateControls();
  }
};

const handleResetPrompt = () => {
  els.prompt.value = state.defaultPrompt;
  setStatus("Prompt 已重置。");
};

const handleHistoryClick = async (event) => {
  const actionBtn = event.target.closest("[data-action]");
  if (!actionBtn) return;

  const id = actionBtn.dataset.id;
  if (!id) return;

  if (actionBtn.dataset.action === "load") {
    const record = state.history.find((item) => item.id === id);
    if (!record) return;
    state.currentRecord = record;
    els.sourceText.value = record.sourceText || "";
    if (record.targetLanguage) {
      ensureSelectOption(
        els.targetLanguage,
        record.targetLanguage,
        record.targetLanguage
      );
    }
    els.targetLanguage.value = record.targetLanguage || "";
    if (record.model) {
      ensureSelectOption(els.model, record.model, record.model);
    }
    els.model.value = record.model || "";
    els.domain.value = record.domain || "";
    els.tone.value = record.tone || "";
    els.audience.value = record.audience || "";
    els.temperature.value =
      record.translation?.metadata?.temperature ?? 0.3;
    els.glossary.value = record.glossary || "";
    els.prompt.value =
      record.promptTemplate || state.defaultPrompt;

    if (record.glossaryLibrary?.domain) {
      ensureSelectOption(
        els.glossaryDomain,
        record.glossaryLibrary.domain,
        record.glossaryLibrary.domain
      );
      els.glossaryDomain.value = record.glossaryLibrary.domain;
    }

    refreshGlossaryOptions({ preserveSelection: true });
    setSelectedGlossary(record.glossaryLibrary?.id, { updatePreview: true });

    setStatus("已加载历史记录，继续编辑或重新翻译。");
    renderApp();
    return;
  }

  if (actionBtn.dataset.action === "star") {
    try {
      const data = await apiFetch(`/api/history/${id}/star`, {
        method: "POST"
      });
      if (data.record) {
        upsertHistory(data.record);
        if (state.currentRecord && state.currentRecord.id === id) {
          state.currentRecord = data.record;
        }
        renderApp();
      }
    } catch (error) {
      setStatus(error.message || "操作失败", "error");
    }
  }
};

const handleSaveNote = async () => {
  if (!state.currentRecord) return;
  const note = els.noteInput.value.trim();
  try {
    const data = await apiFetch(
      `/api/history/${state.currentRecord.id}/note`,
      {
        method: "PUT",
        body: { note }
      }
    );
    if (data.record) {
      upsertHistory(data.record);
      state.currentRecord = data.record;
      renderApp();
      setStatus("备注已保存。", "success");
    }
  } catch (error) {
    setStatus(error.message || "备注保存失败", "error", 6000);
  }
};

const handleExport = async (format) => {
  try {
    const response = await fetch(`/api/history/export?format=${format}`, {
      headers: {
        Accept: format === "csv" ? "text/csv" : "application/json"
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `导出失败 (${response.status})`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    let filename = `history-export-${Date.now()}.${format}`;
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    setStatus(`历史记录已导出（${format.toUpperCase()}）。`, "success");
  } catch (error) {
    setStatus(error.message || "导出失败", "error", 6000);
  }
};

const init = async () => {
  try {
    const config = await apiFetch("/api/config");
    populateConfig(config);
  } catch (error) {
    setStatus(error.message || "配置加载失败", "error", 6000);
  }

  try {
    await loadGlossaries();
  } catch (error) {
    setStatus(error.message || "术语库加载失败", "error", 6000);
  }

  renderApp();

  try {
    const historyData = await apiFetch("/api/history");
    if (Array.isArray(historyData.items)) {
      state.history = historyData.items;
    }
    renderApp();
  } catch (error) {
    setStatus(error.message || "历史记录加载失败", "error", 6000);
  }
};

els.form.addEventListener("submit", handleTranslate);
els.evaluateBtn.addEventListener("click", handleEvaluate);
els.resetPrompt.addEventListener("click", handleResetPrompt);
els.saveDefaultsBtn.addEventListener("click", (event) => {
  event.preventDefault();
  handleSaveDefaults();
});
els.saveNoteBtn.addEventListener("click", handleSaveNote);
els.historyList.addEventListener("click", handleHistoryClick);
els.exportJsonBtn.addEventListener("click", (event) => {
  event.preventDefault();
  handleExport("json");
});
els.exportCsvBtn.addEventListener("click", (event) => {
  event.preventDefault();
  handleExport("csv");
});
els.glossaryDomain.addEventListener("change", handleGlossaryDomainChange);
els.glossarySelect.addEventListener("change", (event) => {
  setSelectedGlossary(event.target.value, { updatePreview: true });
});
els.glossaryPreviewBtn.addEventListener("click", () => {
  renderGlossaryPreview(state.selectedGlossaryId || els.glossarySelect.value);
});
els.targetLanguage.addEventListener("change", handleTargetLanguageChange);

els.historySearch.addEventListener("input", (event) => {
  state.filters.search = event.target.value;
  renderHistoryList();
});

els.starFilter.addEventListener("change", (event) => {
  state.filters.starredOnly = event.target.checked;
  renderHistoryList();
});

window.addEventListener("load", init);

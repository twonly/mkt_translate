export const AnnotationPanel = (() => {
  const escapeHTML = (text = "") =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const state = {
    annotations: [],
    activeRecordId: null,
    loading: false,
    error: "",
    draft: {
      segmentRef: "",
      issueTypes: [],
      severity: "notice",
      description: "",
      suggestion: "",
      linkedGlossaryEntryId: null,
      sources: []
    }
  };

  const issueTypeOptions = [
    { value: "accuracy", label: "准确性" },
    { value: "terminology", label: "术语" },
    { value: "tone", label: "语气" },
    { value: "style", label: "格式/风格" },
    { value: "fluency", label: "流畅度" },
    { value: "other", label: "其他" }
  ];

  const severityOptions = [
    { value: "notice", label: "提示", color: "#4f5d78" },
    { value: "minor", label: "需修改", color: "#f09d35" },
    { value: "critical", label: "阻断上线", color: "#e74c3c" }
  ];

  const tpl = `
    <section class="annotation-panel">
      <header class="annotation-header">
        <div>
          <h2>标注</h2>
          <p class="annotation-subtitle">记录翻译问题，支持审核与同步术语库</p>
        </div>
        <div class="annotation-counter">
          <span class="badge">总计 <span data-role="total-count">0</span></span>
          <span class="badge secondary">待审核 <span data-role="pending-count">0</span></span>
        </div>
      </header>

      <div class="annot-form">
        <div class="form-field">
          <span>定位句段</span>
          <input data-role="segment-ref" placeholder="例如：第2句 / 标题" />
        </div>

        <div class="form-field">
          <span>问题类型</span>
          <div class="issue-type-grid" data-role="issue-types">
            ${issueTypeOptions
              .map(
                (opt) => `
                  <label class="chip">
                    <input type="checkbox" value="${opt.value}" />
                    <span>${opt.label}</span>
                  </label>
                `
              )
              .join("")}
          </div>
        </div>

        <div class="form-field">
          <span>严重级别</span>
          <div class="severity-group" data-role="severity">
            ${severityOptions
              .map(
                (opt) => `
                  <label class="chip severity">
                    <input type="radio" name="annotation-severity" value="${opt.value}" ${
                  opt.value === "notice" ? "checked" : ""
                } />
                    <span style="color:${opt.color}">${opt.label}</span>
                  </label>
                `
              )
              .join("")}
          </div>
        </div>

        <div class="form-field">
          <span>问题描述</span>
          <textarea data-role="description" rows="3" placeholder="说明问题所在、定位信息、风险…"></textarea>
        </div>

        <div class="form-field">
          <span>建议译法</span>
          <textarea data-role="suggestion" rows="3" placeholder="给出修正译文或处理建议"></textarea>
        </div>

        <label class="chip">
          <input type="checkbox" data-role="sync-glossary" />
          <span>建议同步至术语库</span>
        </label>

        <footer class="annot-actions">
          <button class="secondary" data-role="reset">清空</button>
          <button class="primary" data-role="submit">提交标注</button>
        </footer>

        <p class="annotation-error" data-role="error"></p>
      </div>

      <div class="annotation-list" data-role="list"></div>
    </section>
  `;

  let container = null;
  const handlers = {
    onSubmit: null
  };

  const renderList = () => {
    if (!container) return;
    const listEl = container.querySelector('[data-role="list"]');
    const total = state.annotations.length;
    const pending = state.annotations.filter((item) => item.status !== "approved").length;
    container.querySelector('[data-role="total-count"]').textContent = total;
    container.querySelector('[data-role="pending-count"]').textContent = pending;

    if (!total) {
      listEl.innerHTML = `<p class="placeholder">暂无标注，欢迎记录翻译问题。</p>`;
      return;
    }

    listEl.innerHTML = state.annotations
      .map((item) => {
        const types = item.issueTypes
          .map(
            (type) =>
              issueTypeOptions.find((opt) => opt.value === type)?.label || type
          )
          .join(" · ") || "未分类";
        const severity = severityOptions.find((opt) => opt.value === item.severity);
        return `
          <article class="annotation-card" data-id="${item.id}">
            <header>
              <div>
                <strong>${item.segmentRef || "未指定位置"}</strong>
                <span class="badge">${types}</span>
              </div>
              <span class="badge severity" style="color:${severity?.color || "#4f5d78"}">${
          severity?.label || "提示"
        }</span>
            </header>
            <p class="annotation-text">${escapeHTML(item.description || "")}</p>
            <p class="annotation-suggestion">
              <span>建议：</span>${escapeHTML(item.suggestion || "——")}
            </p>
            <footer>
              <span class="annotation-meta">状态：${item.status}</span>
              <time>${new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleString()}</time>
            </footer>
          </article>
        `;
      })
      .join("");
  };

  const resetForm = () => {
    if (!container) return;
    state.draft = {
      segmentRef: "",
      issueTypes: [],
      severity: "notice",
      description: "",
      suggestion: "",
      linkedGlossaryEntryId: null,
      sources: []
    };
    container.querySelector('[data-role="segment-ref"]').value = "";
    container.querySelector('[data-role="description"]').value = "";
    container.querySelector('[data-role="suggestion"]').value = "";
    container.querySelector('[data-role="sync-glossary"]').checked = false;
    container
      .querySelectorAll('[data-role="issue-types"] input[type="checkbox"]')
      .forEach((input) => {
        input.checked = false;
      });
    container
      .querySelectorAll('[data-role="severity"] input[type="radio"]')
      .forEach((input) => {
        input.checked = input.value === "notice";
      });
    container.querySelector('[data-role="error"]').textContent = "";
  };

  const readForm = () => {
    const segmentRef = container.querySelector('[data-role="segment-ref"]').value.trim();
    const description = container.querySelector('[data-role="description"]').value.trim();
    const suggestion = container.querySelector('[data-role="suggestion"]').value.trim();
    const issueTypes = Array.from(
      container.querySelectorAll('[data-role="issue-types"] input[type="checkbox"]:checked')
    ).map((input) => input.value);
    const severity =
      container.querySelector('[data-role="severity"] input[type="radio"]:checked')?.value ||
      "notice";

    return {
      segmentRef,
      description,
      suggestion,
      issueTypes,
      severity,
      sources: state.draft.sources || [],
      linkedGlossaryEntryId: state.draft.linkedGlossaryEntryId || null,
      syncGlossary: container.querySelector('[data-role="sync-glossary"]').checked
    };
  };

  const validateForm = (formData) => {
    if (!state.activeRecordId) {
      return "请先完成翻译";
    }
    if (!formData.description) {
      return "请填写问题描述";
    }
    if (!formData.suggestion) {
      return "请填写建议译法";
    }
    if (!formData.issueTypes.length) {
      return "请至少勾选一个问题类型";
    }
    return "";
  };

  const submitAnnotation = async () => {
    if (state.loading) return;
    const formData = readForm();
    const error = validateForm(formData);
    if (error) {
      container.querySelector('[data-role="error"]').textContent = error;
      return;
    }
    state.loading = true;
    container.querySelector('[data-role="error"]').textContent = "";

    try {
      const response = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: state.activeRecordId,
          segmentRef: formData.segmentRef,
          issueTypes: formData.issueTypes,
          severity: formData.severity,
          description: formData.description,
          suggestion: formData.suggestion,
          linkedGlossaryEntryId: formData.linkedGlossaryEntryId,
          sources: formData.sources
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "标注提交失败");
      }
      state.annotations.push(data.annotation);
      renderList();
      resetForm();
      if (handlers.onSubmit) {
        handlers.onSubmit(data);
      }
    } catch (err) {
      container.querySelector('[data-role="error"]').textContent = err.message;
    } finally {
      state.loading = false;
    }
  };

  const fetchAnnotations = async (recordId) => {
    if (!recordId) {
      state.annotations = [];
      renderList();
      return;
    }
    state.loading = true;
    try {
      const resp = await fetch(`/api/annotations?recordId=${recordId}`);
      const data = await resp.json();
      state.annotations = Array.isArray(data.items) ? data.items : [];
      renderList();
    } catch (error) {
      container.querySelector('[data-role="error"]').textContent =
        error.message || "标注加载失败";
    } finally {
      state.loading = false;
    }
  };

  const bindEvents = () => {
    container.querySelector('[data-role="reset"]').addEventListener("click", (event) => {
      event.preventDefault();
      resetForm();
    });
    container.querySelector('[data-role="submit"]').addEventListener("click", (event) => {
      event.preventDefault();
      submitAnnotation();
    });
  };

  const mount = (mountPoint) => {
    container = mountPoint;
    container.innerHTML = tpl;
    bindEvents();
    renderList();
  };

const setRecord = (recordId, options = {}) => {
  state.activeRecordId = recordId;
  resetForm();
  state.draft.sources = options.sources || [];
  state.draft.linkedGlossaryEntryId = options.linkedGlossaryEntryId || null;
  fetchAnnotations(recordId);
};

  const appendDraftSource = (source) => {
    if (!state.draft.sources) {
      state.draft.sources = [];
    }
    if (source && !state.draft.sources.includes(source)) {
      state.draft.sources.push(source);
    }
  };

  const setDraftContext = ({ segmentRef, source, linkedGlossaryEntryId }) => {
    if (!container) return;
    if (segmentRef) {
      container.querySelector('[data-role="segment-ref"]').value = segmentRef;
      state.draft.segmentRef = segmentRef;
    }
    if (source) {
      appendDraftSource(source);
      const desc = container.querySelector('[data-role="description"]');
      if (!desc.value) {
        desc.value = `术语 ${source} 存在问题：`;
      }
    }
    if (linkedGlossaryEntryId) {
      state.draft.linkedGlossaryEntryId = linkedGlossaryEntryId;
    }
    container.scrollTop = 0;
    container.querySelector('[data-role="description"]').focus();
  };

  const registerHandlers = (newHandlers) => {
    Object.assign(handlers, newHandlers);
  };

  return {
    mount,
    setRecord,
    appendDraftSource,
    setDraftContext,
    registerHandlers,
    state
  };
})();

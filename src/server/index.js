require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const {
  DEFAULT_CONFIG
} = require("./config");
const {
  performTranslation,
  performEvaluation
} = require("./deepseekClient");
const {
  loadHistory,
  addRecord,
  updateRecord,
  toggleStar,
  getRecord
} = require("./historyStore");
const { loadSettings, saveSettings } = require("./settingsStore");
const { logger, logRequest } = require("./logger");

const app = express();
const PORT = process.env.PORT || 3000;

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn("rate_limit_exceeded", {
      ip: req.ip,
      url: req.originalUrl
    });
    res.status(429).json({
      error: "Too many requests, please try again later."
    });
  }
});

app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(logRequest);
app.use("/api/", apiLimiter);
app.use(
  express.static(path.join(DEFAULT_CONFIG.rootDir, "public"), {
    extensions: ["html"]
  })
);

const applyPromptVariables = (template, variables) =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });

app.get("/api/ping", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", async (req, res) => {
  const hasApiKey = Boolean(process.env.DEEPSEEK_API_KEY);
  res.json({
    status: "ok",
    deepseekApiKeyPresent: hasApiKey,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    languages: DEFAULT_CONFIG.targetLanguages,
    models: DEFAULT_CONFIG.models,
    domains: DEFAULT_CONFIG.domains,
    defaultPromptTemplate: DEFAULT_CONFIG.defaultPromptTemplate,
    defaultTone: DEFAULT_CONFIG.defaultTone,
    defaultAudience: DEFAULT_CONFIG.defaultAudience,
    savedDefaults: loadSettings()
  });
});

app.get("/api/history", (req, res) => {
  const history = loadHistory();
  res.json({ items: history });
});

app.post("/api/history/:id/star", (req, res) => {
  const updated = toggleStar(req.params.id);
  if (!updated) {
    return res.status(404).json({ error: "record not found" });
  }
  res.json({ record: updated });
});

app.put("/api/history/:id/note", (req, res) => {
  const { note } = req.body || {};
  const updated = updateRecord(req.params.id, {
    userNote: note || ""
  });
  if (!updated) {
    return res.status(404).json({ error: "record not found" });
  }
  res.json({ record: updated });
});

app.get("/api/history/export", (req, res) => {
  const { format = "json" } = req.query;
  const history = loadHistory();
  const filename = `history-${Date.now()}.${format === "csv" ? "csv" : "json"}`;

  if (format === "csv") {
    const headers = [
      "id",
      "createdAt",
      "targetLanguage",
      "model",
      "domain",
      "tone",
      "audience",
      "sourceText",
      "translationText",
      "averageScore",
      "recommendation",
      "userNote"
    ];

    const toCsvValue = (value) => {
      if (value === null || value === undefined) return "";
      const text = String(value).replace(/"/g, '""');
      return `"${text}"`;
    };

    const csvLines = [
      headers.join(","),
      ...history.map((item) => {
        const evaluation = item.evaluation || {};
        let avg = null;
        if (evaluation.scores) {
          const scores = Object.values(evaluation.scores).filter(
            (score) => typeof score === "number"
          );
          if (scores.length) {
            avg = (scores.reduce((sum, current) => sum + current, 0) / scores.length).toFixed(2);
          }
        }
        return [
          item.id,
          item.createdAt,
          item.targetLanguage,
          item.model,
          item.domain,
          item.tone,
          item.audience,
          item.sourceText,
          item.translation?.text,
          avg,
          evaluation.recommendation,
          item.userNote
        ]
          .map(toCsvValue)
          .join(",");
      })
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvLines);
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(history, null, 2));
});

app.post("/api/translate", async (req, res) => {
  const {
    sourceText,
    targetLanguage,
    model,
    prompt,
    domain,
    tone,
    audience,
    glossary,
    temperature
  } = req.body || {};

  if (!sourceText || !sourceText.trim()) {
    return res.status(400).json({ error: "sourceText is required" });
  }
  if (!targetLanguage) {
    return res.status(400).json({ error: "targetLanguage is required" });
  }

  const finalModel =
    model ||
    DEFAULT_CONFIG.models?.[0]?.value ||
    "deepseek-chat";

  const variables = {
    sourceText: sourceText.trim(),
    targetLanguage,
    tone: tone || DEFAULT_CONFIG.defaultTone,
    audience: audience || DEFAULT_CONFIG.defaultAudience,
    domain: domain || "通用",
    glossary: glossary || ""
  };

  const promptTemplate =
    prompt || DEFAULT_CONFIG.defaultPromptTemplate;
  const preparedPrompt = applyPromptVariables(
    promptTemplate,
    variables
  );

  try {
    const translationResult = await performTranslation({
      model: finalModel,
      prompt: preparedPrompt,
      temperature: temperature ?? 0.3,
      sourceText: variables.sourceText,
      targetLanguage,
      context: glossary
        ? [
            {
              role: "system",
              content: `术语表（优先使用）：\n${glossary}`
            }
          ]
        : undefined
    });

    logger.info("translation.success", {
      targetLanguage,
      model: finalModel,
      durationMs: translationResult.durationMs,
      mock: translationResult.isMock,
      tokenUsage: translationResult.usage
    });

    const record = addRecord({
      sourceText: variables.sourceText,
      targetLanguage,
      model: finalModel,
      domain: variables.domain,
      tone: variables.tone,
      audience: variables.audience,
      promptTemplate,
      promptVariables: variables,
      glossary,
      translation: {
        text: translationResult.text,
        metadata: {
          usage: translationResult.usage,
          durationMs: translationResult.durationMs,
          temperature: temperature ?? 0.3,
          isMock: translationResult.isMock
        }
      },
      evaluation: null,
      userNote: ""
    });

    res.json({
      record,
      meta: {
        prompt: preparedPrompt
      }
    });
  } catch (error) {
    logger.error("translation.error", {
      error: error.message,
      targetLanguage,
      model: finalModel
    });
    const message =
      error.response?.data ||
      error.message ||
      "translation failed";
    res.status(500).json({ error: message });
  }
});

app.post("/api/evaluate", async (req, res) => {
  const {
    recordId,
    sourceText,
    translation,
    model
  } = req.body || {};

  let record = null;
  let source = sourceText;
  let translated = translation;
  let targetModel = model;

  if (recordId) {
    record = getRecord(recordId);
    if (!record) {
      return res.status(404).json({ error: "record not found" });
    }
    source = record.sourceText;
    translated = record.translation?.text;
    targetModel = targetModel || record.model;
  }

  if (!source || !translated) {
    return res.status(400).json({
      error:
        "sourceText and translation are required when recordId is not provided"
    });
  }

  const evaluationPrompt = `${DEFAULT_CONFIG.evaluationPrompt}

原文：
${source}

译文：
${translated}`;

  try {
    const evaluationResult = await performEvaluation({
      model: targetModel || "deepseek-chat",
      prompt: evaluationPrompt
    });

    logger.info("evaluation.success", {
      recordId: record ? record.id : null,
      model: targetModel || "deepseek-chat",
      durationMs: evaluationResult.durationMs,
      mock: evaluationResult.isMock
    });

    let updatedRecord = record;
    if (record) {
      updatedRecord = updateRecord(record.id, {
        evaluation: {
          ...(evaluationResult.evaluation || {}),
          metadata: {
            usage: evaluationResult.usage,
            durationMs: evaluationResult.durationMs,
            isMock: evaluationResult.isMock
          }
        }
      });
    }

    res.json({
      evaluation: evaluationResult.evaluation,
      metadata: {
        usage: evaluationResult.usage,
        durationMs: evaluationResult.durationMs,
        isMock: evaluationResult.isMock
      },
      record: updatedRecord || null
    });
  } catch (error) {
    logger.error("evaluation.error", {
      error: error.message,
      recordId: record ? record.id : null,
      model: targetModel
    });
    const message =
      error.response?.data ||
      error.message ||
      "evaluation failed";
    res.status(500).json({ error: message });
  }
});

app.get("/api/settings", (req, res) => {
  res.json(loadSettings());
});

app.put("/api/settings", (req, res) => {
  const allowedFields = [
    "targetLanguage",
    "model",
    "tone",
    "audience",
    "domain",
    "promptTemplate",
    "temperature"
  ];

  const update = {};
  allowedFields.forEach((field) => {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, field)) {
      update[field] = req.body[field];
    }
  });

  if (
    Object.prototype.hasOwnProperty.call(update, "temperature") &&
    typeof update.temperature !== "number"
  ) {
    const parsed = Number.parseFloat(update.temperature);
    if (Number.isNaN(parsed)) {
      delete update.temperature;
    } else {
      update.temperature = parsed;
    }
  }

  const saved = saveSettings(update);
  logger.info("settings.updated", { fields: Object.keys(update) });
  res.json(saved);
});

app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    !req.originalUrl.startsWith("/api/")
  ) {
    res.sendFile(path.join(DEFAULT_CONFIG.rootDir, "public", "index.html"));
    return;
  }
  if (!res.headersSent) {
    res.status(404).json({ error: "Not found" });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});

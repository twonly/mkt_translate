const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { DEFAULT_CONFIG } = require("./config");
const { loadHistory, updateRecord } = require("./historyStore");

const ANNOTATIONS_FILE = path.join(DEFAULT_CONFIG.rootDir, "data", "annotations.json");

const ensureFile = () => {
  if (!fs.existsSync(ANNOTATIONS_FILE)) {
    fs.writeFileSync(ANNOTATIONS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
};

const loadAnnotations = () => {
  ensureFile();
  try {
    const raw = fs.readFileSync(ANNOTATIONS_FILE, "utf-8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const saveAnnotations = (items) => {
  ensureFile();
  fs.writeFileSync(ANNOTATIONS_FILE, JSON.stringify(items, null, 2), "utf-8");
};

const formatAnnotation = (annotation) => ({
  id: annotation.id || uuidv4(),
  recordId: annotation.recordId,
  segmentRef: annotation.segmentRef || null,
  issueTypes: Array.isArray(annotation.issueTypes) ? annotation.issueTypes : [],
  severity: annotation.severity || "notice",
  description: annotation.description || "",
  suggestion: annotation.suggestion || "",
  linkedGlossaryEntryId: annotation.linkedGlossaryEntryId || null,
  createdBy: annotation.createdBy || "anonymous",
  status: annotation.status || "review",
  sources: annotation.sources || [],
  syncGlossary: Boolean(annotation.syncGlossary),
  createdAt: annotation.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const getAnnotations = (recordId) => {
  const list = loadAnnotations();
  if (!recordId) {
    return list;
  }
  return list.filter((item) => item.recordId === recordId);
};

const createAnnotation = (payload) => {
  if (!payload?.recordId) {
    throw new Error("recordId is required");
  }
  const annotations = loadAnnotations();
  const annotation = formatAnnotation(payload);
  annotations.push(annotation);
  saveAnnotations(annotations);

  const record = updateRecord(annotation.recordId, {
    annotations: [
      ...(loadHistory().find((item) => item.id === annotation.recordId)?.annotations || []),
      annotation
    ]
  });

  return { annotation, record };
};

const updateAnnotation = (id, partial) => {
  const annotations = loadAnnotations();
  const index = annotations.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const updated = {
    ...annotations[index],
    ...partial,
    updatedAt: new Date().toISOString()
  };

  annotations[index] = updated;
  saveAnnotations(annotations);

  const record = updateRecord(updated.recordId, {
    annotations: annotations.filter((item) => item.recordId === updated.recordId)
  });

  return { annotation: updated, record };
};

module.exports = {
  getAnnotations,
  createAnnotation,
  updateAnnotation
};

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { DEFAULT_CONFIG } = require("./config");

const HISTORY_FILE = path.join(DEFAULT_CONFIG.rootDir, "data", "history.json");

const ensureHistoryFile = () => {
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), "utf-8");
  }
};

const loadHistory = () => {
  ensureHistoryFile();
  const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
  try {
    const items = JSON.parse(raw);
    if (Array.isArray(items)) {
      return items;
    }
    return [];
  } catch {
    return [];
  }
};

const saveHistory = (items) => {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2), "utf-8");
};

const addRecord = (record) => {
  const history = loadHistory();
  const entry = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    starred: false,
    annotations: [],
    ...record
  };
  history.unshift(entry);
  const trimmed = history.slice(0, 200);
  saveHistory(trimmed);
  return entry;
};

const getRecord = (id) => {
  const history = loadHistory();
  return history.find((item) => item.id === id) || null;
};

const updateRecord = (id, partial) => {
  const history = loadHistory();
  const index = history.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }
  const updated = {
    ...history[index],
    ...partial,
    updatedAt: new Date().toISOString()
  };
  history[index] = updated;
  saveHistory(history);
  return updated;
};

const toggleStar = (id) => {
  const history = loadHistory();
  const index = history.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }
  history[index].starred = !history[index].starred;
  saveHistory(history);
  return history[index];
};

module.exports = {
  loadHistory,
  addRecord,
  updateRecord,
  toggleStar,
  getRecord
};

const fs = require("fs");
const path = require("path");
const { DEFAULT_CONFIG } = require("./config");

const SETTINGS_FILE = path.join(DEFAULT_CONFIG.rootDir, "data", "settings.json");

const ensureFile = () => {
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
};

const loadSettings = () => {
  ensureFile();
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const json = JSON.parse(raw);
    if (json && typeof json === "object") {
      return json;
    }
  } catch {
    // ignore parse errors, return empty object
  }
  return {};
};

const saveSettings = (settings) => {
  ensureFile();
  const snapshot = {
    ...loadSettings(),
    ...settings,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(snapshot, null, 2), "utf-8");
  return snapshot;
};

module.exports = {
  loadSettings,
  saveSettings
};

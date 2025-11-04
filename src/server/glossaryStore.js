const fs = require("fs");
const path = require("path");
const { DEFAULT_CONFIG } = require("./config");

const GLOSSARY_FILE = path.join(DEFAULT_CONFIG.rootDir, "data", "glossaries.json");

const ensureFile = () => {
  if (!fs.existsSync(GLOSSARY_FILE)) {
    fs.writeFileSync(GLOSSARY_FILE, JSON.stringify([], null, 2), "utf-8");
  }
};

const loadAllGlossaries = () => {
  ensureFile();
  try {
    const raw = fs.readFileSync(GLOSSARY_FILE, "utf-8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return list;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to load glossaries:", error.message);
  }
  return [];
};

const getGlossaryById = (id) => {
  const glossaries = loadAllGlossaries();
  return glossaries.find((item) => item.id === id) || null;
};

const toSummary = (glossary) => ({
  id: glossary.id,
  name: glossary.name,
  domain: glossary.domain,
  direction: glossary.direction,
  description: glossary.description,
  termsCount: Array.isArray(glossary.terms) ? glossary.terms.length : 0,
  createdAt: glossary.createdAt
});

module.exports = {
  loadAllGlossaries,
  getGlossaryById,
  toSummary,
  GLOSSARY_FILE
};

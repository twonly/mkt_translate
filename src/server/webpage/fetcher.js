const axios = require("axios");
const cheerio = require("cheerio");
const normalizeUrl = require("normalize-url").default;
const NodeCache = require("node-cache");

const { logger } = require("../logger");

const DEFAULT_TIMEOUT = Number(process.env.WEB_FETCH_TIMEOUT || 15000);
const WEB_FETCH_CACHE_TTL = Number(process.env.WEB_FETCH_CACHE_TTL || 300); // seconds

const cache = new NodeCache({ stdTTL: WEB_FETCH_CACHE_TTL, checkperiod: 120 });

const fetchHtml = async (url) => {
  const response = await axios.get(url, {
    timeout: DEFAULT_TIMEOUT,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    },
    responseType: "text"
  });
  return response.data;
};

const cleanHtml = ($, rootSelector) => {
  const root = rootSelector ? $(rootSelector) : $("body");
  const clone = root.clone();

  clone
    .find("script, style, noscript, iframe, svg, video, audio, canvas")
    .remove();

  clone.find("[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith("javascript:")) {
      $(el).removeAttr("href");
    }
  });

  clone.find("[id]").each((index, el) => {
    const current = $(el).attr("id");
    $(el).attr("id", `${current || "node"}-${index}`);
  });

  return clone.html() || "";
};

const extractTextFragments = ($, rootSelector) => {
  const fragments = [];
  const root = rootSelector ? $(rootSelector) : $("body");

  root.find("p, h1, h2, h3, h4, h5, h6, li, blockquote").each((index, el) => {
    const text = $(el).text().trim();
    if (!text) return;
    fragments.push({
      id: `fragment-${index}`,
      text,
      tag: el.tagName || el.name
    });
  });

  return fragments;
};

const fetchWebpage = async ({ url, rootSelector }) => {
  const normalizedUrl = normalizeUrl(url, { stripWWW: false });
  const cached = cache.get(normalizedUrl);
  if (cached) {
    logger.info("webpage.fetch.cache_hit", { url: normalizedUrl });
    return cached;
  }

  const html = await fetchHtml(normalizedUrl);
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const cleanedHtml = cleanHtml($, rootSelector);
  const fragments = extractTextFragments($, rootSelector);

  const result = {
    url: normalizedUrl,
    title,
    rawHtml: cleanedHtml,
    textFragments: fragments,
    metadata: {
      language: $("html").attr("lang") || null,
      fetchedAt: new Date().toISOString()
    }
  };

  cache.set(normalizedUrl, result);
  return result;
};

module.exports = {
  fetchWebpage
};

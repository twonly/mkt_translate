const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

const DEFAULT_PROMPT_TEMPLATE = `你是一名专业翻译专家，请将以下原文翻译成{{targetLanguage}}，面向{{audience}}。要求：
- 保持原文语义准确，确保逻辑一致；
- 采用{{tone}}语气，符合{{domain}}领域常用表达；
- 若存在专有名词或术语，按术语表要求进行翻译；
- 输出结构保持与原文一致。

原文：
{{sourceText}}`;

const DEFAULT_CONFIG = {
  rootDir: ROOT_DIR,
  defaultPromptTemplate: DEFAULT_PROMPT_TEMPLATE,
  targetLanguages: [
    { label: "简体中文", value: "zh-CN" },
    { label: "繁体中文", value: "zh-TW" },
    { label: "英语（美式）", value: "en-US" },
    { label: "英语（英式）", value: "en-GB" },
    { label: "日语", value: "ja-JP" },
    { label: "韩语", value: "ko-KR" },
    { label: "法语", value: "fr-FR" },
    { label: "德语", value: "de-DE" },
    { label: "西班牙语", value: "es-ES" },
    { label: "葡萄牙语", value: "pt-BR" }
  ],
  models: [
    { label: "DeepSeek Chat", value: "deepseek-chat" },
    { label: "DeepSeek Coder", value: "deepseek-coder" },
    { label: "DeepSeek Reasoner", value: "deepseek-reasoner" }
  ],
  domains: [
    "市场营销",
    "技术文档",
    "客服支持",
    "法律合规",
    "游戏本地化"
  ],
  defaultTone: "专业且友好",
  defaultAudience: "目标受众",
  evaluationPrompt: `你是资深翻译评审专家。综合原文和译文，从准确度、流畅度、语气一致性、术语与格式4个维度进行评分（1-5，保留一位小数），指出问题位置并给出改进建议。总结是否需要人工复核，输出JSON结构：
{
  "scores": {
    "accuracy": number,
    "fluency": number,
    "toneConsistency": number,
    "terminologyAndFormat": number
  },
  "issues": [
    {
      "type": "accuracy | fluency | tone | terminology",
      "excerpt": "问题对应的译文或原文片段",
      "comment": "问题说明与建议"
    }
  ],
  "overall_comment": "整体点评",
  "recommendation": "accept | revise | human_review"
}`
};

module.exports = {
  DEFAULT_CONFIG
};

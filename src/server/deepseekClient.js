const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const DEFAULT_BASE_URL = "https://api.deepseek.com";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildMessages = ({ systemPrompt, userPrompt, context }) => {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  if (context && context.length) {
    context.forEach((ctx) => {
      messages.push({ role: ctx.role || "user", content: ctx.content });
    });
  }
  messages.push({ role: "user", content: userPrompt });
  return messages;
};

const callDeepSeekChat = async ({
  model,
  userPrompt,
  systemPrompt,
  temperature = 0.2,
  responseFormat,
  context
}) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      id: `mock-${uuidv4()}`,
      model,
      created: Date.now(),
      usage: {
        prompt_tokens: Math.max(1, Math.round(userPrompt.length / 4)),
        completion_tokens: Math.max(1, Math.round(userPrompt.length / 6)),
        total_tokens: Math.max(2, Math.round(userPrompt.length / 2.5))
      },
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: `[Mock response] ${userPrompt.slice(0, 200)}`
          }
        }
      ],
      mock: true
    };
  }

  const baseURL = process.env.DEEPSEEK_API_BASE || DEFAULT_BASE_URL;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };

  const payload = {
    model,
    temperature,
    messages: buildMessages({ systemPrompt, userPrompt, context })
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  const url = `${baseURL.replace(/\/$/, "")}/v1/chat/completions`;

  const response = await axios.post(url, payload, { headers, timeout: 60_000 });
  return { ...response.data, mock: false };
};

const buildMockEvaluation = () => {
  const randomScore = () => (Math.random() * 1.5 + 3.2).toFixed(1);
  return {
    scores: {
      accuracy: Number(randomScore()),
      fluency: Number(randomScore()),
      toneConsistency: Number(randomScore()),
      terminologyAndFormat: Number(randomScore())
    },
    issues: [],
    overall_comment: "模拟评估：整体质量良好，可作为参考。",
    recommendation: "accept"
  };
};

const performTranslation = async ({
  model,
  prompt,
  systemPrompt,
  temperature = 0.3,
  context,
  sourceText,
  targetLanguage
}) => {
  const start = Date.now();
  const response = await callDeepSeekChat({
    model,
    userPrompt: prompt,
    systemPrompt:
      systemPrompt ||
      "You are a senior localization expert delivering precise, culturally aware translations.",
    temperature,
    context
  });
  const durationMs = Date.now() - start;
  let text =
    response.choices?.[0]?.message?.content?.trim() || "";

  if (response.mock) {
    const prefix = targetLanguage
      ? `【模拟${targetLanguage}译文】`
      : "【模拟译文】";
    text =
      prefix +
      (sourceText
        ? ` ${sourceText}`
        : ` ${prompt.slice(0, 120)}`);
  }

  if (!text) {
    text = "[未获得翻译结果，请稍后重试]";
  }

  return {
    text,
    usage: response.usage || null,
    durationMs,
    raw: response,
    isMock: Boolean(response.mock)
  };
};

const performEvaluation = async ({
  model,
  prompt,
  temperature = 0,
  context
}) => {
  const start = Date.now();
  const response = await callDeepSeekChat({
    model,
    userPrompt: prompt,
    systemPrompt:
      "You are an expert translation quality reviewer. Always respond in valid JSON.",
    temperature,
    responseFormat: { type: "json_object" },
    context
  });
  const durationMs = Date.now() - start;
  let evaluation = null;
  const content = response.choices?.[0]?.message?.content;

  if (response.mock) {
    evaluation = buildMockEvaluation();
  } else if (content) {
    try {
      evaluation = JSON.parse(content);
    } catch (error) {
      evaluation = {
        parseError: error.message,
        rawContent: content
      };
    }
  }

  return {
    evaluation,
    usage: response.usage || null,
    durationMs,
    raw: response,
    isMock: Boolean(response.mock)
  };
};

module.exports = {
  performTranslation,
  performEvaluation,
  callDeepSeekChat,
  sleep
};

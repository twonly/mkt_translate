const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { DEFAULT_CONFIG } = require("./config");
const { logger } = require("./logger");

const CACHE_DIR = path.join(DEFAULT_CONFIG.rootDir, "public", "tts-cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || "";
const MINIMAX_TTS_URL =
  process.env.MINIMAX_TTS_ENDPOINT || "https://api.minimaxi.com/v1/t2a/speech";
const MINIMAX_MODEL = process.env.MINIMAX_TTS_MODEL || "speech-01";

const MOCK_WAV_BASE64 =
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="; // 1 sample silent wav

const saveAudioFile = (buffer, extension = "mp3") => {
  const filename = `${Date.now()}-${uuidv4()}.${extension}`;
  const filepath = path.join(CACHE_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return {
    filename,
    path: filepath,
    url: `/tts-cache/${filename}`
  };
};

const decodeAudio = (data, fallbackExt = "mp3") => {
  if (!data) {
    const buffer = Buffer.from(MOCK_WAV_BASE64, "base64");
    return saveAudioFile(buffer, "wav");
  }
  try {
    if (typeof data === "string") {
      return saveAudioFile(Buffer.from(data, "base64"), fallbackExt);
    }
    if (data instanceof Buffer) {
      return saveAudioFile(data, fallbackExt);
    }
  } catch (error) {
    logger.error("tts.decode.error", { error: error.message });
  }
  const buffer = Buffer.from(MOCK_WAV_BASE64, "base64");
  return saveAudioFile(buffer, "wav");
};

const callMiniMaxTTS = async ({ text, voiceId, speed = 1.0, format = "mp3" }) => {
  if (!MINIMAX_API_KEY || !MINIMAX_GROUP_ID) {
    logger.warn("tts.minimax.missing_credentials");
    return {
      ...decodeAudio(null, format),
      mock: true
    };
  }

  try {
    const payload = {
      model: MINIMAX_MODEL,
      input: [{ text }],
      voice_id: voiceId,
      audio_format: format,
      speed
    };

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
      "X-Group-Id": MINIMAX_GROUP_ID
    };

    const response = await axios.post(MINIMAX_TTS_URL, payload, {
      headers,
      timeout: 90_000
    });

    const audioBase64 =
      response.data?.data?.audio ||
      response.data?.data?.audio_base64 ||
      response.data?.audio ||
      null;

    const duration = response.data?.data?.audio_duration_ms || null;

    return {
      ...decodeAudio(audioBase64, format),
      durationMs: duration,
      mock: false
    };
  } catch (error) {
    logger.error("tts.minimax.error", {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw new Error(
      error.response?.data?.error?.message ||
        error.response?.data?.message ||
        "MiniMax TTS 请求失败"
    );
  }
};

const synthesizeSpeech = async ({ text, voiceId, speed, format }) => {
  if (!text || !text.trim()) {
    throw new Error("text is required");
  }
  const result = await callMiniMaxTTS({
    text: text.trim(),
    voiceId,
    speed,
    format
  });
  return result;
};

module.exports = {
  synthesizeSpeech
};

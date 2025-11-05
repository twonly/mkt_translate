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
const MINIMAX_TTS_MODEL = process.env.MINIMAX_TTS_MODEL || "speech-01-turbo";
const MINIMAX_TTS_ENDPOINT =
  process.env.MINIMAX_TTS_ENDPOINT || "https://api.minimaxi.com/v1/t2a_v2";

const MOCK_WAV_BASE64 =
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="; // very short silent wav

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

const hexToBuffer = (hexString) => {
  if (!hexString || typeof hexString !== "string") return null;
  try {
    return Buffer.from(hexString, "hex");
  } catch (error) {
    logger.error("tts.hex_decode.error", { error: error.message });
    return null;
  }
};

const decodeAudio = ({ hex, format }) => {
  const buffer = hexToBuffer(hex);
  if (buffer) {
    return saveAudioFile(buffer, format === "wav" ? "wav" : "mp3");
  }
  return saveAudioFile(Buffer.from(MOCK_WAV_BASE64, "base64"), "wav");
};

const callMiniMaxTTS = async ({ text, voiceId, speed = 1, volume = 1, pitch = 0, format = "mp3" }) => {
  if (!MINIMAX_API_KEY) {
    logger.warn("tts.minimax.no_api_key");
    return {
      ...decodeAudio({ hex: null, format }),
      durationMs: null,
      mock: true
    };
  }

  const payload = {
    model: MINIMAX_TTS_MODEL,
    text,
    stream: false,
    output_format: "hex",
    voice_setting: {
      voice_id: voiceId || DEFAULT_CONFIG.ttsVoices?.[0]?.id,
      speed,
      vol: volume,
      pitch
    },
    audio_setting: {
      format,
      sample_rate: 32000,
      bitrate: 128000,
      channel: 1
    }
  };

  try {
    const response = await axios.post(MINIMAX_TTS_ENDPOINT, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MINIMAX_API_KEY}`
      },
      timeout: 120_000
    });

    const baseResp = response.data?.base_resp;
    if (baseResp?.status_code !== 0) {
      throw new Error(baseResp?.status_msg || "MiniMax 返回错误");
    }

    const audioHex = response.data?.data?.audio;
    const extra = response.data?.extra_info || {};

    const saved = decodeAudio({ hex: audioHex, format: extra.audio_format || format });

    return {
      ...saved,
      durationMs: extra.audio_length || null,
      mock: false
    };
  } catch (error) {
    logger.error("tts.minimax.error", {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw new Error(
      error.response?.data?.base_resp?.status_msg ||
        error.response?.data?.error?.message ||
        error.message ||
        "MiniMax TTS 请求失败"
    );
  }
};

const synthesizeSpeech = async ({ text, voiceId, speed, format }) => {
  if (!text || !text.trim()) {
    throw new Error("text is required");
  }
  const safeFormat = ["mp3", "wav", "flac", "pcm"].includes(format)
    ? format
    : "mp3";
  const result = await callMiniMaxTTS({
    text: text.trim(),
    voiceId,
    speed: typeof speed === "number" ? speed : 1,
    format: safeFormat
  });
  return result;
};

module.exports = {
  synthesizeSpeech
};

const { EndBehaviorType } = require("@discordjs/voice");
const OpusScript = require("opusscript");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const activeRecordings = new Map();

function convertToMp3(pcmPath, mp3Path) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(pcmPath)
      .inputOptions([
        "-f s16le",
        "-ar 48000",
        "-ac 2",
      ])
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .save(mp3Path)
      .on("end", () => {
        fs.unlink(pcmPath, () => {});
        resolve(mp3Path);
      })
      .on("error", reject);
  });
}

function startRecording(guildId, connection, outputBaseDir = path.join(__dirname, "..", "recordings")) {
  if (activeRecordings.has(guildId)) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(outputBaseDir, `${guildId}_${timestamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const receiver = connection.receiver;
  const streams = new Map();
  const converting = [];

  receiver.speaking.on("start", (userId) => {
    if (streams.has(userId)) return;

    const encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
    const pcmPath = path.join(outputDir, `${userId}.pcm`);
    const writeStream = fs.createWriteStream(pcmPath, { flags: "a" });

    const audioStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 500,
      },
    });

    audioStream.on("data", (chunk) => {
      try {
        const decoded = encoder.decode(chunk, 960);
        writeStream.write(Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength));
      } catch {
        // drop malformed packets
      }
    });

    audioStream.on("end", () => {
      streams.delete(userId);

      // Wait for the write stream to fully flush before converting
      writeStream.end(() => {
        const mp3Path = path.join(outputDir, `${userId}.mp3`);
        const conv = convertToMp3(pcmPath, mp3Path).catch(console.error);
        converting.push(conv);
      });
    });

    streams.set(userId, writeStream);
  });

  activeRecordings.set(guildId, {
    receiver,
    streams,
    converting,
    outputDir,
    startedAt: Date.now(),
  });

  return outputDir;
}

async function stopRecording(guildId) {
  const recording = activeRecordings.get(guildId);
  if (!recording) return null;

  for (const stream of recording.streams.values()) {
    stream.end();
  }
  recording.streams.clear();
  recording.receiver.speaking.removeAllListeners("start");

  // Give streams a moment to flush then wait for all conversions
  await new Promise((r) => setTimeout(r, 500));
  await Promise.allSettled(recording.converting);

  activeRecordings.delete(guildId);
  return recording.outputDir;
}

function isRecording(guildId) {
  return activeRecordings.has(guildId);
}

function getRecordingInfo(guildId) {
  return activeRecordings.get(guildId) ?? null;
}

module.exports = {
  startRecording,
  stopRecording,
  isRecording,
  getRecordingInfo,
};
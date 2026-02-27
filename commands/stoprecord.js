const { reply } = require("../utils/tts");
const { stopRecording, isRecording } = require("../utils/recorder");
const fs = require("fs");

module.exports = {
  name: "stoprecord",
  description: "Stop the current recording and show output files",
  async execute(message) {
    const { guildId } = message;

    if (!isRecording(guildId)) {
      return reply(message, "❌ Not currently recording.");
    }

    await reply(message, "⏳ Stopping and converting to MP3, please wait...");

    const outputDir = await stopRecording(guildId);

    let files = [];
    try {
      files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".mp3"));
    } catch {
      // directory might be empty
    }

    const fileList = files.length
      ? files.map((f) => `• \`${f}\``).join("\n")
      : "No audio was captured.";

    return message.channel.send(
      `⏹️ Recording stopped!\n\n` +
      `📁 **Saved to:** \`${outputDir}\`\n` +
      `🎵 **MP3 Files (one per user):**\n${fileList}`
    );
  },
};
const { reply } = require("../utils/tts");
const { isRecording, getRecordingInfo } = require("../utils/recorder");

module.exports = {
  name: "recordstatus",
  description: "Check if a recording is currently active",
  execute(message) {
    const { guildId } = message;

    if (!isRecording(guildId)) {
      return reply(message, "⚪ Not currently recording.");
    }

    const info = getRecordingInfo(guildId);
    const elapsed = Math.floor((Date.now() - info.startedAt) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const activeUsers = info.streams.size;

    return reply(
      message,
      `🔴 **Recording in progress**\n` +
      `⏱️ Duration: **${minutes}m ${seconds}s**\n` +
      `🎙️ Active speakers: **${activeUsers}**\n` +
      `📁 Output: \`${info.outputDir}\``
    );
  },
};
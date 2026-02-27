const { getQueue, reply } = require("../utils/tts");
const { startRecording, isRecording } = require("../utils/recorder");

module.exports = {
  name: "record",
  description: "Start recording the voice channel (all users are notified)",
  async execute(message) {
    const { guildId } = message;

    if (!message.member?.voice?.channel) {
      return reply(message, "❌ You need to be in a voice channel first!");
    }

    const q = getQueue(guildId);
    if (!q.connection) {
      return reply(message, "❌ I'm not in a voice channel yet! Use `!join` first.");
    }

    if (isRecording(guildId)) {
      return reply(message, "⏺️ Already recording! Use `!stoprecord` to stop.");
    }

    // ── Consent notice — required before recording ────────────────────────────
    await message.channel.send(
      "⚠️ **Recording Notice**\n" +
      `**${message.member.displayName}** has started a recording in **${message.member.voice.channel.name}**.\n` +
      "🔴 **All users currently in this voice channel are being recorded.**\n" +
      "If you do not consent, please leave the voice channel now.\n" +
      "Use `!stoprecord` to stop."
    );

    const outputDir = startRecording(guildId, q.connection);
    if (!outputDir) {
      return reply(message, "❌ Failed to start recording.");
    }

    return reply(message, "🔴 Recording started! Each user will be saved as a separate `.pcm` file.");
  },
};
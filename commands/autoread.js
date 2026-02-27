const { autoReadChannels, getQueue, reply } = require("../utils/tts");

module.exports = {
  name: "autoread",
  description: "Toggle auto-reading all messages in this text channel (must be in a voice channel)",
  async execute(message) {
    const { guildId, channelId } = message;

    // If disabling, no voice check needed
    if (autoReadChannels.get(guildId) === channelId) {
      autoReadChannels.delete(guildId);
      return reply(message, "🔕 Auto-read **disabled** for this channel.");
    }

    // Require user to be in a voice channel to enable
    if (!message.member?.voice?.channel) {
      return reply(message, "❌ You need to be in a voice channel to enable auto-read!");
    }

    // Require bot to already be in a voice channel too
    const q = getQueue(guildId);
    if (!q.connection) {
      return reply(message, "❌ I'm not in a voice channel yet! Use `!join` first.");
    }

    autoReadChannels.set(guildId, channelId);
    return reply(
      message,
      "🔔 Auto-read **enabled**! I'll speak every message posted here."
    );
  },
};
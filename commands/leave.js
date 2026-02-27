const { getVoiceConnection } = require("@discordjs/voice");
const { getQueue, reply } = require("../utils/tts");

module.exports = {
  name: "leave",
  description: "Leave the voice channel and clear the queue",
  execute(message) {
    const conn = getVoiceConnection(message.guildId);
    if (!conn) return reply(message, "❌ I'm not in a voice channel.");

    conn.destroy();

    const q = getQueue(message.guildId);
    q.connection = null;
    q.player = null;
    q.playing = false;
    q.items = [];

    return reply(message, "👋 Left the voice channel.");
  },
};
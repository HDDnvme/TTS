const { getQueue, reply } = require("../utils/tts");

module.exports = {
  name: "clear",
  description: "Clear all queued TTS messages",
  execute(message) {
    const q = getQueue(message.guildId);
    q.items = [];
    if (q.player) q.player.stop();
    return reply(message, "🗑️ Queue cleared.");
  },
};

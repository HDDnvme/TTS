const { getQueue, reply } = require("../utils/tts");

module.exports = {
  name: "skip",
  description: "Skip the current TTS message",
  execute(message) {
    const q = getQueue(message.guildId);
    if (!q.player || !q.playing) {
      return reply(message, "Nothing is currently playing.");
    }
    q.player.stop();
    return reply(message, "⏭️ Skipped!");
  },
};

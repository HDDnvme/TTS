const { getQueue, enqueue, joinMemberChannel, userVoices, reply } = require("../utils/tts");
const { prefix } = require("../config.json");

module.exports = {
  name: "tts",
  description: "Speak text in the voice channel (auto-joins if needed)",
  async execute(message, args) {
    const text = args.join(" ");
    if (!text) return reply(message, `❌ Usage: \`${prefix}tts <text>\``);

    const q = getQueue(message.guildId);
    if (!q.connection) {
      const conn = await joinMemberChannel(message);
      if (!conn) return reply(message, "❌ Join a voice channel first!");
    }

    const { lang = "vi", slow = false } = userVoices.get(message.author.id) || {};
    enqueue(message.guildId, text, lang, slow);

    const preview = text.slice(0, 100) + (text.length > 100 ? "…" : "");
    return reply(message, `🔊 Queued: *${preview}*`);
  },
};
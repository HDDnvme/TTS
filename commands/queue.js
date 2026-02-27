const { getQueue, reply } = require("../utils/tts");

module.exports = {
  name: "queue",
  description: "Show the current TTS queue",
  execute(message) {
    const q = getQueue(message.guildId);

    if (q.items.length === 0) {
      return reply(message, "📭 The queue is empty.");
    }

    const list = q.items
      .slice(0, 10)
      .map((item, i) => `**${i + 1}.** ${item.text.slice(0, 60)}${item.text.length > 60 ? "…" : ""}`)
      .join("\n");

    const more = q.items.length > 10 ? `\n…and ${q.items.length - 10} more` : "";
    return reply(message, `📋 **Queue — ${q.items.length} item(s):**\n${list}${more}`);
  },
};

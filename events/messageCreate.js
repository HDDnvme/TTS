const { autoReadChannels, userVoices, getQueue, enqueue } = require("../utils/tts");
const config = require("../config.json");
const prefix = config.prefix ?? "!";

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const { guildId } = message;

    // ── Auto-read: speak non-command messages in the watched channel ───────────
    const autoChannelId = autoReadChannels.get(guildId);
    if (
      autoChannelId &&
      autoChannelId === message.channelId &&
      !message.content.startsWith(prefix)
    ) {
      const q = getQueue(guildId);
      if (q.connection) {
        const botChannelId = q.connection.joinConfig.channelId;
        const userChannelId = message.member?.voice?.channelId;
        if (userChannelId && userChannelId === botChannelId) {
          const { lang = "vi", slow = false } = userVoices.get(message.author.id) || {};
          const name = message.member?.displayName ?? message.author.username;
          enqueue(guildId, ` ${message.content}`, lang, slow);
        }
      }
      return; // always stop here, whether we spoke or not
    }

    // ── Command handling ───────────────────────────────────────────────────────
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
      await command.execute(message, args, client);
    } catch (err) {
      console.error(`[CMD] Error executing "${commandName}":`, err);
      message.reply("❌ Something went wrong while running that command.").catch(() => {});
    }
  },
};
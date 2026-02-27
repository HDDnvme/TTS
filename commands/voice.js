const { userVoices, reply } = require("../utils/tts");
const { prefix } = require("../config.json");

module.exports = {
  name: "voice",
  description: "Set your personal TTS language and speed",
  execute(message, args) {
    const lang = args[0];
    if (!lang) {
      return reply(
        message,
        `❌ Usage: \`${prefix}voice <lang> [slow]\` — e.g. \`${prefix}voice fr\` or \`${prefix}voice en slow\``
      );
    }

    const slow = args[1]?.toLowerCase() === "slow";
    userVoices.set(message.author.id, { lang, slow });

    return reply(
      message,
      `✅ Your TTS voice set to **${lang}**${slow ? " *(slow)*" : ""}.`
    );
  },
};
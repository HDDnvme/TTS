const { reply } = require("../utils/tts");
const { prefix } = require("../config.json");

module.exports = {
  name: "help",
  description: "Show all available commands",
  execute(message, _args, client) {
    // Dynamically build help from loaded commands
    const lines = [
      `**🔊 TTS Bot Commands** (prefix: \`${prefix}\`)`,
      "",
    ];

    for (const [name, cmd] of client.commands) {
      lines.push(`\`${prefix}${name}\` — ${cmd.description ?? "No description."}`);
    }

    lines.push("", `**Language codes:** \`en\`, \`en-uk\`, \`fr\`, \`es\`, \`de\`, \`it\`, \`pt\`, \`ja\`, \`ko\`, \`zh-CN\`, \`ru\`, \`ar\`, \`hi\` …`);

    return reply(message, lines.join("\n"));
  },
};
const { joinMemberChannel, reply } = require("../utils/tts");

module.exports = {
  name: "join",
  description: "Join your voice channel",
  async execute(message) {
    if (!message.member?.voice?.channel) {
      return reply(message, "❌ You need to be in a voice channel first!");
    }
    const conn = await joinMemberChannel(message);
    if (!conn) return reply(message, "❌ Couldn't connect to your voice channel.");
    return reply(message, `✅ Joined **${message.member.voice.channel.name}**!`);
  },
};
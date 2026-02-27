module.exports = {
  name: "aireset",
  description: "Reset your Gemini AI conversation history",
  execute(message, _args, client) {
    const aiCommand = client.commands.get("ai");
    if (!aiCommand?.histories) return message.reply("❌ AI command not loaded.");
    aiCommand.histories.delete(message.author.id);
    return message.reply("🔄 Your AI conversation history has been reset!");
  },
};
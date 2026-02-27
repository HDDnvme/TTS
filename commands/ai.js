const { GoogleGenerativeAI } = require("@google/generative-ai");
const { reply } = require("../utils/tts");

const genAI = new GoogleGenerativeAI(process.env.KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Per-user conversation history — exported so aireset.js can clear it
const histories = new Map(); // userId → [{role, parts}]

module.exports = {
  name: "ai",
  description: "Chat with Gemini AI (keeps conversation history per user)",
  histories,
  async execute(message, args) {
    const prompt = args.join(" ");
    if (!prompt) return reply(message, `❌ Usage: \`!ai <message>\``);

    if (!histories.has(message.author.id)) {
      histories.set(message.author.id, []);
    }
    const history = histories.get(message.author.id);

    const typingInterval = setInterval(() => message.channel.sendTyping(), 5000);
    message.channel.sendTyping();

    try {
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(prompt);
      const response = result.response.text();

      // Save to history
      history.push({ role: "user", parts: [{ text: prompt }] });
      history.push({ role: "model", parts: [{ text: response }] });

      // Cap history at 20 messages to avoid token overflow
      if (history.length > 20) history.splice(0, 2);

      clearInterval(typingInterval);

      // Split if over Discord's 2000 char limit
      if (response.length <= 2000) {
        return message.reply(response);
      }
      const chunks = response.match(/.{1,2000}/gs) ?? [];
      for (const chunk of chunks) {
        await message.channel.send(chunk);
      }
    } catch (err) {
      clearInterval(typingInterval);
      console.error("[AI]", err);
      return reply(message, "❌ Gemini failed to respond. Check your API key in `config.json`.");
    }
  },
};
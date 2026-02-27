module.exports = {
  name: "ping",
  description: "Check the bot's latency",
  async execute(message, _args, client) {
    const sent = await message.reply("🏓 Pinging...");
    const roundtrip = sent.createdTimestamp - message.createdTimestamp;
    const ws = client.ws.ping;
    sent.edit(`🏓 Pong! Roundtrip: **${roundtrip}ms** | WebSocket: **${ws}ms**`);
  },
};

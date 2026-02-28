const { resolveTracks, joinAndPlay, getMusicQueue } = require("../utils/music");

module.exports = {
  name: "play",
  description: "Play a song or playlist from YouTube, Spotify, or SoundCloud",
  async execute(message, args) {
    if(message.member.id != "1166922328786075778") {
      message.reply("mmb")
    }
    const query = args.join(" ");
    if (!query) return message.reply("❌ Usage: `!play <url or search query>`");

    if (!message.member?.voice?.channel) {
      return message.reply("❌ You need to be in a voice channel first!");
    }

    const msg = await message.reply("🔍 Searching...");

    let tracks;
    try {
      tracks = await resolveTracks(query, message.author.id);
    } catch (err) {
      console.error("[PLAY]", err);
      return msg.edit("❌ Couldn't find or resolve that track. Try a different query.");
    }

    if (!tracks.length) return msg.edit("❌ No results found.");

    const q = await joinAndPlay(message, tracks);
    if (!q) return msg.edit("❌ Couldn't connect to your voice channel.");

    if (tracks.length === 1) {
      return msg.edit(`✅ Added **${tracks[0].title}** to the queue.`);
    } else {
      return msg.edit(`✅ Added **${tracks.length} tracks** to the queue.`);
    }
  },
};
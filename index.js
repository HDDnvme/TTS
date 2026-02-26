const {
  Client,
  GatewayIntentBits,
} = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require("@discordjs/voice");
const gtts = require("gtts");
const fs = require("fs");
const path = require("path");
const {  prefix = "%" } = require("./config.json");


// ── State ─────────────────────────────────────────────────────────────────────
const queues = new Map();           // guildId → { player, connection, items[], playing }
const autoReadChannels = new Map(); // guildId → textChannelId
const userVoices = new Map();       // userId  → { lang, slow }

// ── Queue helpers ─────────────────────────────────────────────────────────────
function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, { player: null, connection: null, items: [], playing: false });
  }
  return queues.get(guildId);
}

async function speakNext(guildId) {
  const q = getQueue(guildId);
  if (q.playing || q.items.length === 0 || !q.connection) return;

  q.playing = true;
  const { text, lang, slow } = q.items.shift();
  const tmpFile = path.join(__dirname, `tts_${Date.now()}.mp3`);

  try {
    await new Promise((resolve, reject) => {
      const tts = new gtts(text, lang, slow);
      tts.save(tmpFile, (err) => (err ? reject(err) : resolve()));
    });

    const resource = createAudioResource(tmpFile);
    q.player.play(resource);

    q.player.once(AudioPlayerStatus.Idle, () => {
      fs.unlink(tmpFile, () => {});
      q.playing = false;
      speakNext(guildId);
    });

    q.player.once("error", () => {
      fs.unlink(tmpFile, () => {});
      q.playing = false;
      speakNext(guildId);
    });
  } catch (err) {
    console.error("TTS error:", err);
    q.playing = false;
    speakNext(guildId);
  }
}

function enqueue(guildId, text, lang = "vi", slow = false) {
  const q = getQueue(guildId);
  q.items.push({ text: text.slice(0, 500), lang, slow });
  speakNext(guildId);
}

// ── Voice channel helpers ─────────────────────────────────────────────────────
async function joinMemberChannel(message) {
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) return null;

  const q = getQueue(message.guildId);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guildId,
    adapterCreator: message.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    connection.destroy();
    return null;
  }

  if (!q.player) {
    q.player = createAudioPlayer();
  }
  connection.subscribe(q.player);
  q.connection = connection;

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      connection.destroy();
      q.connection = null;
      q.player = null;
      q.playing = false;
      q.items = [];
    }
  });

  return connection;
}

// ── Reply helper ──────────────────────────────────────────────────────────────
function reply(message, text) {
  return message.reply(text).catch(console.error);
}

// ── Help text ─────────────────────────────────────────────────────────────────
function buildHelp(p) {
  return [
    `**🔊 TTS Bot Commands** (prefix: \`${p}\`)`,
    ``,
    `\`${p}join\`            — Join your voice channel`,
    `\`${p}leave\`           — Leave voice & clear queue`,
    `\`${p}tts <text>\`      — Speak text (auto-joins if needed)`,
    `\`${p}skip\`            — Skip the current message`,
    `\`${p}clear\`           — Clear the entire queue`,
    `\`${p}queue\`           — Show queued messages`,
    `\`${p}autoread\`        — Toggle auto-read of this text channel`,
    `\`${p}voice <lang> [slow]\` — Set your language (e.g. \`${p}voice fr\` or \`${p}voice en slow\`)`,
    `\`${p}help\`            — Show this help`,
    ``,
    `**Language codes:** \`en\`, \`en-uk\`, \`fr\`, \`es\`, \`de\`, \`it\`, \`pt\`, \`ja\`, \`ko\`, \`zh-CN\`, \`ru\`, \`ar\`, \`hi\` …`,
  ].join("\n");
}

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`   Prefix: ${prefix}`);
});

// ── Message handler ───────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const { guildId } = message;
  const q = getQueue(guildId);

  // ── Auto-read (non-command messages in watched channel) ──────────────────
  const autoChannelId = autoReadChannels.get(guildId);
  if (autoChannelId && autoChannelId === message.channelId && !message.content.startsWith(prefix)) {
    if (q.connection) {
      const { lang = "vi", slow = false } = userVoices.get(message.author.id) || {};
      const name = message.member?.displayName ?? message.author.username;
      enqueue(guildId, ` ${message.content}`, lang, slow);
    }
    return;
  }

  // ── Command parsing ───────────────────────────────────────────────────────
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // ── !join ─────────────────────────────────────────────────────────────────
  if (command === "join") {
    if (!message.member?.voice?.channel) {
      return reply(message, "❌ You need to be in a voice channel first!");
    }
    const conn = await joinMemberChannel(message);
    if (!conn) return reply(message, "❌ Couldn't connect to your voice channel.");
    return reply(message, `✅ Joined **${message.member.voice.channel.name}**!`);
  }

  // ── !leave ────────────────────────────────────────────────────────────────
  if (command === "leave") {
    const conn = getVoiceConnection(guildId);
    if (!conn) return reply(message, "❌ I'm not in a voice channel.");
    conn.destroy();
    q.connection = null;
    q.player = null;
    q.playing = false;
    q.items = [];
    return reply(message, "👋 Left the voice channel.");
  }

  // ── !tts <text> ───────────────────────────────────────────────────────────
  if (command === "tts") {
    const text = args.join(" ");
    if (!text) return reply(message, `❌ Usage: \`${prefix}tts <text>\``);

    if (!q.connection) {
      const conn = await joinMemberChannel(message);
      if (!conn) return reply(message, "❌ Join a voice channel first!");
    }

    const { lang = "vi", slow = false } = userVoices.get(message.author.id) || {};
    enqueue(guildId, text, lang, slow);
    const preview = text.slice(0, 100) + (text.length > 100 ? "…" : "");
    return reply(message, `🔊 Queued: *${preview}*`);
  }

  // ── !skip ─────────────────────────────────────────────────────────────────
  if (command === "skip") {
    if (!q.player || !q.playing) return reply(message, "Nothing is currently playing.");
    q.player.stop();
    return reply(message, "⏭️ Skipped!");
  }

  // ── !clear ────────────────────────────────────────────────────────────────
  if (command === "clear") {
    q.items = [];
    if (q.player) q.player.stop();
    return reply(message, "🗑️ Queue cleared.");
  }

  // ── !queue ────────────────────────────────────────────────────────────────
  if (command === "queue") {
    if (q.items.length === 0) return reply(message, "📭 The queue is empty.");
    const list = q.items
      .slice(0, 10)
      .map((item, i) => `**${i + 1}.** ${item.text.slice(0, 60)}${item.text.length > 60 ? "…" : ""}`)
      .join("\n");
    const more = q.items.length > 10 ? `\n…and ${q.items.length - 10} more` : "";
    return reply(message, `📋 **Queue — ${q.items.length} item(s):**\n${list}${more}`);
  }

  // ── !autoread ─────────────────────────────────────────────────────────────
  if (command === "autoread") {
    if (autoReadChannels.get(guildId) === message.channelId) {
      autoReadChannels.delete(guildId);
      return reply(message, "🔕 Auto-read **disabled** for this channel.");
    }
    autoReadChannels.set(guildId, message.channelId);
    return reply(
      message,
      "🔔 Auto-read **enabled**! I'll speak every message posted here (while in a voice channel)."
    );
  }

  // ── !voice <lang> [slow] ──────────────────────────────────────────────────
  if (command === "voice") {
    const lang = args[0];
    if (!lang) return reply(message, `❌ Usage: \`${prefix}voice <lang>\` (e.g. \`${prefix}voice fr\`)`);
    const slow = args[1]?.toLowerCase() === "slow";
    userVoices.set(message.author.id, { lang, slow });
    return reply(
      message,
      `✅ Your TTS voice set to **${lang}**${slow ? " *(slow)*" : ""}.`
    );
  }

  // ── !help ─────────────────────────────────────────────────────────────────
  if (command === "help") {
    return reply(message, buildHelp(prefix));
  }
});

client.login(process.env.TOKEN);
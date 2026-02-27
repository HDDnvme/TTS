const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const gtts = require("gtts");
const fs = require("fs");
const path = require("path");

// ── Shared state ──────────────────────────────────────────────────────────────
const queues = new Map();           // guildId → { player, connection, items[], playing }
const autoReadChannels = new Map(); // guildId → textChannelId
const userVoices = new Map();       // userId  → { lang, slow }

// ── Queue ─────────────────────────────────────────────────────────────────────
function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, { player: null, connection: null, items: [], playing: false });
  }
  return queues.get(guildId);
}

// ── Get music queue without circular dependency ───────────────────────────────
function getMusicQueue(guildId) {
  try {
    return require("./music").getMusicQueue(guildId);
  } catch {
    return null;
  }
}

async function speakNext(guildId) {
  const q = getQueue(guildId);
  if (q.playing || q.items.length === 0 || !q.connection) return;

  q.playing = true;
  const { text, lang, slow } = q.items.shift();
  const tmpFile = path.join(__dirname, "..", `tts_${Date.now()}.mp3`);

  // ── Pause music if it's playing ───────────────────────────────────────────
  const mq = getMusicQueue(guildId);
  const wasMusicPlaying = mq?.playing && !mq?.paused;
  if (wasMusicPlaying) {
    mq.player?.pause();
    // Re-subscribe connection to TTS player
    q.connection.subscribe(q.player);
  }

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

      // ── Resume music after TTS finishes ────────────────────────────────────
      if (wasMusicPlaying && mq?.player) {
        q.connection.subscribe(mq.player);
        mq.player.unpause();
        mq.paused = false;
      }

      speakNext(guildId);
    });

    q.player.once("error", () => {
      fs.unlink(tmpFile, () => {});
      q.playing = false;

      if (wasMusicPlaying && mq?.player) {
        q.connection.subscribe(mq.player);
        mq.player.unpause();
        mq.paused = false;
      }

      speakNext(guildId);
    });
  } catch (err) {
    console.error("[TTS] Error generating audio:", err);
    q.playing = false;

    if (wasMusicPlaying && mq?.player) {
      q.connection.subscribe(mq.player);
      mq.player.unpause();
      mq.paused = false;
    }

    speakNext(guildId);
  }
}

function enqueue(guildId, text, lang = "vi", slow = false) {
  const q = getQueue(guildId);
  q.items.push({ text: text.slice(0, 500), lang, slow });
  speakNext(guildId);
}

// ── Voice ─────────────────────────────────────────────────────────────────────
async function joinMemberChannel(message) {
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) return null;

  const q = getQueue(message.guildId);

  // ── Reuse music connection if it exists ───────────────────────────────────
  const mq = getMusicQueue(message.guildId);
  if (mq?.connection) {
    if (!q.player) q.player = createAudioPlayer();
    q.connection = mq.connection;
    // Only subscribe TTS player temporarily when needed (speakNext handles this)
    return mq.connection;
  }

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

  if (!q.player) q.player = createAudioPlayer();
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

// ── Misc helpers ──────────────────────────────────────────────────────────────
function reply(message, text) {
  return message.reply(text).catch(console.error);
}

module.exports = {
  queues,
  autoReadChannels,
  userVoices,
  getQueue,
  enqueue,
  speakNext,
  joinMemberChannel,
  reply,
};
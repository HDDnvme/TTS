const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType,
} = require("@discordjs/voice");
const { EmbedBuilder } = require("discord.js");
const SpotifyWebApi = require("spotify-web-api-node");
const scdl = require("soundcloud-downloader").default;
const ytdl = require("ytdl-core");
const ytSearch = require("yt-search");
const config = require("../config.json");

// ── Spotify client ────────────────────────────────────────────────────────────
const spotify = new SpotifyWebApi({
  clientId: config.spotifyClientId,
  clientSecret: config.spotifyClientSecret,
});

let spotifyTokenExpiry = 0;
async function ensureSpotifyToken() {
  if (Date.now() < spotifyTokenExpiry) return;
  const data = await spotify.clientCredentialsGrant();
  spotify.setAccessToken(data.body.access_token);
  spotifyTokenExpiry = Date.now() + data.body.expires_in * 1000 - 60000;
}

// ── Music queues ──────────────────────────────────────────────────────────────
const musicQueues = new Map();

function getMusicQueue(guildId) {
  if (!musicQueues.has(guildId)) {
    musicQueues.set(guildId, {
      connection: null,
      player: null,
      tracks: [],
      current: null,
      playing: false,
      paused: false,
      loop: "off",
      volume: 100,
      textChannel: null,
    });
  }
  return musicQueues.get(guildId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSeconds(s) {
  s = s ?? 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

// ── Track resolution ──────────────────────────────────────────────────────────
async function searchYouTube(query) {
  const result = await ytSearch(query);
  const v = result.videos[0];
  if (!v) return null;
  return {
    title: v.title,
    url: v.url,
    duration: v.duration.timestamp,
    thumbnail: v.thumbnail,
    source: "youtube",
    requestedBy: null,
  };
}

async function resolveYouTube(query) {
  // Playlist
  if (query.includes("list=")) {
    const listId = new URL(query).searchParams.get("list");
    const result = await ytSearch({ listId });
    return result.videos.map((v) => ({
      title: v.title,
      url: v.url,
      duration: v.duration.timestamp,
      thumbnail: v.thumbnail,
      source: "youtube",
      requestedBy: null,
    }));
  }

  // Single URL
  if (ytdl.validateURL(query)) {
    const info = await ytdl.getBasicInfo(query);
    const v = info.videoDetails;
    return [{
      title: v.title,
      url: v.video_url,
      duration: formatSeconds(parseInt(v.lengthSeconds)),
      thumbnail: v.thumbnails?.[0]?.url ?? null,
      source: "youtube",
      requestedBy: null,
    }];
  }

  // Search
  const track = await searchYouTube(query);
  return track ? [track] : [];
}

async function resolveSpotify(url) {
  await ensureSpotifyToken();

  const trackMatch = url.match(/track\/([A-Za-z0-9]+)/);
  const playlistMatch = url.match(/playlist\/([A-Za-z0-9]+)/);
  const albumMatch = url.match(/album\/([A-Za-z0-9]+)/);

  let searchTerms = [];

  if (trackMatch) {
    const data = await spotify.getTrack(trackMatch[1]);
    const t = data.body;
    searchTerms.push(`${t.name} ${t.artists[0].name}`);
  } else if (playlistMatch) {
    const data = await spotify.getPlaylistTracks(playlistMatch[1]);
    searchTerms = data.body.items
      .filter((i) => i.track)
      .map((i) => `${i.track.name} ${i.track.artists[0].name}`);
  } else if (albumMatch) {
    const data = await spotify.getAlbumTracks(albumMatch[1]);
    searchTerms = data.body.items.map((t) => `${t.name} ${t.artists[0].name}`);
  }

  const tracks = [];
  for (const term of searchTerms.slice(0, 50)) {
    const track = await searchYouTube(term);
    if (track) tracks.push({ ...track, source: "spotify" });
  }
  return tracks;
}

async function resolveSoundCloud(url) {
  const info = await scdl.getInfo(url);
  return [{
    title: info.title,
    url,
    duration: formatSeconds(Math.floor(info.duration / 1000)),
    thumbnail: info.artwork_url,
    source: "soundcloud",
    requestedBy: null,
  }];
}

async function resolveTracks(query, requestedBy) {
  let tracks = [];
  if (query.includes("spotify.com")) {
    tracks = await resolveSpotify(query);
  } else if (query.includes("soundcloud.com")) {
    tracks = await resolveSoundCloud(query);
  } else {
    tracks = await resolveYouTube(query);
  }
  return tracks.map((t) => ({ ...t, requestedBy }));
}

// ── Audio streaming ───────────────────────────────────────────────────────────
async function createStream(track) {
  console.log(`[MUSIC] Streaming: "${track.title}" | ${track.url}`);

  if (track.source === "soundcloud") {
    const stream = await scdl.download(track.url);
    return createAudioResource(stream, { inlineVolume: true });
  }

  const stream = ytdl(track.url, {
    filter: "audioonly",
    quality: "highestaudio",
    highWaterMark: 1 << 25,
    requestOptions: {
      headers: {
        // Helps avoid 403s
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": config.ytCookie ?? "",
      },
    },
  });

  return createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });
}

// ── Playback ──────────────────────────────────────────────────────────────────
async function playNext(guildId) {
  const q = getMusicQueue(guildId);
  if (!q.connection) return;

  if (q.loop === "track" && q.current) {
    // replay same
  } else if (q.tracks.length > 0) {
    if (q.loop === "queue" && q.current) q.tracks.push(q.current);
    q.current = q.tracks.shift();
  } else {
    q.current = null;
    q.playing = false;
    if (q.textChannel) {
      q.textChannel.send("✅ Queue finished! Use `!play` to add more tracks.").catch(() => {});
    }
    return;
  }

  try {
    const resource = await createStream(q.current);
    resource.volume?.setVolume(q.volume / 100);
    q.player.play(resource);
    q.playing = true;
    q.paused = false;
    if (q.textChannel) {
      q.textChannel.send({ embeds: [nowPlayingEmbed(q.current, q)] }).catch(() => {});
    }
  } catch (err) {
    console.error("[MUSIC] Stream error:", err.message);
    if (q.textChannel) {
      q.textChannel.send(`❌ Failed to play **${q.current?.title}**, skipping...`).catch(() => {});
    }
    q.current = null;
    playNext(guildId);
  }
}

async function joinAndPlay(message, tracks) {
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) return null;

  const q = getMusicQueue(message.guildId);
  q.textChannel = message.channel;

  if (!q.connection) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guildId,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
    } catch {
      connection.destroy();
      return null;
    }

    if (!q.player) {
      q.player = createAudioPlayer();
      q.player.on(AudioPlayerStatus.Idle, () => {
        q.playing = false;
        playNext(message.guildId);
      });
      q.player.on("error", (err) => {
        console.error("[MUSIC] Player error:", err.message);
        q.playing = false;
        playNext(message.guildId);
      });
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
        q.tracks = [];
        q.current = null;
      }
    });
  }

  q.tracks.push(...tracks);
  if (!q.playing) playNext(message.guildId);
  return q;
}

// ── Embeds ────────────────────────────────────────────────────────────────────
const sourceEmoji = { youtube: "🎥", spotify: "💚", soundcloud: "🟠" };

function nowPlayingEmbed(track, q) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎵 Now Playing")
    .setDescription(`**[${track.title}](${track.url})**`)
    .setThumbnail(track.thumbnail ?? null)
    .addFields(
      { name: "Duration", value: track.duration ?? "?", inline: true },
      { name: "Source", value: `${sourceEmoji[track.source] ?? "🎵"} ${track.source}`, inline: true },
      { name: "Requested by", value: track.requestedBy ? `<@${track.requestedBy}>` : "Unknown", inline: true },
      { name: "Loop", value: q.loop === "off" ? "🔁 Off" : q.loop === "track" ? "🔂 Track" : "🔁 Queue", inline: true },
      { name: "Volume", value: `🔊 ${q.volume}%`, inline: true },
      { name: "Queue", value: `${q.tracks.length} track(s) remaining`, inline: true },
    );
}

function queueEmbed(q, page = 1) {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(q.tracks.length / pageSize));
  const start = (page - 1) * pageSize;
  const slice = q.tracks.slice(start, start + pageSize);
  const lines = slice.map(
    (t, i) => `**${start + i + 1}.** [${t.title}](${t.url}) — \`${t.duration ?? "?"}\` — <@${t.requestedBy ?? "?"}>`
  );
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Music Queue")
    .setDescription(
      (q.current ? `**Now Playing:** [${q.current.title}](${q.current.url})\n\n` : "") +
      (lines.length ? lines.join("\n") : "No tracks in queue.")
    )
    .setFooter({ text: `Page ${page}/${totalPages} • ${q.tracks.length} track(s) total • Loop: ${q.loop}` });
}

function destroyMusicQueue(guildId) {
  const conn = getVoiceConnection(guildId);
  if (conn) conn.destroy();
  musicQueues.delete(guildId);
}

module.exports = {
  getMusicQueue,
  resolveTracks,
  joinAndPlay,
  playNext,
  nowPlayingEmbed,
  queueEmbed,
  destroyMusicQueue,
  formatSeconds,
};
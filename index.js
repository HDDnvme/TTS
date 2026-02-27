const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { token } = require("./config.json");

// ── Client setup ──────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Store commands on the client so events can access them
client.commands = new Collection();

// ── Load commands ─────────────────────────────────────────────────────────────
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  if (!command.name) {
    console.warn(`[WARN] commands/${file} is missing a "name" export — skipped.`);
    continue;
  }
  client.commands.set(command.name, command);
  console.log(`[CMD]  Loaded: ${command.name}`);
}

// ── Load events ───────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, "events");
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"))) {
  const event = require(path.join(eventsPath, file));
  if (!event.name || !event.execute) {
    console.warn(`[WARN] events/${file} is missing "name" or "execute" — skipped.`);
    continue;
  }
  const method = event.once ? "once" : "on";
  client[method](event.name, (...args) => event.execute(...args, client));
  console.log(`[EVT]  Loaded: ${event.name}`);
}

// ── Start ─────────────────────────────────────────────────────────────────────
client.login(token);
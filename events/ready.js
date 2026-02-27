const { prefix } = require("../config.json");

module.exports = {
  name: "clientReady",
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`   Prefix  : ${prefix}`);
    console.log(`   Commands: ${client.commands.size} loaded`);
  },
};

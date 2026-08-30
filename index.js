const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme123';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once('ready', () => {
  console.log(`Pusacat is online as ${client.user.tag}`);
});

// Web Dashboard Route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Pusacat Control Panel</title></head>
      <body style="font-family: sans-serif; background: #1e1e1e; color: #fff; padding: 40px;">
        <h2>🐾 Pusacat Control Panel</h2>
        <p>Use the links below to control your stand-in bot:</p>
        <ul>
          <li><a href="/join?channelId=YOUR_VC_ID&token=${ADMIN_TOKEN}" style="color: #4da6ff;">Join Voice Channel</a></li>
          <li><a href="/deafen?state=true&token=${ADMIN_TOKEN}" style="color: #4da6ff;">Deafen Bot</a></li>
          <li><a href="/deafen?state=false&token=${ADMIN_TOKEN}" style="color: #4da6ff;">Undeafen Bot</a></li>
          <li><a href="/leave&token=${ADMIN_TOKEN}" style="color: #ff4d4d;">Leave Voice Channel</a></li>
        </ul>
      </body>
    </html>
  `);
});

// Middleware for token validation
app.use((req, res, next) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send('Unauthorized: Invalid or missing token.');
  }
  next();
});

// Join or Move Channel
app.get('/join', async (req, res) => {
  const channelId = req.query.channelId;
  const guildId = process.env.GUILD_ID;

  if (!channelId) return res.send('Missing channelId parameter.');

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isVoiceBased()) {
      return res.send('Invalid voice channel ID.');
    }

    joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true, // Default to deafened as a stand-in
    });

    res.send(`Pusacat moved to channel: ${channel.name}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error joining channel.');
  }
});

// Deafen / Undeafen Route
app.get('/deafen', (req, res) => {
  const guildId = process.env.GUILD_ID;
  const connection = getVoiceConnection(guildId);

  if (!connection) return res.send('Pusacat is not connected to a voice channel.');

  const shouldDeafen = req.query.state === 'true';
  
  // Update local voice state subscription or manage via guild member cache
  const guild = client.guilds.cache.get(guildId);
  guild.members.me.voice.setDeaf(shouldDeafen)
    .then(() => res.send(`Bot deafen state set to: ${shouldDeafen}`))
    .catch(err => res.status(500).send('Failed to change deafen state.'));
});

// Leave Channel
app.get('/leave', (req, res) => {
  const guildId = process.env.GUILD_ID;
  const connection = getVoiceConnection(guildId);

  if (connection) {
    connection.destroy();
    res.send('Pusacat has left the voice channel.');
  } else {
    res.send('Pusacat is not currently in a voice channel.');
  }
});

client.login(process.env.DISCORD_TOKEN);
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));

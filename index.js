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
        <p>Control your stand-in bot remotely:</p>
        
        <!-- Join Voice Channel Form -->
        <form action="/join" method="GET" style="margin-bottom: 20px;">
          <input type="hidden" name="token" value="${ADMIN_TOKEN}">
          <label style="display: block; margin-bottom: 5px;">Voice Channel ID:</label>
          <input type="text" name="channelId" placeholder="Paste VC ID here..." style="padding: 8px; width: 300px; margin-right: 10px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px;">
          <button type="submit" style="padding: 8px 16px; background: #4da6ff; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Join VC</button>
        </form>

        <!-- Quick Action Buttons -->
        <p>
          <a href="/deafen?state=true&token=${ADMIN_TOKEN}" style="color: #4da6ff; margin-right: 15px;">Deafen Bot</a>
          <a href="/deafen?state=false&token=${ADMIN_TOKEN}" style="color: #4da6ff; margin-right: 15px;">Undeafen Bot</a>
          <a href="/leave?token=${ADMIN_TOKEN}" style="color: #ff4d4d;">Leave Voice Channel</a>
        </p>
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

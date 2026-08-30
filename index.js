const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const express = require('express');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

app.use(basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD || 'secretpassword' },
  challenge: true,
  realm: 'PusacatPanel',
}));

client.once('ready', () => {
  console.log(`Pusacat is online as ${client.user.tag}`);
});

const renderDashboard = async (res, errorMessage = '') => {
  const guildId = process.env.GUILD_ID;
  let voiceChannels = [];
  let textChannels = [];

  try {
    if (guildId) {
      const guild = await client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      voiceChannels = channels.filter(c => c.isVoiceBased()).map(c => ({ id: c.id, name: c.name }));
      textChannels = channels.filter(c => c.isTextBased() && !c.isThread()).map(c => ({ id: c.id, name: c.name }));
    }
  } catch (err) {
    errorMessage = errorMessage ? `${errorMessage} | ${err.message}` : err.message;
  }

  res.send(`
    <html>
      <head><title>Pusacat Control Panel</title></head>
      <body style="font-family: sans-serif; background: #1e1e1e; color: #fff; padding: 40px;">
        <h2>🐾 Pusacat Control Panel</h2>
        
        ${errorMessage ? `<div style="padding: 12px; margin-bottom: 20px; border-radius: 4px; background: #5c1d1d; border: 1px solid #ff4d4d;"><strong>Error:</strong> ${errorMessage}</div>` : ''}

        <!-- Join Voice Channel Form -->
        <form action="/join" method="GET" style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px;">Select Voice Channel:</label>
          <select name="channelId" style="padding: 8px; width: 300px; margin-right: 10px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px;">
            <option value="">-- Choose Voice Channel --</option>
            ${voiceChannels.map(vc => `<option value="${vc.id}">${vc.name} (${vc.id})</option>`).join('')}
          </select>
          <button type="submit" style="padding: 8px 16px; background: #4da6ff; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Join VC</button>
        </form>

        <!-- Text Channels List for Reference -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px;">Chatable Channels Reference:</label>
          <select style="padding: 8px; width: 300px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px;" disabled>
            <option value="">-- Text Channels --</option>
            ${textChannels.map(tc => `<option value="${tc.id}">${tc.name} (${tc.id})</option>`).join('')}
          </select>
        </div>

        <!-- Audio State Controls -->
        <p>
          <a href="/audio?mute=true" style="color: #4da6ff; margin-right: 15px;">Self Mute On</a>
          <a href="/audio?mute=false" style="color: #4da6ff; margin-right: 15px;">Self Mute Off</a>
          <a href="/audio?deaf=true" style="color: #4da6ff; margin-right: 15px;">Self Deafen On</a>
          <a href="/audio?deaf=false" style="color: #4da6ff; margin-right: 15px;">Self Deafen Off</a>
          <a href="/leave" style="color: #ff4d4d;">Leave VC</a>
        </p>
      </body>
    </html>
  `);
};

app.get('/', async (req, res) => {
  await renderDashboard(res);
});

app.get('/join', async (req, res) => {
  const channelId = req.query.channelId;
  const guildId = process.env.GUILD_ID;

  if (!channelId) return renderDashboard(res, 'Missing channelId parameter.');
  if (!guildId) return renderDashboard(res, 'GUILD_ID environment variable is not set.');

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isVoiceBased()) {
      return renderDashboard(res, `Invalid voice channel ID: ${channelId}`);
    }

    joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    await renderDashboard(res);
  } catch (err) {
    console.error(err);
    await renderDashboard(res, err.message);
  }
});

app.get('/audio', async (req, res) => {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return renderDashboard(res, 'GUILD_ID environment variable is not set.');

  const guild = client.guilds.cache.get(guildId);
  if (!guild || !guild.members.me) {
    return renderDashboard(res, 'Guild member cache unavailable for bot.');
  }

  try {
    if (req.query.mute !== undefined) {
      const shouldMute = req.query.mute === 'true';
      await guild.members.me.voice.setSelfMute(shouldMute);
    }
    if (req.query.deaf !== undefined) {
      const shouldDeaf = req.query.deaf === 'true';
      await guild.members.me.voice.setSelfDeaf(shouldDeaf);
    }
    await renderDashboard(res);
  } catch (err) {
    console.error(err);
    await renderDashboard(res, err.message);
  }
});

app.get('/leave', async (req, res) => {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return renderDashboard(res, 'GUILD_ID environment variable is not set.');

  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
  }
  await renderDashboard(res);
});

client.login(process.env.DISCORD_TOKEN);
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));

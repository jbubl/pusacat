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

const renderDashboard = async (res, rawError = '') => {
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
    rawError = rawError ? `${rawError} | ${err.message}` : err.message;
  }

  res.send(`
    <html>
      <head><title>Pusacat Control Panel</title></head>
      <body style="font-family: sans-serif; background: #1e1e1e; color: #fff; padding: 40px;">
        <h2>🐾 Pusacat Control Panel</h2>
        
        ${rawError ? `<div style="padding: 12px; margin-bottom: 20px; border-radius: 4px; background: #5c1d1d; border: 1px solid #ff4d4d;"><strong>Error:</strong> ${rawError}</div>` : ''}

        <!-- Join Voice Channel Dropdown Form -->
        <form action="/join" method="GET" style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px;">Target Voice Channel:</label>
          <select name="channelId" style="padding: 8px; width: 320px; margin-right: 10px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px;">
            <option value="">-- Choose Voice Channel --</option>
            ${voiceChannels.map(vc => `<option value="${vc.id}">${vc.name} (${vc.id})</option>`).join('')}
          </select>
          <button type="submit" style="padding: 8px 16px; background: #4da6ff; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Join VC</button>
        </form>

        <!-- Chatable Text Channels Dropdown Reference -->
        <div style="margin-bottom: 25px;">
          <label style="display: block; margin-bottom: 5px;">Chatable Channels (Reference):</label>
          <select style="padding: 8px; width: 320px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px;">
            <option value="">-- Text Channels --</option>
            ${textChannels.map(tc => `<option value="${tc.id}">${tc.name} (${tc.id})</option>`).join('')}
          </select>
        </div>

        <!-- Self Audio States & Disconnect -->
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

  const connection = getVoiceConnection(guildId);
  if (!connection) return renderDashboard(res, 'Pusacat is not connected to a voice channel.');

  try {
    const shouldMute = req.query.mute === 'true';
    const shouldDeaf = req.query.deaf === 'true';

    // Modify the underlying voice UDP client connection directly if active
    const reconnectAddress = connection.joinConfig.channelId;
    
    // Re-join the same channel with updated self-deaf / self-mute parameters
    joinVoiceChannel({
      channelId: reconnectAddress,
      guildId: guildId,
      adapterCreator: connection.voiceAdapterCreator,
      selfDeaf: shouldDeaf,
      selfMute: shouldMute,
    });

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

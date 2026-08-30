const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const express = require('express');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ]
});

app.use(basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD },
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
  let currentMuteState = false;
  let currentDeafState = true;

  try {
    if (guildId) {
      const guild = await client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      voiceChannels = channels.filter(c => c.isVoiceBased()).map(c => ({ id: c.id, name: c.name }));
      textChannels = channels.filter(c => c.isTextBased() && !c.isThread()).map(c => ({ id: c.id, name: c.name }));

      const connection = getVoiceConnection(guildId);
      if (connection && connection.joinConfig) {
        currentMuteState = !!connection.joinConfig.selfMute;
        currentDeafState = connection.joinConfig.selfDeaf !== undefined ? connection.joinConfig.selfDeaf : true;
      }
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

        <!-- Send Text Message Form -->
        <form action="/send" method="GET" style="margin-bottom: 25px;">
          <label style="display: block; margin-bottom: 5px;">Send Text Message:</label>
          <select name="channelId" style="padding: 8px; width: 320px; margin-bottom: 8px; display: block; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px;">
            <option value="">-- Choose Text Channel --</option>
            ${textChannels.map(tc => `<option value="${tc.id}">${tc.name} (${tc.id})</option>`).join('')}
          </select>
          <input type="text" name="message" placeholder="Type message here..." style="padding: 8px; width: 320px; margin-right: 10px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px;" required>
          <button type="submit" style="padding: 8px 16px; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Send</button>
        </form>

        <!-- Dynamic Toggle Audio States & Disconnect -->
        <p>
          <a href="/audio?mute=${!currentMuteState}&deaf=${currentDeafState}" style="color: #fff; background: ${currentMuteState ? '#a72828' : '#28a745'}; padding: 8px 14px; text-decoration: none; border-radius: 4px; margin-right: 10px; display: inline-block;">
            ${currentMuteState ? 'Unmute' : 'Mute'}
          </a>
          <a href="/audio?mute=${currentMuteState}&deaf=${!currentDeafState}" style="color: #fff; background: ${currentDeafState ? '#a72828' : '#28a745'}; padding: 8px 14px; text-decoration: none; border-radius: 4px; margin-right: 15px; display: inline-block;">
            ${currentDeafState ? 'Undeafen' : 'Deafen'}
          </a>
          <a href="/leave" style="color: #fff; background: #dc3545; padding: 8px 14px; text-decoration: none; border-radius: 4px; display: inline-block;">Leave VC</a>
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

    const existingConn = getVoiceConnection(guildId);
    const currentDeaf = existingConn ? !!existingConn.joinConfig.selfDeaf : true;
    const currentMute = existingConn ? !!existingConn.joinConfig.selfMute : false;

    joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: currentDeaf,
      selfMute: currentMute,
    });

    await renderDashboard(res);
  } catch (err) {
    console.error(err);
    await renderDashboard(res, err.message);
  }
});

app.get('/send', async (req, res) => {
  const { channelId, message } = req.query;
  if (!channelId || !message) return renderDashboard(res, 'Missing channelId or message parameter.');

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return renderDashboard(res, `Invalid text channel ID: ${channelId}`);
    }
    await channel.send(message);
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

    joinVoiceChannel({
      channelId: connection.joinConfig.channelId,
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

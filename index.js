const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const express = require('express');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

// Unauthenticated health check endpoint for UptimeRobot
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use(basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD },
  challenge: true,
  realm: 'PusacatPanel',
}));

client.once('ready', () => {
  console.log(`Pusacat is online as ${client.user.tag}`);
});

const escapeHtml = (str) => {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const renderDashboard = async (res, rawError = '', forceFetch = false) => {
  const guildId = process.env.GUILD_ID;
  let voiceChannels = [];
  let textChannels = [];
  let currentMuteState = false;
  let currentDeafState = true;

  try {
    if (guildId) {
      const guild = await client.guilds.fetch(guildId);
      
      // Force clear the cache if the refresh button was clicked
      if (forceFetch) {
        guild.channels.cache.clear();
      }

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

  const safeError = escapeHtml(rawError);

  res.send(`
    <html>
      <head><title>Pusacat Control Panel</title></head>
      <body style="font-family: sans-serif; background: #1e1e1e; color: #fff; margin: 0; padding: 40px; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
        <div style="background: #252526; padding: 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 100%; max-width: 420px; box-sizing: border-box;">
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="margin: 0;">🐾 Pusacat Panel</h2>
            <form action="/" method="GET" style="margin: 0;">
              <button type="submit" style="background: #333; color: #aaa; border: 1px solid #555; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Refresh</button>
            </form>
          </div>
          
          ${safeError ? `<div style="padding: 10px; margin-bottom: 20px; border-radius: 4px; background: #5c1d1d; border: 1px solid #ff4d4d; font-size: 14px;"><strong>Error:</strong> ${safeError}</div>` : ''}

          <!-- Join Voice Channel Dropdown Form -->
          <form action="/join" method="POST" style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #ccc;">Target Voice Channel:</label>
            <select name="channelId" style="padding: 8px; width: 100%; margin-bottom: 10px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px; box-sizing: border-box;">
              <option value="">-- Choose Voice Channel --</option>
              ${voiceChannels.map(vc => `<option value="${escapeHtml(vc.id)}">${escapeHtml(vc.name)}</option>`).join('')}
            </select>
            <button type="submit" style="padding: 8px 16px; background: #4da6ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold;">Join VC</button>
          </form>

          <!-- Send Text Message Form -->
          <form action="/send" method="POST" style="margin-bottom: 25px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #ccc;">Send Text Message:</label>
            <select name="channelId" style="padding: 8px; width: 100%; margin-bottom: 8px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px; box-sizing: border-box;">
              <option value="">-- Choose Text Channel --</option>
              ${textChannels.map(tc => `<option value="${escapeHtml(tc.id)}">${escapeHtml(tc.name)}</option>`).join('')}
            </select>
            <input type="text" name="message" placeholder="Type message here..." style="padding: 8px; width: 100%; margin-bottom: 10px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px; box-sizing: border-box;" required>
            <button type="submit" style="padding: 8px 16px; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold;">Send</button>
          </form>

          <!-- Dynamic Toggle Audio States & Disconnect -->
          <div style="display: flex; gap: 8px;">
            <form action="/audio" method="POST" style="flex: 1; margin: 0;">
              <input type="hidden" name="mute" value="${!currentMuteState}">
              <input type="hidden" name="deaf" value="${currentDeafState}">
              <button type="submit" style="width: 100%; color: #fff; background: ${currentMuteState ? '#a72828' : '#333'}; padding: 8px; border: 1px solid #555; border-radius: 4px; cursor: pointer; font-size: 13px;">
                ${currentMuteState ? 'Unmute' : 'Mute'}
              </button>
            </form>
            <form action="/audio" method="POST" style="flex: 1; margin: 0;">
              <input type="hidden" name="mute" value="${currentMuteState}">
              <input type="hidden" name="deaf" value="${!currentDeafState}">
              <button type="submit" style="width: 100%; color: #fff; background: ${currentDeafState ? '#a72828' : '#333'}; padding: 8px; border: 1px solid #555; border-radius: 4px; cursor: pointer; font-size: 13px;">
                ${currentDeafState ? 'Undeafen' : 'Deafen'}
              </button>
            </form>
            <form action="/leave" method="POST" style="flex: 1; margin: 0;">
              <button type="submit" style="width: 100%; color: #fff; background: #dc3545; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;">Leave</button>
            </form>
          </div>

        </div>
      </body>
    </html>
  `);
};

app.get('/', async (req, res) => {
  await renderDashboard(res, '', true);
});

app.post('/join', async (req, res) => {
  const channelId = req.body.channelId;
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

app.post('/send', async (req, res) => {
  const { channelId, message } = req.body;
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

app.post('/audio', async (req, res) => {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return renderDashboard(res, 'GUILD_ID environment variable is not set.');

  const connection = getVoiceConnection(guildId);
  if (!connection) return renderDashboard(res, 'Pusacat is not connected to a voice channel.');

  try {
    const shouldMute = req.body.mute === 'true';
    const shouldDeaf = req.body.deaf === 'true';

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

app.post('/leave', async (req, res) => {
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

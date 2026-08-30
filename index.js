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

// Protect all web routes with Basic Auth
app.use(basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD || 'secretpassword' },
  challenge: true,
  realm: 'PusacatPanel',
}));

client.once('ready', () => {
  console.log(`Pusacat is online as ${client.user.tag}`);
});

// Helper to render the dashboard with an optional status/debug message
const renderDashboard = (res, message = '', isError = false) => {
  res.send(`
    <html>
      <head><title>Pusacat Control Panel</title></head>
      <body style="font-family: sans-serif; background: #1e1e1e; color: #fff; padding: 40px;">
        <h2>🐾 Pusacat Control Panel</h2>
        
        ${message ? `<div style="padding: 12px; margin-bottom: 20px; border-radius: 4px; background: ${isError ? '#5c1d1d' : '#1d5c2d'}; border: 1px solid ${isError ? '#ff4d4d' : '#4dff6a'};"><strong>${isError ? 'Error/Debug:' : 'Status:'}</strong> ${message}</div>` : ''}

        <form action="/join" method="GET" style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 5px;">Voice Channel ID:</label>
          <input type="text" name="channelId" placeholder="Paste VC ID here..." style="padding: 8px; width: 300px; margin-right: 10px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 4px;">
          <button type="submit" style="padding: 8px 16px; background: #4da6ff; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Join VC</button>
        </form>

        <p>
          <a href="/deafen?state=true" style="color: #4da6ff; margin-right: 15px;">Deafen Bot</a>
          <a href="/deafen?state=false" style="color: #4da6ff; margin-right: 15px;">Undeafen Bot</a>
          <a href="/leave" style="color: #ff4d4d;">Leave Voice Channel</a>
        </p>
      </body>
    </html>
  `);
});

app.get('/', (req, res) => {
  renderDashboard(res);
});

app.get('/join', async (req, res) => {
  const channelId = req.query.channelId;
  const guildId = process.env.GUILD_ID;

  if (!channelId) return renderDashboard(res, 'Missing channelId parameter.', true);
  if (!guildId) return renderDashboard(res, 'Server error: GUILD_ID environment variable is not set on Render.', true);

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isVoiceBased()) {
      return renderDashboard(res, `Invalid voice channel ID or channel is not voice-based (ID provided: ${channelId})`, true);
    }

    joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    renderDashboard(res, `Successfully joined channel: "${channel.name}" (${channel.id})`);
  } catch (err) {
    console.error(err);
    renderDashboard(res, `Failed to join channel. Details: ${err.message}`, true);
  }
});

app.get('/deafen', (req, res) => {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return renderDashboard(res, 'Server error: GUILD_ID environment variable is not set.', true);

  const connection = getVoiceConnection(guildId);
  if (!connection) return renderDashboard(res, 'Pusacat is not currently connected to any voice channel.', true);

  const shouldDeafen = req.query.state === 'true';
  const guild = client.guilds.cache.get(guildId);
  
  if (!guild || !guild.members.me) {
    return renderDashboard(res, 'Could not resolve bot guild member profile.', true);
  }

  guild.members.me.voice.setDeaf(shouldDeafen)
    .then(() => renderDashboard(res, `Successfully updated deafen state to: ${shouldDeafen}`))
    .catch(err => renderDashboard(res, `Failed to change deafen state. Details: ${err.message}`, true));
});

app.get('/leave', (req, res) => {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return renderDashboard(res, 'Server error: GUILD_ID environment variable is not set.', true);

  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    renderDashboard(res, 'Pusacat has left the voice channel.');
  } else {
    renderDashboard(res, 'Pusacat is not currently in a voice channel.', true);
  }
});

client.login(process.env.DISCORD_TOKEN);
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));

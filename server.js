/**
 * LiftCom relay server – host on Railway (or any Node host).
 * Clients connect via WebSocket; server forwards presence and audio per channel.
 *
 * Message format (JSON): { type: "presence"|"audio", channel: 1-4, deviceId?: string, data?: string (base64) }
 * Audio is base64-encoded PCM. Server broadcasts to all other clients on the same channel.
 */

const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.get('/health', (req, res) => res.send('ok'));

const server = app.listen(PORT, () => {
  console.log(`LiftCom relay listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server, path: '/liftcom' });

// channel -> Set of WebSocket clients (each has .deviceId)
const channels = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };

function getChannel(ch) {
  const c = Math.max(1, Math.min(4, Number(ch) || 1));
  if (!channels[c]) channels[c] = new Set();
  return channels[c];
}

wss.on('connection', (ws, req) => {
  let deviceId = null;
  let channel = 1;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const chNum = Math.max(1, Math.min(4, Number(msg.channel) || 1));
      const ch = getChannel(chNum);
      if (msg.type === 'join') {
        channel = chNum;
        deviceId = msg.deviceId || null;
        ws.channel = channel;
        ws.deviceId = deviceId;
        ch.add(ws);
        broadcast(ch, { type: 'presence', channel: chNum, deviceId }, ws);
        return;
      }
      if (msg.type === 'presence') {
        channel = chNum;
        ws.channel = channel;
        if (msg.deviceId) { deviceId = msg.deviceId; ws.deviceId = deviceId; }
        ch.add(ws);
        broadcast(ch, { type: 'presence', channel: chNum, deviceId: deviceId || ws.deviceId }, ws);
        return;
      }
      if (msg.type === 'audio' && msg.data) {
        ch.add(ws);
        broadcast(ch, { type: 'audio', channel: chNum, data: msg.data }, ws);
      }
    } catch (e) {
      // ignore bad messages
    }
  });

  ws.on('close', () => {
    const ch = getChannel(channel);
    ch.delete(ws);
    if (deviceId) {
      broadcast(ch, { type: 'leave', channel, deviceId }, null);
    }
  });
});

function broadcast(channelSet, payload, excludeWs) {
  const data = JSON.stringify(payload);
  channelSet.forEach((client) => {
    if (client === excludeWs) return;
    if (client.readyState === 1) client.send(data);
  });
}

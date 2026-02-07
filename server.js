/**
 * LiftCom relay – floor control + presence + audio.
 * Relay includes "from" (deviceId) on every audio message so clients can show "Talking: [user]".
 * Floor: one speaker per channel; request_floor / release_floor; broadcast floor_taken, floor_released, transmission_ended.
 */

const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const FLOOR_TIMEOUT_MS = 5000;

const app = express();
app.use(express.json());
app.get('/health', (req, res) => res.send('ok'));

const server = app.listen(PORT, () => {
  console.log(`LiftCom relay listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server, path: '/liftcom' });

const channels = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
const floorHolder = { 1: null, 2: null, 3: null, 4: null };
const floorTimeout = { 1: null, 2: null, 3: null, 4: null };

function getChannel(ch) {
  const c = Math.max(1, Math.min(4, Number(ch) || 1));
  if (!channels[c]) channels[c] = new Set();
  return { num: c, set: channels[c] };
}

function broadcast(channelSet, payload, excludeWs = null) {
  const data = JSON.stringify(payload);
  channelSet.forEach((client) => {
    if (client === excludeWs) return;
    if (client.readyState === 1) client.send(data);
  });
}

function clearFloor(chNum) {
  const prev = floorHolder[chNum];
  floorHolder[chNum] = null;
  if (floorTimeout[chNum]) {
    clearTimeout(floorTimeout[chNum]);
    floorTimeout[chNum] = null;
  }
  if (prev) {
    const ch = getChannel(chNum);
    broadcast(ch.set, { type: 'transmission_ended', channel: chNum, deviceId: prev });
  }
}

wss.on('connection', (ws, req) => {
  let deviceId = null;
  let channel = 1;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const { num: chNum, set: ch } = getChannel(msg.channel);
      const chNumKey = chNum;

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

      if (msg.type === 'request_floor') {
        channel = chNum;
        ch.add(ws);
        const current = floorHolder[chNumKey];
        if (current && current !== (msg.deviceId || deviceId)) {
          ws.send(JSON.stringify({ type: 'floor_busy', channel: chNum }));
          return;
        }
        clearFloor(chNumKey);
        floorHolder[chNumKey] = msg.deviceId || deviceId;
        broadcast(ch, { type: 'floor_taken', channel: chNum, deviceId: floorHolder[chNumKey] });
        if (floorTimeout[chNumKey]) clearTimeout(floorTimeout[chNumKey]);
        floorTimeout[chNumKey] = setTimeout(() => clearFloor(chNumKey), FLOOR_TIMEOUT_MS);
        return;
      }

      if (msg.type === 'release_floor') {
        const id = msg.deviceId || deviceId;
        if (floorHolder[chNumKey] === id) {
          clearFloor(chNumKey);
          broadcast(ch, { type: 'floor_released', channel: chNum, deviceId: id });
        }
        return;
      }

      if (msg.type === 'audio' && msg.data) {
        ch.add(ws);
        const from = msg.from || msg.deviceId || deviceId;
        broadcast(ch, { type: 'audio', channel: chNum, data: msg.data, from }, ws);
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    const ch = getChannel(channel);
    ch.set.delete(ws);
    if (deviceId) {
      broadcast(ch.set, { type: 'leave', channel, deviceId }, null);
      if (floorHolder[channel] === deviceId) {
        clearFloor(channel);
        broadcast(ch.set, { type: 'transmission_ended', channel, deviceId });
      }
    }
  });
});

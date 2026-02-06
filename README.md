# LiftCom relay server

Simple WebSocket relay for LiftCom PTT: presence and audio per channel. Deploy to Railway (or any Node host).

## Deploy on Railway

1. Create a new project at [railway.app](https://railway.app).
2. Add a new service → **Deploy from GitHub repo** (or upload this folder).
3. Root directory: set to `liftcom-server` if the repo root is the parent.
4. Railway sets `PORT`; the app uses it. No env vars required.
5. After deploy, you get a URL like `https://your-app.up.railway.app`. Use:
   - **WebSocket URL:** `wss://your-app.up.railway.app/liftcom`

## Protocol (client → server, JSON)

- **Join channel:** `{ "type": "join", "channel": 1, "deviceId": "uuid-string" }`
- **Presence:** `{ "type": "presence", "channel": 1, "deviceId": "uuid-string" }`
- **Audio:** `{ "type": "audio", "channel": 1, "data": "base64-pcm" }`

Server echoes each message to every other client on the same channel (1–4).

## Local run

```bash
cd liftcom-server
npm install
npm start
```

WebSocket: `ws://localhost:3000/liftcom`

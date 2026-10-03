# Live German to English

Speak German in the browser and watch the English translation update as you talk. A local server exchanges your Speech resource key for a short-lived token. The key stays on the server.

## Azure Speech resource

1. In the [Azure portal](https://portal.azure.com), create a **Speech** resource.
2. Open **Keys and Endpoint** and copy one key and the region (for example `eastus`).

## Setup

```bash
cp .env.example .env.local
```

Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env.local`. Do not commit that file.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847).

Click **Start microphone** and speak German. German shows on the left and English on the right, first as a draft, then as the finished phrase.

The microphone works on localhost or HTTPS. Open the localhost address above, not a raw IP. The browser will ask for microphone permission; allow it.

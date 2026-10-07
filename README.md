# Mascot Foyer Demo (Next.js)

App Router + custom server để giữ Gemini Live WebSocket.

| URL | Scope |
|---|---|
| http://127.0.0.1:4173/ | Foyer gộp (Live + mascot) |
| http://127.0.0.1:4173/converse | Conversation — Gemini Live |
| http://127.0.0.1:4173/animate | Animation — sprite stage |

## Chạy

```bash
cp .env.example .env
# điền GEMINI_API_KEY từ https://aistudio.google.com/apikey
npm install
npm run dev
```

Production: `npm run build && npm start`

API: `/api/health`, `/api/log`, `/api/faq` · WS: `/ws/live`

## Ingest sprite sheet (phông xanh `#00FF00`)

```bash
npm run ingest -- path/to/sheet.png --tag thinking --cols 4 --rows 4 --ms 55
```

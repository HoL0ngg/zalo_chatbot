# Webhook Server

A simple Express.js webhook server to receive and process webhook events.

## Installation

```bash
npm install
```

## Usage

```bash
node webhookServer.js
```

The server will start on port 3000.

## Features

- Receives POST requests at `/webhook` endpoint
- Logs incoming webhook data
- Returns confirmation responses

## Development

To expose your local server for testing webhooks:

```bash
ngrok http 3000
```

## License

MIT

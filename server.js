require('dotenv').config();
const express = require('express');
const path = require('path');
const { runBoardroomDiscussion } = require('./agents/discussion');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/boardroom', async (req, res) => {
  const { problem, history = [] } = req.body;

  if (!problem || problem.trim().length < 10) {
    return res.status(400).json({ error: 'Descreva o problema com pelo menos 10 caracteres.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Heartbeat every 15s to keep proxies from closing idle connections
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 15000);

  const send = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    await runBoardroomDiscussion({ problem, history, send });
  } catch (err) {
    console.error('Boardroom error:', err);
    send({ type: 'error', message: err.message || 'Erro interno no servidor.' });
  } finally {
    clearInterval(heartbeat);
    send({ type: 'done' });
    res.end();
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Boardroom server running on http://localhost:${PORT}`);
});

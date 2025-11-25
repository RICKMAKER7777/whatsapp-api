
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import QRCode from "qrcode";
import pkg from "@whiskeysockets/baileys";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { rimraf } from "rimraf";


dotenv.config();
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = pkg;

const app = express();
app.use(express.json());
app.use(cors());

const DB_FILE = process.env.DB_FILE || "./sessions.db";
const SESSIONS_DIR = process.env.SESSIONS_DIR || "./auth_sessions";

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) console.error("Erro ao abrir SQLite:", err);
  else console.log("SQLite conectado:", DB_FILE);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, qr TEXT, created_at INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, remote TEXT, message TEXT, timestamp INTEGER)`);
});

const sessions = {}; // in-memory clients

async function createClient(sessionId, sendQRCallback = null) {
  if (sessions[sessionId]) return sessions[sessionId];

  const authFolder = path.join(SESSIONS_DIR, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  let version = [2, 3023, 5];
  try {
    const v = await fetchLatestBaileysVersion();
    if (v?.version) version = v.version;
  } catch (e) {
    console.warn("Não foi possível buscar versão Baileys, usando fallback.");
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  });

  sessions[sessionId] = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr);
      db.run(`INSERT OR REPLACE INTO sessions(id, qr, created_at) VALUES(?, ?, ?)`, [sessionId, dataUrl, Date.now()]);
      if (sendQRCallback) sendQRCallback(dataUrl);
    }

    if (connection === "open") {
      console.log(`[${sessionId}] conectado`);
      db.run(`UPDATE sessions SET qr = NULL WHERE id = ?`, [sessionId]);
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason?.loggedOut;
      console.log(`[${sessionId}] conexão fechada. loggedOut=${loggedOut}`);
      if (loggedOut) {
        // limpar sessão local
        try { rimraf.sync(authFolder); } catch(e){}
        db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
        delete sessions[sessionId];
      } else {
        // tentar reconectar
        delete sessions[sessionId];
        setTimeout(() => createClient(sessionId).catch(console.error), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (!msg.message) continue;
        if (msg.key?.fromMe) continue;
        let text = null;
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
        else if (msg.message.imageMessage?.caption) text = msg.message.imageMessage.caption;
        if (!text) text = JSON.stringify(msg.message).slice(0, 800);
        db.run(`INSERT INTO messages(session_id, remote, message, timestamp) VALUES(?, ?, ?, ?)`, [sessionId, msg.key.remoteJid, text, Date.now()]);
      } catch (e) {
        console.error("Erro ao salvar mensagem recebida:", e);
      }
    }
  });

  return sock;
}

// endpoints

// iniciar sessão (gera QR se necessário)
app.post("/sessions/start", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id obrigatório" });
  try {
    await createClient(id);
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// listar sessões registradas no DB
app.get("/sessions", (req, res) => {
  db.all(`SELECT id, qr, created_at FROM sessions ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ sessions: rows });
  });
});

// obter QR
app.get("/sessions/:id/qr", (req, res) => {
  const id = req.params.id;
  db.get(`SELECT qr FROM sessions WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ qr: row ? row.qr : null });
  });
});

// enviar texto
app.post("/sessions/:id/send", async (req, res) => {
  const id = req.params.id;
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "to e message obrigatórios" });
  try {
    const sock = await createClient(id);
    await sock.sendMessage(to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`, { text: message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// listar mensagens de uma sessão (com paginação)
app.get("/sessions/:id/messages", (req, res) => {
  const id = req.params.id;
  const limit = parseInt(req.query.limit || "50");
  const offset = parseInt(req.query.offset || "0");
  db.all(`SELECT * FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`, [id, limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ messages: rows });
  });
});

// restaurar sessão (recria cliente a partir dos arquivos de auth existentes)
app.post("/sessions/:id/restore", async (req, res) => {
  const id = req.params.id;
  try {
    // if client exists, restart
    if (sessions[id]) {
      try { await sessions[id].ws.close(); } catch(e) {}
      delete sessions[id];
    }
    await createClient(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// remover sessão (apaga auth folder e registro DB)
app.delete("/sessions/:id", (req, res) => {
  const id = req.params.id;
  const authFolder = path.join(SESSIONS_DIR, id);
  try {
    delete sessions[id];
    if (fs.existsSync(authFolder)) rimraf.sync(authFolder);
    db.run(`DELETE FROM sessions WHERE id = ?`, [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// health
app.get("/health", (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || "development" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("API rodando na porta", PORT));

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import QRCode from "qrcode";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";
import Database from "better-sqlite3";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const db = new Database("./whatsapp.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    empresa TEXT PRIMARY KEY,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa TEXT,
    remote TEXT,
    message TEXT,
    timestamp INTEGER
  );
`);

const sessions = {};

async function iniciarSessao(empresa, sendQRCallback = null) {
  if (sessions[empresa]) return sessions[empresa];

  console.log("Iniciando sessão:", empresa);

  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${empresa}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false
  });

  sock.ev.on("connection.update", async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr && sendQRCallback) {
      const qrBase64 = await QRCode.toDataURL(qr);
      sendQRCallback(qrBase64);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        console.log("Usuário deslogado. Limpando sessão...");
      } else {
        console.log("Reconectando sessão...");
        iniciarSessao(empresa);
      }
    }

    if (connection === "open") {
      console.log(`📱 Sessão aberta: ${empresa}`);

      db.prepare("INSERT OR IGNORE INTO sessions (empresa, created_at) VALUES (?, ?)")
        .run(empresa, Date.now());
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!texto) return;

    db.prepare(
      "INSERT INTO messages (empresa, remote, message, timestamp) VALUES (?, ?, ?, ?)"
    ).run(
      empresa,
      msg.key.remoteJid,
      texto,
      Date.now()
    );
  });

  sock.ev.on("creds.update", saveCreds);

  sessions[empresa] = sock;
  return sock;
}

app.get("/qr", async (req, res) => {
  const empresa = req.query.empresa;
  if (!empresa) return res.status(400).json({ erro: "Informe a empresa" });

  let ultimoQR = null;

  await iniciarSessao(empresa, (qr) => {
    ultimoQR = qr;
  });

  setTimeout(() => {
    res.json({ empresa, qr: ultimoQR });
  }, 1000);
});

app.post("/send", async (req, res) => {
  try {
    const { empresa, numero, mensagem } = req.body;

    if (!empresa || !numero || !mensagem)
      return res.status(400).json({ erro: "Campos faltando" });

    const sock = await iniciarSessao(empresa);

    await sock.sendMessage(`${numero}@s.whatsapp.net`, { text: mensagem });

    res.json({ status: "enviado" });

  } catch (e) {
    console.log(e);
    res.status(500).json({ erro: "Falha ao enviar" });
  }
});

app.get("/messages", (req, res) => {
  const empresa = req.query.empresa;
  if (!empresa) return res.status(400).json({ erro: "Informe a empresa" });

  const msgs = db.prepare(
    "SELECT * FROM messages WHERE empresa = ? ORDER BY id DESC LIMIT 200"
  ).all(empresa);

  res.json(msgs);
});

app.get("/sessions", (req, res) => {
  const rows = db.prepare("SELECT * FROM sessions").all();
  res.json(rows);
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("🚀 API rodando na porta " + PORT);
});

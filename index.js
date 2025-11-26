// INDEX.JS - WhatsApp API Multi-Empresa totalmente em SQLite
import express from "express";
import { Boom } from "@hapi/boom";
import makeWASocket, { useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { authDb } from "./src/auth-db.js";
import { db } from "./src/database.js";
import cors from "cors";

const app = express();
app.use(express.json({limit:"10mb"}));
app.use(cors());

const SESSIONS = {}; // sessão por empresa

async function startSession(empresaId){
    if(SESSIONS[empresaId]){
        return SESSIONS[empresaId];
    }

    const { state, saveCreds } = await authDb(empresaId);

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS("Safari"),
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
        if(qr){
            await db.saveQR(empresaId, qr); // salvando QR no banco
        }
        if(connection === "close"){
            const shouldReconnect = 
                (lastDisconnect.error instanceof Boom && lastDisconnect.error.output.statusCode !== 401);
            if(shouldReconnect) startSession(empresaId);
        }
    });

    sock.ev.on("messages.upsert", async m => {
        if(!m.messages || !m.messages[0]) return;
        const msg = m.messages[0];

        if(msg.key.remoteJid){
            await db.saveMessage(empresaId, {
                id: msg.key.id,
                from: msg.key.remoteJid,
                to: empresaId,
                body: msg.message?.conversation || msg.message?.extendedTextMessage?.text || "[media]"
            });
        }
    });

    SESSIONS[empresaId] = sock;
    return sock;
}

app.post("/empresa/create", async (req,res)=>{
    const { empresaId } = req.body;
    if(!empresaId) return res.status(400).json({error:"empresaId obrigatório"});

    await db.createEmpresa(empresaId);
    return res.json({ ok:true, empresaId });
});

app.get("/qr/:empresaId", async (req,res)=>{
    const { empresaId } = req.params;

    await startSession(empresaId);

    const qr = await db.getQR(empresaId);
    return res.json({ qr });
});

app.post("/mensagem/enviar", async (req,res)=>{
    const { empresaId, numero, mensagem } = req.body;

    const sock = await startSession(empresaId);
    const jid = numero.replace(/\D/g,"") + "@s.whatsapp.net";

    await sock.sendMessage(jid,{ text: mensagem });

    await db.saveMessage(empresaId,{
        from: empresaId,
        to: jid,
        body: mensagem
    });

    return res.json({ ok:true });
});

app.get("/mensagens/:empresaId", async (req,res)=>{
    const rows = await db.listMessages(req.params.empresaId);
    res.json(rows);
});

app.delete("/empresa/:empresaId/reset", async (req,res)=>{
    const { empresaId } = req.params;
    await db.resetEmpresa(empresaId);
    delete SESSIONS[empresaId];
    return res.json({ ok:true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log("API online na porta", PORT));
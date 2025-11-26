import sqlite3 from "sqlite3";
import { open } from "sqlite";

export const db = await open({
    filename:"./whatsapp.db",
    driver:sqlite3.Database
});

await db.exec(`
CREATE TABLE IF NOT EXISTS empresas (
    empresaId TEXT PRIMARY KEY,
    createdAt TEXT
);
CREATE TABLE IF NOT EXISTS qr (
    empresaId TEXT,
    qr TEXT
);
CREATE TABLE IF NOT EXISTS mensagens (
    empresaId TEXT,
    id TEXT,
    fromNum TEXT,
    toNum TEXT,
    body TEXT,
    createdAt TEXT
);
CREATE TABLE IF NOT EXISTS auth (
    empresaId TEXT,
    key TEXT,
    value TEXT
);
`);

export const createEmpresa = async (empresaId)=>{
    await db.run("INSERT OR IGNORE INTO empresas VALUES (?,datetime('now'))",[empresaId]);
};

export const saveQR = async (empresaId, qr)=>{
    await db.run("DELETE FROM qr WHERE empresaId=?",[empresaId]);
    await db.run("INSERT INTO qr VALUES (?,?)",[empresaId, qr]);
};

export const getQR = async (empresaId)=>{
    const r = await db.get("SELECT qr FROM qr WHERE empresaId=?",[empresaId]);
    return r?.qr || null;
};

export const saveMessage = async (empresaId,msg)=>{
    await db.run("INSERT INTO mensagens VALUES (?,?,?,?,?,datetime('now'))",[
        empresaId, msg.id || null, msg.from, msg.to, msg.body
    ]);
};

export const listMessages = async (empresaId)=>{
    return db.all("SELECT * FROM mensagens WHERE empresaId=? ORDER BY createdAt DESC",[empresaId]);
};

export const resetEmpresa = async (empresaId)=>{
    await db.run("DELETE FROM auth WHERE empresaId=?",[empresaId]);
    await db.run("DELETE FROM mensagens WHERE empresaId=?",[empresaId]);
    await db.run("DELETE FROM qr WHERE empresaId=?",[empresaId]);
};

// Auth interface:
export const authStore = {
    get:async(empresaId,key)=>{
        const row = await db.get("SELECT value FROM auth WHERE empresaId=? AND key=?",[empresaId,key]);
        return row ? JSON.parse(row.value) : null;
    },
    set:async(empresaId,key,val)=>{
        await db.run("DELETE FROM auth WHERE empresaId=? AND key=?",[empresaId,key]);
        await db.run("INSERT INTO auth VALUES (?,?,?)",[empresaId,key,JSON.stringify(val)]);
    },
    delete:async(empresaId,key)=>{
        await db.run("DELETE FROM auth WHERE empresaId=? AND key=?",[empresaId,key]);
    }
};

export default {
    createEmpresa, saveQR, getQR, saveMessage, listMessages, resetEmpresa, authStore
};

# WhatsApp Multi-Empresa API (Render compatible)

Este projeto fornece uma API para gerenciar múltiplas sessões do WhatsApp usando Baileys, com armazenamento leve em SQLite (compatível com Render). Inclui endpoints para criar/gerenciar sessões, enviar mensagens, listar e limpar histórico.

## Incluído
- index.js (API principal)
- package.json
- Dockerfile
- render.yaml (blueprint para Render)
- .gitignore

## Como usar (desenvolvimento)
1. Instale dependências:
```bash
npm install
```

2. Inicie:
```bash
npm start
# ou em dev
npm run dev
```

## Endpoints principais
- `POST /sessions/start` { id } — inicia sessão (gera QR se necessário)
- `GET /sessions` — lista sessões registradas
- `GET /sessions/:id/qr` — retorna QR (dataURL) se existir
- `POST /sessions/:id/send` { to, message } — envia texto
- `GET /sessions/:id/messages?limit=50&offset=0` — lista mensagens da sessão
- `POST /sessions/:id/restore` — restaura/reinicia cliente pela sessão
- `DELETE /sessions/:id` — apaga sessão (arquivos de auth e registro DB)

## Subir para o GitHub (com GitHub CLI)
> Observe: você precisa ter o GitHub CLI (`gh`) instalado e estar autenticado.

```bash
# no diretório do projeto
git init
git add .
git commit -m "Initial commit - WhatsApp Multi-Empresa API"
gh repo create RICKMAKER7777/whatsapp-api --public --source=. --remote=origin --push
```

Ou usar comandos git normais:

```bash
git remote add origin https://github.com/RICKMAKER7777/whatsapp-api.git
git branch -M main
git push -u origin main
```

## Docker
Para rodar com Docker locally (ou registry):

```bash
docker build -t whatsapp-api:latest .
docker run -p 10000:10000 --env NODE_ENV=production whatsapp-api:latest
```

## Deploy no Render
1. Crie novo serviço web no Render.
2. Conecte seu repositório GitHub.
3. Use `npm install` como build command e `npm start` como start command.
4. Adicione a variável de ambiente `NODE_ENV=production` (opcional).

## Observações
- O diretório `/data/auth_sessions` contém as credenciais do Baileys (persistência). Não compartilhe.
- `.gitignore` inclui `auth_*` e `sessions.db`.

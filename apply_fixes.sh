#!/bin/bash
set -e

echo "=== WhatsApp API Auto-Fixer ==="

ROOT_DIR="$(pwd)"
DATA_DIR="$ROOT_DIR/data"

echo "[1/10] Criando diretórios persistentes locais..."
mkdir -p "$DATA_DIR" "$DATA_DIR/auth_sessions" "$DATA_DIR/uploads"

echo "[2/10] Ajustando caminhos no código..."
find . -type f \
  \( -name "*.js" -o -name "*.ts" -o -name "*.mjs" -o -name "*.cjs" -o -name "*.json" -o -name "*.env" -o -name "*.md" \) \
  -print0 | xargs -0 perl -0777 -pi -e '
    s{/tmp/sessions}{/data/auth_sessions}g;
    s{/tmp/uploads}{/data/uploads}g;
    s{/tmp/whatsapp_db\.sqlite}{/data/whatsapp.db}g;
    s{auth_sessions}{/data/auth_sessions}g;
    s{whatsapp\.db}{/data/whatsapp.db}g;
  '

echo "[3/10] Criando script setup_dirs.mjs..."
mkdir -p scripts
cat <<'EOF' > scripts/setup_dirs.mjs
#!/usr/bin/env node
import fs from 'fs';

const dirs = [
  '/data',
  '/data/auth_sessions',
  '/data/uploads'
];

for (const d of dirs) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (e) {}
}
console.log('Persistent data directories ensured.');
EOF
chmod +x scripts/setup_dirs.mjs

echo "[4/10] Atualizando package.json..."
node <<'EOF'
import fs from 'fs';
let p = JSON.parse(fs.readFileSync('package.json'));

p.scripts = p.scripts || {};
p.scripts.prestart = "node ./scripts/setup_dirs.mjs || true";
p.scripts.start = p.scripts.start || "node index.js";

fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
console.log("package.json atualizado");
EOF

echo "[5/10] Criando Dockerfile..."
cat <<'EOF' > Dockerfile
FROM node:18-bullseye-slim

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --production --legacy-peer-deps
COPY . .

RUN mkdir -p /data /data/auth_sessions /data/uploads && \
    chmod 755 /data /data/auth_sessions /data/uploads

ENV NODE_ENV=production
EXPOSE 10000

CMD ["npm", "start"]
EOF

echo "[6/10] Criando render.yaml..."
cat <<'EOF' > render.yaml
services:
  - type: web
    name: whatsapp-api
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    disk: 1024
    region: oregon
    ports:
      - 10000
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
EOF

echo "[7/10] Criando README.md..."
cat <<'EOF' > README.md
# WhatsApp API - Estrutura corrigida para Render (Persistência + Docker)

### Alterações aplicadas automaticamente:
- Sessões movidas para `/data/auth_sessions`
- Banco SQLite movido para `/data/whatsapp.db`
- Uploads movidos para `/data/uploads`
- Script automático `setup_dirs.mjs`
- Dockerfile otimizado para Render
- render.yaml (blueprint)
- Ajustes de caminhos em todo o código

### Como rodar localmente:
```bash
npm ci
npm start

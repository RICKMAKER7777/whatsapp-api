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

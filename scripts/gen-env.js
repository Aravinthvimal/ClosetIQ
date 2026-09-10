#!/usr/bin/env node
// Reads .env and writes js/env.js for the browser.
// Run: node scripts/gen-env.js
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const outPath = path.join(__dirname, '..', 'js', 'env.js');

if (!fs.existsSync(envPath)) {
  console.error('No .env file found. Create one from .env.example');
  process.exit(1);
}

const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) env[key.trim()] = rest.join('=').trim();
});

const { SUPABASE_URL = '', SUPABASE_KEY = '' } = env;

fs.writeFileSync(outPath,
  `const SUPABASE_URL = '${SUPABASE_URL}';\nconst SUPABASE_KEY = '${SUPABASE_KEY}';\n`
);

console.log('js/env.js generated.');

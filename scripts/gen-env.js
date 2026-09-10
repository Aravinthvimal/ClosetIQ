#!/usr/bin/env node
// Writes js/env.js for the browser.
// On Netlify: reads from process.env (set in Netlify dashboard).
// Locally: reads from .env file.
const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, '..', 'js', 'env.js');

let SUPABASE_URL = process.env.SUPABASE_URL || '';
let SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// Fall back to .env file for local dev
if (!SUPABASE_URL || !SUPABASE_KEY) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) {
        const val = rest.join('=').trim();
        if (key.trim() === 'SUPABASE_URL') SUPABASE_URL = val;
        if (key.trim() === 'SUPABASE_KEY') SUPABASE_KEY = val;
      }
    });
  }
}

fs.writeFileSync(outPath,
  `const SUPABASE_URL = '${SUPABASE_URL}';\nconst SUPABASE_KEY = '${SUPABASE_KEY}';\n`
);

console.log('js/env.js generated.');


const fs = require('node:fs');
const path = require('node:path');

const target = path.join(
    process.cwd(),
    'node_modules',
    '@whiskeysockets',
    'baileys',
    'lib',
    'Socket',
    'messages-recv.js'
);

if (!fs.existsSync(target)) {
    console.log('[Baileys rc14 patch] target file not found; skipping.');
    process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');

const broken = 'authState.creds.me.id';
const fixed = 'authState.creds.me?.id';

if (source.includes(fixed)) {
    console.log('[Baileys rc14 patch] pre-login ACK fix already present.');
    process.exit(0);
}

if (!source.includes(broken)) {
    console.log('[Baileys rc14 patch] expected line not found; leaving package untouched.');
    process.exit(0);
}

fs.writeFileSync(
    target,
    source.replace(broken, fixed),
    'utf8'
);

console.log('[Baileys rc14 patch] pre-login ACK fix applied.');

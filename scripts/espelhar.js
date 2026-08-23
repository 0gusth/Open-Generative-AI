#!/usr/bin/env node
// Bring production's data down into the working copy.
//
// A working copy that opens to an empty gallery does not feel like the app —
// you cannot judge a layout change against three test images. This fills
// .data/ with the real ledger, projects and favourites.
//
// One direction only, and structurally so: it makes GET requests to the live
// app and writes local files. There is no code path here that can write to
// production, whatever goes wrong.
//
// The access code is typed by you, into your own terminal, and stored only in
// .env.local (which git ignores). Pass --esquecer to remove it.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const APP = process.env.MIRROR_APP_URL || 'https://gusaistudio.vercel.app';
const DATA_DIR = path.join(process.cwd(), '.data');
const ENV_FILE = path.join(process.cwd(), '.env.local');

// Each local document and the endpoint that serves it.
const DOCS = [
    { doc: 'generations', url: '/api/history' },
    { doc: 'pending', url: '/api/history?pending=1' },
    { doc: 'projects', url: '/api/projects' },
    { doc: 'favorites', url: '/api/favorites' },
    { doc: 'productions', url: '/api/productions' },
];

const readEnv = () => {
    try { return fs.readFileSync(ENV_FILE, 'utf8'); } catch { return ''; }
};

function storedCode() {
    const m = /^MIRROR_ACCESS_CODE=(.*)$/m.exec(readEnv());
    return m ? m[1].trim().replace(/^"|"$/g, '') : null;
}

function rememberCode(code) {
    const body = readEnv().replace(/^MIRROR_ACCESS_CODE=.*$\n?/m, '');
    const header = '# Codigo do gusaistudio, usado so por "npm run espelhar"';
    fs.writeFileSync(ENV_FILE, `${body.replace(/\n*$/, '\n')}\n${header}\nMIRROR_ACCESS_CODE=${code}\n`);
}

function forgetCode() {
    fs.writeFileSync(ENV_FILE, readEnv().replace(/^MIRROR_ACCESS_CODE=.*$\n?/m, ''));
    console.log('Codigo esquecido. O proximo espelhar vai pedir de novo.');
}

// Hidden prompt — the code never appears on screen and never reaches a log.
function askHidden(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin, output: process.stdout, terminal: true,
        });
        const mask = () => {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(question + '*'.repeat(rl.line.length));
        };
        process.stdin.on('data', mask);
        rl.question(question, (answer) => {
            process.stdin.removeListener('data', mask);
            rl.close();
            process.stdout.write('\n');
            resolve(String(answer).trim());
        });
    });
}

async function unlock(code) {
    const res = await fetch(`${APP}/api/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    if (!res.ok) return null;
    const cookie = res.headers.get('set-cookie');
    return cookie ? cookie.split(';')[0] : null;
}

async function main() {
    if (process.argv.includes('--esquecer')) return forgetCode();

    let code = storedCode();
    let asked = false;
    if (!code) {
        console.log(`Preciso do codigo que voce digita para abrir ${APP}.`);
        console.log('Ele fica so nesta maquina, no .env.local (que o git ignora).');
        console.log('');
        code = await askHidden('Codigo: ');
        asked = true;
    }
    if (!code) {
        console.error('Sem codigo, nao consigo ler a producao.');
        process.exit(1);
    }

    process.stdout.write('Destravando... ');
    const cookie = await unlock(code);
    if (!cookie) {
        console.error('');
        console.error('Codigo incorreto. Rode de novo, ou "npm run espelhar -- --esquecer" para limpar o salvo.');
        process.exit(1);
    }
    console.log('ok');
    console.log('');
    if (asked) {
        rememberCode(code);
        console.log('Codigo guardado localmente.');
        console.log('');
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    let copied = 0;
    for (const { doc, url } of DOCS) {
        try {
            const res = await fetch(`${APP}${url}`, { headers: { cookie } });
            if (!res.ok) {
                console.log(`  ${doc.padEnd(13)} nao disponivel (${res.status})`);
                continue;
            }
            const value = await res.json();
            fs.writeFileSync(path.join(DATA_DIR, `${doc}.json`), JSON.stringify(value, null, 2));
            console.log(`  ${doc.padEnd(13)} ${Array.isArray(value) ? `${value.length} itens` : 'ok'}`);
            copied++;
        } catch (e) {
            console.log(`  ${doc.padEnd(13)} falhou: ${e.message}`);
        }
    }

    console.log('');
    console.log(`Pronto: ${copied} de ${DOCS.length} trazidos para .data/`);
    console.log('Mao unica: o que voce gerar ou apagar aqui NAO volta para a producao.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });

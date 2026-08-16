import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Project registry: each project owns a folder on disk where every creation
// is saved. Registry lives in .data/projects.json; the active project id is
// part of the registry so every browser shares it.
const DATA_DIR = path.join(process.cwd(), '.data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

async function readRegistry() {
    try {
        return JSON.parse(await fs.readFile(PROJECTS_FILE, 'utf8'));
    } catch {
        return { projects: [], activeId: null };
    }
}

async function writeRegistry(registry) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(PROJECTS_FILE, JSON.stringify(registry, null, 2));
}

function expandHome(p) {
    if (!p) return p;
    return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export async function GET() {
    return NextResponse.json(await readRegistry());
}

export async function POST(request) {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    const registry = await readRegistry();

    if (body.action === 'create') {
        const name = (body.name || '').trim();
        if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
        const folder = expandHome((body.path || '').trim()) ||
            path.join(os.homedir(), 'Documents', 'OpenGenerativeAI', name);
        try {
            await fs.mkdir(folder, { recursive: true });
        } catch (error) {
            return NextResponse.json({ error: `Could not create folder: ${error.message}` }, { status: 400 });
        }
        const project = {
            id: Math.random().toString(36).slice(2, 10),
            name,
            path: folder,
            createdAt: new Date().toISOString(),
        };
        registry.projects.unshift(project);
        registry.activeId = project.id;
        await writeRegistry(registry);
        return NextResponse.json({ ok: true, project, activeId: registry.activeId });
    }

    if (body.action === 'set-active') {
        // null = "Geral" (no project): creations still land in the ledger only
        registry.activeId = body.id ?? null;
        await writeRegistry(registry);
        return NextResponse.json({ ok: true, activeId: registry.activeId });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

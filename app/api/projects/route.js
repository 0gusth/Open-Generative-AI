import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { readDoc, writeDoc, usingRedis } from '../../../lib/serverStore';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Project registry: each project owns a folder on disk where every creation
// is saved. Registry lives in .data/projects.json; the active project id is
// part of the registry so every browser shares it.
const readRegistry = () => readDoc('projects', { projects: [], activeId: null });
const writeRegistry = (registry) => writeDoc('projects', registry);

function expandHome(p) {
    if (!p) return p;
    return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export async function GET() {
    const registry = await readRegistry();
    // The client adapts the project UI to what THIS server can actually do:
    // folder copies need a real filesystem (local/Docker), the native picker
    // additionally needs macOS. On serverless both are off and a project is
    // a logical grouping over the ledger.
    return NextResponse.json({
        ...registry,
        capabilities: {
            folders: !usingRedis,
            picker: !usingRedis && process.platform === 'darwin',
        },
    });
}

export async function POST(request) {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    const registry = await readRegistry();

    if (body.action === 'create') {
        const name = (body.name || '').trim();
        if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
        // Serverless has no folders: the project is a logical grouping and
        // generations stay tagged by projectId in the ledger.
        let folder = null;
        if (!usingRedis) {
            folder = expandHome((body.path || '').trim()) ||
                path.join(os.homedir(), 'Documents', 'OpenGenerativeAI', name);
            try {
                await fs.mkdir(folder, { recursive: true });
            } catch (error) {
                return NextResponse.json({ error: `Could not create folder: ${error.message}` }, { status: 400 });
            }
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

    if (body.action === 'pick-folder') {
        // The Next server runs on the user's own machine, so it can open the
        // NATIVE macOS folder picker and return the chosen absolute path.
        if (process.platform !== 'darwin') {
            return NextResponse.json({ error: 'Native picker only on macOS' }, { status: 501 });
        }
        try {
            // Run the chooser inside Finder and activate it first — a bare
            // osascript dialog opens BEHIND the browser window, which reads
            // as "the button does nothing".
            const { stdout } = await execFileAsync('osascript', [
                '-e',
                'tell application "Finder"\nactivate\nset chosen to POSIX path of (choose folder with prompt "Escolha a pasta do projeto")\nend tell\nchosen',
            ], { timeout: 120000 });
            return NextResponse.json({ ok: true, path: stdout.trim().replace(/\/$/, '') });
        } catch (error) {
            // User hit Cancel (osascript exits non-zero) — not an error state
            return NextResponse.json({ ok: false, canceled: true });
        }
    }

    if (body.action === 'rename') {
        const project = registry.projects.find((p) => p.id === body.id);
        if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        const name = (body.name || '').trim();
        if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
        project.name = name;
        await writeRegistry(registry);
        return NextResponse.json({ ok: true, project });
    }

    if (body.action === 'delete') {
        // Removes the project from the registry only: generations stay in the
        // ledger (under Geral) and the folder on disk is NEVER touched.
        if (!registry.projects.some((p) => p.id === body.id)) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        registry.projects = registry.projects.filter((p) => p.id !== body.id);
        if (registry.activeId === body.id) registry.activeId = null;
        await writeRegistry(registry);
        return NextResponse.json({ ok: true, activeId: registry.activeId });
    }

    if (body.action === 'set-active') {
        // null = "Geral" (no project): creations still land in the ledger only
        registry.activeId = body.id ?? null;
        await writeRegistry(registry);
        return NextResponse.json({ ok: true, activeId: registry.activeId });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

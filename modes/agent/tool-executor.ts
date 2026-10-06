import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import type {AgentConfig, ActionLog} from "./types";
import { ActionTracker } from './action.tracker';

const TEXT_EXT= new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.json',
    '.md',
    '.txt',
    '.yaml',
    '.yml',
    '.html',
    '.css',
    '.scss',
    '.less',
    '.py',
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.java',
    '.kt',
    '.kts',
    '.rb'
]);

function isProbablyTextFile(filepath:string): boolean{
    const ext = path.extname(filepath).toLowerCase()
    if (ext === '.log' && filepath.length > 32){
        const base = path.basename(filepath).toLowerCase();
        return base.includes('log') ||
        base.includes('audit') ||
        base.includes('error')
    }
    return true
}


export class ToolExecutor {
    constructor(
        private config: AgentConfig,
        private tracker: ActionTracker,
        private basePath: string,
    ) {
        this.basePath = path.resolve(config.codebasePath)
        if (!this.basePath.startsWith(process.cwd())) {
            this.basePath = path.resolve(process.cwd(), this.basePath)
        }
    }

    private resolveSafe(rel: string): string {
        const absolute = path.resolve(this.config.codebasePath, rel);
        const root = path.resolve(this.config.codebasePath);
        const relcheck = path.relative(root, absolute);

        if (relcheck.startsWith('..') || path.isAbsolute(relcheck)) {
            throw new Error(`Path escapes workspace: ${rel}`);
        }
        return absolute;
    }

    private isExcluded(relPath: string): boolean {
        const norm = relPath.replace(/\\/g, '/');
        const segments = norm.split('/');
        const base = segments[segments.length - 1] ?? '';

        for (const pat of this.config.excludePatterns) {
            if (pat === '*.log' && base.endsWith('.log')) return true;
            if (pat === '.env*' && base.startsWith('.env')) return true;
            if (pat.includes('*')) continue;
            if (segments.includes(pat) || norm === pat || norm.startsWith(`${pat}/`))
                return true;
        }
        return false;
    }

    readFile(relPath: string): string {
        if (this.isExcluded(relPath)) throw new Error(`File is excluded: ${relPath}`);
        const abs = this.resolveSafe(relPath);
        const stat = fs.statSync(abs);
        if (stat.size > this.config.maxFileSizeToRead)
            throw new Error(`File too large to read: ${relPath}`);
        if (!isProbablyTextFile(abs))
            throw new Error(`File does not appear to be text: ${relPath}`);
        const content = fs.readFileSync(abs, 'utf-8');
        this.tracker.log({ type: 'read_file', path: relPath, details: {}, status: 'executed' });
        return content;
    }

    readDirectory(relPath: string): string[] {
        if (this.isExcluded(relPath)) throw new Error(`Directory is excluded: ${relPath}`);
        const abs = this.resolveSafe(relPath);
        const entries = fs.readdirSync(abs, { withFileTypes: true });
        const result = entries
            .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
            .filter((name) => !this.isExcluded(`${relPath}/${name}`));
        this.tracker.log({ type: 'read_directory', path: relPath, details: {}, status: 'executed' });
        return result;
    }

    writeFile(relPath: string, content: string): void {
        if (!this.config.tools.allowFileModification)
            throw new Error('File modification is disabled in config.');
        const abs = this.resolveSafe(relPath);
        const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : undefined;
        fs.writeFileSync(abs, content, 'utf-8');
        this.tracker.log({
            type: 'file_modify',
            path: relPath,
            details: { before, after: content },
            status: 'executed',
        });
    }

    createFile(relPath: string, content: string): void {
        if (!this.config.tools.allowFileCreation)
            throw new Error('File creation is disabled in config.');
        const abs = this.resolveSafe(relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf-8');
        this.tracker.log({
            type: 'file_create',
            path: relPath,
            details: { after: content },
            status: 'executed',
        });
    }

    deleteFile(relPath: string): void {
        const abs = this.resolveSafe(relPath);
        const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : undefined;
        fs.rmSync(abs, { force: true });
        this.tracker.log({
            type: 'file_delete',
            path: relPath,
            details: { before },
            status: 'executed',
        });
    }

    createFolder(relPath: string): void {
        if (!this.config.tools.allowFolderCreation)
            throw new Error('Folder creation is disabled in config.');
        const abs = this.resolveSafe(relPath);
        fs.mkdirSync(abs, { recursive: true });
        this.tracker.log({ type: 'folder_create', path: relPath, details: {}, status: 'executed' });
    }

    executeShell(command: string): string {
        if (!this.config.tools.allowShellExecution)
            throw new Error('Shell execution is disabled in config.');
        const result = spawnSync(command, { shell: true, cwd: this.basePath, encoding: 'utf-8' });
        const output = result.stdout ?? '';
        const errorOutput = result.stderr ?? '';
        this.tracker.log({
            type: 'tool_execute',
            path: this.basePath,
            details: { command, toolOutput: output, error: errorOutput || undefined },
            status: 'executed',
        });
        if (result.status !== 0) throw new Error(`Command failed: ${errorOutput}`);
        return output;
    }
}
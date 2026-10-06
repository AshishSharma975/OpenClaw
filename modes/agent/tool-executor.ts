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
    /** In-memory overlay: buffered file contents not yet written to disk */
    private overlay = new Map<string, string>();
    /** Tracks files pending deletion in the current session */
    private deleted = new Set<string>();

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

    /** Normalize a relative path to a consistent key for overlay/deleted lookups */
    private norm(rel: string): string {
        return rel.replace(/\\/g, '/').replace(/^\.?\//, '');
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

    
    private assertNotExcluded(rel:string, op:string):void{
        if(this.isExcluded(rel)){
            throw new Error(`${op} path is excluded by policy: ${rel}`);
        }
    }
  

    getEffectiveText(rel:string): string | undefined{
        const key = this.norm(rel);
        if(this.deleted.has(key)) return undefined
        if(this.overlay.has(key)) return this.overlay.get(key)!;

        const absolute = this.resolveSafe(rel);
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()){
            return undefined
        }
        if(!isProbablyTextFile(absolute)){
            return undefined
        }
        const size = fs.statSync(absolute).size
        if (size === 0) return '';
        return fs.readFileSync(absolute, 'utf-8');
    }
    

    readFile(rel:string): string{
        const absolute = this.resolveSafe(rel)
        const content = fs.readFileSync(absolute, 'utf-8')

        const key = this.norm(rel);
        this.overlay.set(key,content);

        return content

        
    }

    writeFile(rel:string, content:string): void {
        this.assertNotExcluded(rel, "writeFile");

        const key = this.norm(rel)
        this.overlay.set(key, content)
        
        this.tracker.log({
            type: "file_modify",
            path: key,
            details: { after: `content written to overlay (${content.length} chars)` },
            status: "pending",
        });
    }

    deleteFile(rel: string): string {
        if (!this.config.tools.allowFileModification) {
            throw new Error('File deletion disabled');
        }
        this.assertNotExcluded(rel, 'delete_file');

        const before = this.getEffectiveText(rel);
        if (before === undefined) {
            throw new Error(`delete_file: file not found: ${rel}`);
        }

        const key = this.norm(rel);
        this.overlay.delete(key);
        this.deleted.add(key);

        this.tracker.log({
            type: 'file_delete',
            path: key,
            details: { before },
            status: 'pending',
        });

        return `Staged delete: ${key}`;
    }

    createFolder(rel: string): string {
        if (!this.config.tools.allowFolderCreation) {
            throw new Error('Folder creation disabled');
        }
        this.assertNotExcluded(rel, 'create_folder');

        const absolute = this.resolveSafe(rel);
        if (fs.existsSync(absolute)) {
            return `Folder already exists: ${rel}`;
        }

        fs.mkdirSync(absolute, { recursive: true });

        const key = this.norm(rel);
        this.tracker.log({
            type: 'folder_create',
            path: key,
            details: {},
            status: 'executed',
        });

        return `Created folder: ${key}`;
    }

    listFiles(rel:string): string {
        this.assertNotExcluded(rel, "listFiles");

        const absolute = this.resolveSafe(rel);
        if(!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()){
            throw new Error(`listFiles: not a directory: ${rel}`);
        }

        const entries = fs.readdirSync(absolute, {withFileTypes:true})

        const items = entries
        .filter((e)=>!this.isExcluded(path.join(rel,e.name)))
        .map((e)=>`${e.name} (${e.isDirectory() ? 'dir' : 'file' })`)

        this.tracker.log({
            type: "read_directory",
            path: rel,
            details: { toolOutput: items.join('\n') },
            status: "executed",
        });
        return `Directory ${rel} contains:\n${items.join('\n')}`;


    }


    applyAll(): void {
        for(const [key, content] of this.overlay.entries()){
            const absolute = this.resolveSafe(key)
            const dir = path.dirname(absolute)

            if(!fs.existsSync(dir)){
                fs.mkdirSync(dir, {recursive:true})
            }

            fs.writeFileSync(absolute, content, 'utf-8')
            
            this.tracker.updateStatus(key, 'executed');
        }
    }

    executeShell(cmd:string): {stdout:string;stderr:string}{
        this.assertNotExcluded(cmd, "executeShell");

        if(!this.config.tools.allowShellExecution){
            throw new Error('Shell execution not enabled by configuration')
        }

        const action = this.tracker.log({
            type:"tool_execute",
            path: cmd,
            details: { command: cmd },
            status: "pending",
        });

        try {
            const res = spawnSync(cmd, {
                cwd: this.config.codebasePath,
                stdio: 'pipe',
                shell: true,
                encoding: 'utf-8',
            });

            const stdout = (res.stdout as string) ?? '';
            const stderr = (res.stderr as string) ?? '';

            if (res.status !== 0) {
                this.tracker.updateStatus(action.id, 'failed');
                throw new Error(`Shell command failed (exit ${res.status}): ${stderr.trim()}`);
            }

            this.tracker.updateStatus(action.id, 'executed');
            return { stdout, stderr };
        } catch (err) {
            this.tracker.updateStatus(action.id, 'failed');
            throw err;
        }
    }
}
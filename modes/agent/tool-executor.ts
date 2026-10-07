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
    /** Queue of pending shell tasks awaiting execution/approval */
    private queue: Array<() => Promise<string>> = [];

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
  

    getEffectiveText(rel: string): string | undefined {
        const absolute = this.resolveSafe(rel);
        const root = path.resolve(this.config.codebasePath);
        const relPath = path.relative(root, absolute).replace(/\\/g, '/');
        const key = this.norm(relPath);

        if (this.deleted.has(key)) return undefined;
        if (this.overlay.has(key)) return this.overlay.get(key)!;

        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
            return undefined;
        }
        if (!isProbablyTextFile(absolute)) {
            return undefined;
        }
        const size = fs.statSync(absolute).size;
        if (size === 0) return '';
        return fs.readFileSync(absolute, 'utf-8');
    }

    readFile(rel: string): string {
        const absolute = this.resolveSafe(rel);
        const root = path.resolve(this.config.codebasePath);
        const relPath = path.relative(root, absolute).replace(/\\/g, '/');
        const key = this.norm(relPath);

        if (this.overlay.has(key)) {
            return this.overlay.get(key)!;
        }

        return fs.readFileSync(absolute, 'utf-8');
    }

    writeFile(rel: string, content: string): void {
        this.assertNotExcluded(rel, "writeFile");

        const absolute = this.resolveSafe(rel);
        const root = path.resolve(this.config.codebasePath);
        const relPath = path.relative(root, absolute).replace(/\\/g, '/');
        const key = this.norm(relPath);

        const before = this.getEffectiveText(key);

        this.overlay.set(key, content);
        this.deleted.delete(key);

        const type = (before === undefined && !fs.existsSync(absolute)) ? "file_create" : "file_modify";

        this.tracker.log({
            type,
            path: key,
            details: { before: before ?? undefined, after: content },
            status: "pending",
        });
    }

    deleteFile(rel: string): string {
        if (!this.config.tools.allowFileModification) {
            throw new Error('File deletion disabled');
        }
        this.assertNotExcluded(rel, 'delete_file');

        const absolute = this.resolveSafe(rel);
        const root = path.resolve(this.config.codebasePath);
        const relPath = path.relative(root, absolute).replace(/\\/g, '/');
        const key = this.norm(relPath);

        const before = this.getEffectiveText(key);
        if (before === undefined) {
            throw new Error(`delete_file: file not found: ${rel}`);
        }

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
        const root = path.resolve(this.config.codebasePath);
        const relPath = path.relative(root, absolute).replace(/\\/g, '/');
        const key = this.norm(relPath);

        if (fs.existsSync(absolute)) {
            return `Folder already exists: ${rel}`;
        }

        fs.mkdirSync(absolute, { recursive: true });

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

    searchFiles(
        rootRel: string,
        globPattern: string,
        contentQuery?: string
    ): string {
        this.assertNotExcluded(rootRel, "searchFiles");
        const absolute = this.resolveSafe(rootRel);

        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
            throw new Error(`search_files: not a directory: ${rootRel}`);
        }

        const results: string[] = [];

        const regexFromGlob = (g: string): RegExp => {
            const escaped = g
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\*/g, '[^/\\\\]*')
                .replace(/\$\$/g, '.*')
                .replace(/\?/g, '.');
            return new RegExp(`^${escaped}$`, 'i');
        };

        const nameRe = regexFromGlob(globPattern.replace(/\\\\/g, '/'));

        const walk = (dir: string) => {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, ent.name);
                const relP = path
                    .relative(this.config.codebasePath, full)
                    .split(path.sep)
                    .join('/');
                if (this.isExcluded(relP)) continue;
                if (ent.isDirectory()) walk(full);
                else if (nameRe.test(ent.name) || nameRe.test(relP)) {
                    if (contentQuery) {
                        const text = this.getEffectiveText(relP);
                        if (text !== undefined && text.includes(contentQuery)) {
                            results.push(relP);
                        }
                    } else {
                        results.push(relP);
                    }
                }
            }
        };

        walk(absolute);

        this.tracker.log({
            type: 'read_directory',
            path: rootRel,
            details: { toolOutput: results.join('\n') },
            status: 'executed',
        });

        return results.length > 0
            ? `Found ${results.length} file(s):\n${results.join('\n')}`
            : `No files matched pattern "${globPattern}" in ${rootRel}`;
    }

    analyzeCodebase(rootRel:string): string{
        const rootAbs = this.resolveSafe(rootRel)
        const stats = {
            files:0,
            dirs:0,
            totalLines:0,
            totalBytes:0,
            extensions:new Map<string,number>()
        };
        const pathExt = (name:string) => name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''

        const walk = (dir:string)=>{
            for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
                const full = path.join(dir,ent.name)
                const relP = path.relative(this.config.codebasePath,full).split(path.sep).join('/')
                if(this.isExcluded(relP)) continue
                if(ent.isDirectory()){
                    stats.dirs++
                    walk(full)
                }else{
                    stats.files++
                    const ext = pathExt(ent.name)
                    stats.totalBytes += fs.statSync(full).size
                    stats.totalLines += this.getEffectiveText(relP)?.split('\n').length ?? 0
                    if(ext)stats.extensions.set(ext, (stats.extensions.get(ext) || 0) + 1)
                }
            }
        }

        if(!fs.existsSync(rootAbs)|| !fs.statSync(rootAbs).isDirectory()){
            throw new Error(`analyzeCodebase: not a directory: ${rootRel}`)
        }

        walk(rootAbs)

        const extList = Array.from(stats.extensions.entries())
        .sort((a,b)=>b[1]-a[1])
        .map(([ext,count])=>`${ext}:${count}`)
        .join(', ')

        const message = `Analysis of ${rootRel}\nFiles: ${stats.files}\nDirectories:${stats.dirs}\nTotal Lines: ${stats.totalLines}\nTotal Bytes: ${stats.totalBytes}\nExtensions: ${extList}`
        
        this.tracker.log({
            type: 'tool_execute',
            path: rootRel,
            details: { toolOutput: message },
            status: 'executed',
        });

        return message;
    }

    queueShell(command: string): string {
        if (!this.config.tools.allowShellExecution) {
            throw new Error('Shell execution not enabled by configuration');
        }

        const action = this.tracker.log({
            type: 'tool_execute',
            path: command,
            details: { command },
            status: 'pending',
        });

        this.queue.push(async () => {
            try {
                const { stdout, stderr } = this.executeShell(command);
                this.tracker.updateStatus(action.id, 'executed');
                return stdout || stderr;
            } catch (error) {
                this.tracker.updateStatus(action.id, 'failed');
                return error instanceof Error ? error.message : String(error);
            }
        });

        return `Shell command queued: ${command}`;
    }

    /** Drain and run all queued shell tasks in order */
    async flushQueue(): Promise<string[]> {
        const results: string[] = [];
        while (this.queue.length > 0) {
            const task = this.queue.shift()!;
            results.push(await task());
        }
        return results;
    }

    private skillRoots(): string[] {
        return [
            path.resolve(this.config.codebasePath, '.agents', 'skills'),
            path.resolve(this.config.codebasePath, 'skills'),
        ];
    }

    listSkills(): string {
        const roots = this.skillRoots();
        const found: string[] = [];

        for (const root of roots) {
            if (!fs.existsSync(root)) continue;
            for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
                if (ent.isDirectory()) {
                    const skillMd = path.join(root, ent.name, 'SKILL.md');
                    if (fs.existsSync(skillMd)) {
                        found.push(`${ent.name} (${path.relative(this.config.codebasePath, skillMd)})`);
                    }
                }
            }
        }

        return found.length > 0
            ? `Available skills:\n${found.join('\n')}`
            : 'No skills found.';
    }

    readSkill(skillPath: string): string {
        const abs = path.isAbsolute(skillPath)
            ? path.normalize(skillPath)
            : path.normalize(path.resolve(this.config.codebasePath, skillPath));
        const allowed = this.skillRoots().some((root) => {
            const r = path.resolve(root);
            return abs === r || abs.startsWith(r + path.sep);
        });
        if (!allowed) throw new Error("read_skill: outside skill roots");
        const text = fs.readFileSync(abs, "utf8");
        this.tracker.log({
            type: "code_analysis",
            path: abs,
            details: { after: text, toolName: "read_skill" },
            status: "executed",
        });
        return text;
    }

    readSkillDocs(skillPath: string): string {
        return this.readSkill(skillPath);
    }

    applyApprovedFromTracker(): { errors: string[] } {
        const errors: string[] = [];
        const all = [...this.tracker.getActions()];

        for (const a of all.filter((x) => x.type === 'folder_create' && x.status === 'approved')) {
            try {
                fs.mkdirSync(this.resolveSafe(a.path), { recursive: true });
            } catch (e) {
                errors.push(String(e));
            }
        }

        const fileOps = all
            .filter(
                (a) =>
                    (a.type === 'file_create' || a.type === 'file_modify' || a.type === 'file_delete') &&
                    a.status === 'approved',
            )
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        for (const a of fileOps) {
            try {
                if (a.type === 'file_delete') {
                    const absPath = this.resolveSafe(a.path);
                    if (fs.existsSync(absPath)) {
                        fs.rmSync(absPath, { force: true, recursive: true });
                    }
                } else {
                    const content = a.details.after ?? '';
                    const absPath = this.resolveSafe(a.path);
                    const dir = path.dirname(absPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(absPath, content, 'utf-8');
                }
            } catch (e) {
                errors.push(String(e));
            }
        }

        return { errors };
    }

    clearStaging():void{
        this.overlay.clear();
        this.deleted.clear();
        
    }
}


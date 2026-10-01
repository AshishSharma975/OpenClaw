export type ActionType=
"file_create"|
"file_modify"|
"file_delete"|
"folder_create"|
"tool_execute"|
"read_file"|
"read_directory"


export type ActionStatus = 'pending' | 'executed' | 'approved' | 'rejected';

export interface ActionLog{
    id:string;
    timestamp:Date;
    type:ActionType;
    path:string
    details:{
        before?: string;
        after?: string;
        toolName?:string;
        toolCall?:string;
        toolOutput?:string;
        error?:string;
        command?:string
    };
    status:ActionStatus;
    userApproved?:boolean
}

export interface AgentConfig{
    codebasePath:string;
    maxFileSizeToRead:number;
    excludePatterns:string[];
    tools:{
        allowShellExecution:boolean;
        allowFileModification:boolean;
        allowFileCreation:boolean;
        allowFolderCreation:boolean
    }
}

export const defaultAgentConfig = ():AgentConfig => ({
    codebasePath:process.cwd(),
    maxFileSizeToRead:50000,
    excludePatterns:[
        ".git",
        ".openrouter",
        "node_modules",
        "build",
        "dist",
        "*.log",
        ".env",
        ".env.*",
        
    ],
    tools:{
        allowShellExecution:false,
        allowFileModification:true,
        allowFileCreation:true,
        allowFolderCreation:true
    }
});

export function isMutationType(t:ActionType): boolean{
    return (
        t === 'file_create' ||
        t === 'file_modify' ||
        t === 'file_delete' ||
        t === 'folder_create' ||
        t === 'tool_execute'
    );
       
   
}
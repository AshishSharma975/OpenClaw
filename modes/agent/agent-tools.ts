import { tool } from "ai";
import { z } from "zod";
import type {ToolExecutor} from "./tool-executor";


export function createAgentTools(executor:ToolExecutor){
    
    return{
        read_file: tool({
            description: "Read a file and return its content",
            inputSchema: z.object({
                path: z.string().describe("Path to the file to read")
            }),
            execute:async({path:p})=>executor.readFile(p)
        }),

        create_file: tool({
            description: "Create a file with the given content",
            inputSchema: z.object({
                path: z.string().describe("Path to the file to create"),
                content: z.string().describe("Content to write to the file")
            }),
            execute:async({path:p,content:c})=>executor.writeFile(p,c)
        }),

        modify_file: tool({
            description: "Modify a file by replacing its content",
            inputSchema: z.object({
                path: z.string().describe("Path to the file to modify"),
                content: z.string().describe("New content for the file")
            }),
            execute:async({path:p,content:c})=>executor.writeFile(p,c)
        }),

        delete_file: tool({
            description: "Delete a file",
            inputSchema: z.object({
                path: z.string().describe("Path to the file to delete")
            }),
            execute:async({path:p})=>executor.deleteFile(p)
        }),

        list_files: tool({
            description: "List files in a directory",
            inputSchema: z.object({
                path: z.string().describe("Path to the directory to list")
            }),
            execute:async({path:p})=>executor.listFiles(p)
        }),

        create_folder: tool({
            description: "Create a folder",
            inputSchema: z.object({
                path: z.string().describe("Path to the folder to create")
            }),
            execute:async({path:p})=>executor.createFolder(p)
        }),

       search_files: tool({
        description: "Search for files",
        inputSchema: z.object({
            path: z.string().optional().describe("Path to directory to search (defaults to '.')"),
            pattern: z.string().optional().describe("Glob pattern to match files (defaults to '*')"),
            query: z.string().optional().describe("Query to search for")
        }),
        execute: async ({ path: p = ".", pattern = "*", query: q }) =>
            executor.searchFiles(p ?? ".", pattern ?? "*", q)
       }),

       analyze_codebase: tool({
        description: "Analyze the codebase",
        inputSchema: z.object({
            path: z.string().optional().describe("Path to analyze (defaults to '.')"),
            query: z.string().optional().describe("Query to analyze")
        }),
        execute: async ({ path: p, query: q }) => executor.analyzeCodebase(p || q || ".")
       }),

       execute_shell: tool({
        description: "Execute a shell command",
        inputSchema: z.object({
            command: z.string().describe("Command to execute")
        }),
        execute: async ({ command: c }) => executor.executeShell(c)
       }),

       list_skills: tool({
        description: "List available skills",
        inputSchema: z.object({}),
        execute: async () => executor.listSkills()
       }),

       read_skill_docs: tool({
        description: "Read skill documentation",
        inputSchema: z.object({
            skill: z.string().describe("Skill name")
        }),
        execute: async ({ skill: s }) => executor.readSkill(s)
       }),

       apply_approved: tool({
        description: "Apply all approved changes from action tracker",
        inputSchema: z.object({}),
        execute: async () => JSON.stringify(executor.applyApprovedFromTracker())
       }),

       flush_queue: tool({
        description: "Flush and run all queued shell commands",
        inputSchema: z.object({}),
        execute: async () => (await executor.flushQueue()).join("\n")
       })
    }
}
import chalk from "chalk";
import {confirm, isCancel, text} from "@clack/prompts";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getAgentModel } from "../../ai";
import { ActionTracker } from "../agent/action.tracker";
import { ToolExecutor } from "../agent/tool-executor";
import { defaultAgentConfig } from "../agent/types";
import { renderTerminalMarkeddown } from "../../tui/terminal-md";
import { runApprovalFlow } from "../agent/approval";


function createAskTool(executor:ToolExecutor){
    return{
         read_file: tool({
            description: "Read a file and return its content",
            inputSchema: z.object({
                path: z.string().describe("Path to the file to read")
            }),
            execute:async({path:p})=>executor.readFile(p)
        }),

         list_files: tool({
            description: "List files in a directory",
            inputSchema: z.object({
                path: z.string().describe("Path to the directory to list")
            }),
            execute:async({path:p})=>executor.listFiles(p)
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

    }
}

function asMd(question: string, answer: string): string {
    return `# Question\n\n${question.trim()}\n\n# Answer\n\n${answer.trim()}\n`;
}

export async function runAskMode() {
    console.log(chalk.bold("\n ❓ Ask Mode\n"));

    const question = await text({message:"What do you want to ask?"})
    if(isCancel(question) || ! question.trim())
        return;

    const config  = defaultAgentConfig()
    config.tools.allowFileCreation = true;
    config.tools.allowFileModification = false;
    config.tools.allowFolderCreation = false;
    config.tools.allowShellExecution = false;
    
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(config, tracker, config.codebasePath);

    // Todo web-serach tool ( firecrawl)


    const tools ={
     ...createAskTool(executor),

    }


    const agent = new ToolLoopAgent({
        model: getAgentModel(),
        instructions: [
            `You are an expert AI assistant answering questions about this codebase.`,
            `Workspace root: ${config.codebasePath}`,
            `Inspect files and directories using the available tools (read_file, list_files, search_files, analyze_codebase) to understand the codebase.`,
            `Always produce a thorough, well-formatted Markdown response explaining the concept with code examples when applicable.`
        ].join("\n"),
        tools,
        stopWhen: stepCountIs(25),
    });

    const result = await agent.generate({
        prompt: question.trim(),
        onStepFinish: ({ toolCalls }) => {
            for (const tc of toolCalls) {
                const preview = JSON.stringify(tc.input).slice(0, 160);
                console.log(
                    chalk.green(' ✔️'),
                    chalk.bold(String(tc.toolName)),
                    chalk.dim(preview + (preview.length >= 160 ? " ..." : ""))
                );
            }
        }
    });
    const asnwer = result.text?.trim() || "(no answer)";

    console.log("\n" + renderTerminalMarkeddown(asnwer) + "\n")


    const wantSave =  await confirm({
        message:"Save this answer to .md file",
        initialValue: false,

    })
    if(isCancel(wantSave) || !wantSave)
    return;

    const fiilename = await text({
        message: "filename",
        initialValue: "ask.md",
        validate: (v) => {
            let s = (v ?? '').trim();
            if (!s) return "Filename cannot be empty";
            if (s.endsWith('.md')) s = s.slice(0, -3);
            if (!/^[^\/\\:*?"<>|]+$/.test(s)) return "Invalid characters in filename";
        }
    });

    if (isCancel(fiilename) || !fiilename.trim()) return;

    const targetFile = fiilename.trim().endsWith('.md') ? fiilename.trim() : `${fiilename.trim()}.md`;

    executor.writeFile(targetFile, asMd(question, asnwer));

    const ok = await runApprovalFlow(tracker);
    if (!ok) return executor.clearStaging();

    const { errors } = executor.applyApprovedFromTracker();
    if (errors.length > 0) {
        console.log(chalk.red("\nErrors occurred while saving file:"));
        for (const e of errors) {
            console.log(chalk.red(e));
        }
    } else {
        console.log(chalk.green(`\n✔ Saved answer to ${targetFile}`));
    }

    executor.clearStaging();
}
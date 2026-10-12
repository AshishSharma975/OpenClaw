import { tool, ToolLoopAgent, stepCountIs } from 'ai';
import { z } from 'zod';
import { getAgentModel } from '../../ai/ai.config.ts';
import { ActionTracker } from '../agent/action-tracker.ts';
import { ToolExecutor } from '../agent/tool-executor.ts';
import { createAgentTools } from '../agent/agent-tools.ts';
import { defaultAgentConfig, type AgentConfig } from '../agent/types.ts';
import { createWebTools } from '../plan/web-tools.ts';
import type { Plan, PlanStep } from '../plan/types.ts';
import { replyMd } from './text.ts';
import { finishOrApprove } from './approval-session.ts';



function readOnlyConfig(): AgentConfig{
    const c = defaultAgentConfig();
    c.tools.allowFileCreation = false;
    c.tools.allowFileModification = false;
    c.tools.allowFolderCreation = false;
    c.tools.allowShellExecution = false;
    return c;
}

function agentOptions(config:AgentConfig, maxSteps:number){
    return {
        model:getAgentModel(),
        stopWhen: stepCountIs(maxSteps),
        instructions: [
            `Workspace root: ${config.codebasePath}`,
            'All mutations are staged until approval.'
        ].join('\n')
    };
}

function createReadOnlyTools(executor:ToolExecutor){
    return {
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


     }
}

function extraWebTool(tracker:ActionTracker){
    return process.env.FIRECRAWL_API_KEY ? createWebTools(tracker):{};

}

export async function runAsk( ctx:{reply:(t:string, o?:object)=> Promise<unknown>}, q:string    ) {
    const config = readOnlyConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(config, tracker, config.codebasePath);
    const tools = {...createReadOnlyTools(executor), ...extraWebTool(tracker)};
    const agents = new ToolLoopAgent({
        ...agentOptions(config,20),
        tools
    })

    const {text} = await agents.generate({
        prompt:q,
    })
    await replyMd(ctx , text || "no answer");

}

export async function runAgent(ctx: { reply: (t: string, o?: object) => Promise<unknown> }, chatId: number, goal: string) {
    const config = defaultAgentConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(config, tracker, config.codebasePath);
    const tools = createAgentTools(executor);
    const agent = new ToolLoopAgent({
        ...agentOptions(config, 40),
        tools,
    });
    const { text } = await agent.generate({ prompt: goal });
    if (text?.trim()) await replyMd(ctx, text.trim());
    await finishOrApprove(ctx, chatId, tracker, executor, '✅ Done. No file changes were needed.');
}

export async function runPlanSteps(
    ctx: { reply: (t: string, o?: object) => Promise<unknown> },
    chatId: number,
    plan: Plan,
    steps: PlanStep[],
) {
    const config = defaultAgentConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(config, tracker, config.codebasePath);
    const tools = { ...createAgentTools(executor), ...extraWebTool(tracker) };

    for (const step of steps) {
        await ctx.reply(`🔧 Executing: *${step.title}*`, { parse_mode: 'Markdown' });
        const prompt = [`Goal: ${plan.goal}`, `Step: ${step.title}`, step.description].join('\n');
        const agent = new ToolLoopAgent({
            ...agentOptions(config, 30),
            tools,
        });
        const { text } = await agent.generate({ prompt });
        if (text?.trim()) await replyMd(ctx, text.trim());
    }

    await finishOrApprove(ctx, chatId, tracker, executor, '✅ All steps done. No file changes were needed.');
}
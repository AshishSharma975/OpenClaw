import {
    Output,
    extractJsonMiddleware,
    generateText,
    stepCountIs,
    tool,
    wrapLanguageModel,
} from 'ai';
import { z } from "zod";
import chalk from 'chalk';
import { getAgentModel } from '../../ai';
import { ToolExecutor } from '../agent/tool-executor';
import { defaultAgentConfig } from '../agent/types';
import type {plan , planstep} from './types.ts';

const planSchema = z.object({
    researchSummary:z.string().optional(),
    steps:z.array(
        z.object({
            id:z.string(),
            title:z.string(),
            description:z.string(),
            hints:z.string().optional(),
            complexity:z.enum(['low','medium','high']).optional(),
        })
    )
    .min(1,"Atleast one step is required")
    .max(15,"Maximum 15 steps allowed")
})

function readOnlyTools(executor: ToolExecutor) {
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

const PLAN_INSTRUCTIONS = (codebase: string, hasWeb: boolean) =>
  [
    'You are a Plan-Mode planner. You DO NOT modify files.',
    `Workspace: ${codebase}`,
    'Use read-only tools for codebase/skills research.',
    hasWeb
      ? 'Web tools are available (web_search/web_crawl/fetch_url). Use only when needed.'
      : 'Web tools are unavailable (no FIRECRAWL_API_KEY).',
    'Output must match the provided JSON schema.',
    'Keep it short: 1-10 steps.',
  ].join('\n');
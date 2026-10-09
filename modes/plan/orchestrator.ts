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
import { generatePlan } from "./planner";
import type { plan } from "./types";

export async function runPlanMode():Promise<void> {
    console.log(chalk.bold('\n ⏰ PLAN MODE: \n '));


    const goal = await text({
        message:"What is your Goal ?"
    })

    if(isCancel(goal) || !goal.trim()) return;

    const plan = await generatePlan(goal);
    
}
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
import { printPlan, selectSteps } from "./selection";
import type { plan, planstep } from "./types";
import { createAgentTools } from "../agent/agent-tools";


function stepPrompt (goal:string,step:planstep):string {
  return `
  #Goal:${goal}
  #currentStep:${step.title}
  #Description:${step.description}
  
  `
}

export async function runPlanMode():Promise<void> {
    console.log(chalk.bold('\n ⏰ PLAN MODE: \n '));


    const goal = await text({
        message:"What is your Goal ?"
    })

    if(isCancel(goal) || !goal.trim()) return;

    const plan = await generatePlan(goal);

    printPlan(plan);



    const selected = await selectSteps(plan);
    if (isCancel(selected) || selected.length === 0) return;

    const proceed = await confirm({
        message:`Execute ${selected.length} step(s)?`,
        initialValue:true
    }) 
    if (isCancel(proceed) || !proceed) return;

    const config = defaultAgentConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(config, tracker, config.codebasePath);



    //todo: add web tools
    const tools ={
        ...createAgentTools(executor)
    }

    for(const step of selected){
        console.log(chalk.bold(`\n 🔨 ${step.title}`));
        console.log(chalk.gray(`   ${step.description}`));

        const agent = new ToolLoopAgent({
            model:getAgentModel(),
            stopWhen:stepCountIs(30),
            tools,
            
        })

         const r = await agent.generate({
            prompt: stepPrompt(plan.goal, step),
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
        
         if(r.text){
            console.log(renderTerminalMarkeddown(r.text));
         }

    }

    const ok = await runApprovalFlow(tracker);

    if(!ok) return executor.clearStaging();

    const {errors} = executor.applyApprovedFromTracker();
    if(errors.length>0){
        console.log(chalk.red(`\n ❌ ${errors.length} errors occurred.`));
        for (const e of errors) console.log(chalk.red(` ${e}`));

    }else {
        console.log(chalk.green(`\n ✅ ${selected.length} steps executed.`));
    }
    executor.clearStaging();
    
}
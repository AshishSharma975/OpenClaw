import { text , isCancel} from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action.tracker";
import { ToolExecutor } from "./tool-executor";
import { createAgentTools } from "./agent-tools";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel } from "../../ai";
import { json } from "node:stream/consumers";
import { renderTerminalMarkeddown } from "../../tui/terminal-md";
import { runApprovalFlow } from "./approval";
export async function runAgentMode(){
    console.log("Agent Mode started");
    
    const goal = await text({
        message: "What would you like the agent do?",
        placeholder:"concreate task for this codebase"
    });

    if(isCancel(goal)){
        console.log(chalk.red("Operation cancelled"));
        return;
    }


    const config = defaultAgentConfig()
    const tracker = new ActionTracker()
    const executor = new ToolExecutor(config, tracker, config.codebasePath)
    const tools  = createAgentTools(executor);
    const agent = new ToolLoopAgent({
        model:  getAgentModel(),
        stopWhen:stepCountIs(40),
        instructions:[
        `workspace root: ${config.codebasePath}`,
        `All mutation are staged untill approval`
        ].join("\n"),
        tools:tools
        
    })

    const result = await agent.generate({
        prompt:goal.trim(),
        onStepFinish:({toolCalls})=>{
            for(const tc of toolCalls){
                const preview = JSON.stringify(tc.input).slice(0 , 160)
                console.log(
                    chalk.green( ' ✔️'),
                    chalk.bold(String(tc.toolName)),
                    chalk.dim(preview + (preview.length >= 160? " ...":""))
                )
            }
        }
    })

    if(result.text?.trim()){
        console.log(renderTerminalMarkeddown(result.text));
    }

    const ok = await runApprovalFlow(tracker);
    if(!ok){
        return executor.clearStaging()

    }

    const {errors} = await executor.applyApprovedFromTracker();
    if(errors.length > 0){
        console.log(chalk.red(renderTerminalMarkeddown("**Errors occurred during apply**")))
        for(const e of errors){
            console.log(renderTerminalMarkeddown(e));
        }
        executor.clearStaging();
    } else {
        console.log(chalk.green(renderTerminalMarkeddown("**All changes applied successfully**")));
    }

    
    executor.clearStaging();
}



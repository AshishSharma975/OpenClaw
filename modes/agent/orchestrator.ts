import { text , isCancel} from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action.tracker";

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
    const executor = new ToolExecutor(config,)

    
}

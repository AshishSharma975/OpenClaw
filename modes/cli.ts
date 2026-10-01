import chalk from "chalk";
import {select , isCancel} from "@clack/prompts";




export async function runCliMode(){


while(true){
    const mode = await select({
        message: "Choose a mode",
        options: [
            {value: "agent", label: "Agent Mode"},
            {value: "plan", label: "Plan Mode"},
            {value: "ask", label: "Ask Mode"},
            {value: "back", label: "Back"},
            {value: "exit", label: "Exit"}
        ]
    });

    if (isCancel(mode)) {
        console.log(chalk.red("Operation cancelled"));
        process.exit(0);
    }

    if (mode === "agent") {
        console.log(chalk.green("Agent Mode selected"));
    } else if (mode === "plan") {
        console.log(chalk.blue("Plan Mode selected"));
    } else if (mode === "ask") {
        console.log(chalk.yellow("Ask Mode selected"));
    } else if (mode === "back") {
        console.log(chalk.magenta("Back"));
        break;
    } else {
        console.log(chalk.red("Exiting..."));
        process.exit(0);
    }
}


}
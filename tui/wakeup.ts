import { select, isCancel } from "@clack/prompts";
import chalk from "chalk"; // for add coloring in terminal.
import figlet from "figlet"; // for add big letters.

import { runCliMode } from "../modes/cli";

const BANNER_FONT='ANSI SHADOW';
const SHADOW = chalk.hex('#5b4d9e');
const FACE = chalk.hex('#e8dcf8').bold;



// banner of your ashcodeclaw
function printBanner(ascii: string) {
    const bannerlines = ascii.replace(/\s+$/, '').split('\n');

    // Shadow layer — offset by 2 spaces to the right
    for (const line of bannerlines) {
        console.log(SHADOW('  ' + line));
    }

    // Face layer — printed directly below
    for (const line of bannerlines) {
        console.log(FACE(line));
    }

    console.log();
}


export async function runWakeupTui() {

let ascii:string;
try{
ascii=figlet.textSync('ashcodeclaw' ,{
    font:BANNER_FONT
})
} catch(error){
    ascii= figlet.textSync('ashcodeclaw' ,{
        font:'Standard'
    })
}

printBanner(ascii)


const mode = await select({
    message:"which mode you want to proceed with ?",
    options: [
        {value: "cli", label: "CLI Mode"},
        {value: "telegram", label: "Telegram Bot Mode"},
        {value:"exit", label:"Exit"}
    ]
})

if (isCancel(mode)){
  console.log("operation cancelled");
  process.exit(0);
}

if(mode === "cli"){
    console.log(chalk.green("CLI Mode selected"));
    await runCliMode();
} else if(mode === "telegram") {
    console.log(chalk.blue("Telegram Bot Mode selected"));
    // await runTelegramMode();
} else {
    console.log(chalk.red("Exiting..."));
    process.exit(0);
}

}
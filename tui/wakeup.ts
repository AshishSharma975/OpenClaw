import { select, isCancel } from "@clack/prompts";
import chalk from "chalk"; // for add coloring in terminal.
import figlet from "figlet"; // for add big letters.



const BANNER_FONT='ANSI SHADOW';
const SHADOW = chalk.hex('#5b4d9e');
const FACE = chalk.hex('#e8dcf8').bold;



// banner of your ashcodeclaw
function printBannerWithShadow(ascii:string){
    const bannerlines = ascii.replace(/\s+$/, '').split('\n');
    const maxLength=bannerlines.reduce((max,line) => Math.max(max,line.length),0);
    const rowWidths = maxLength + 2;
 
    for (const line of bannerlines) {
        console.log(SHADOW(' ' + line).padEnd(rowWidths));
    }

    process.stdout.write(`\x1b[${bannerlines.length + 2}A`);

    for (const line of bannerlines){
       console.log(FACE(line.padEnd(rowWidths)))
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

printBannerWithShadow(ascii)


const mode = await select({
    message:"which mode you want to proceed with ?",
    options: [
        {value: "cli", label: "CLI Mode"},
        {value: "telegram", label: "Telegram Bot Mode"},
    ]
})

if (isCancel(mode)){
  console.log("operation cancelled");
  process.exit(0);
}

if(mode === "cli"){
    console.log(chalk.green("CLI Mode selected"));
    // await run;
} else {
    console.log(chalk.blue("Telegram Bot Mode selected"));
    // await run;
}

}
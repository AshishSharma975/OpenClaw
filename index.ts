#!/usr/bin/env bun

import { Command } from "commander";
import {runWakeupTui} from "./tui/wakeup";


const program = new Command();


program
  .name("ashcodeclaw-build")
  .description("Build your code with ashcodeclaw")
  .version("1.0.0")

program.command("wakeup")
  .description("show the banner and pick CLI or Telegram mode")
  .action(async () => {
   await runWakeupTui();
  })

await program.parseAsync(process.argv);

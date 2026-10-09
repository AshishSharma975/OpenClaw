import chalk from "chalk";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import type { plan as Plan } from "./types";

const COMPLEXITY_COLOR: Record<'low' | 'medium' | 'high', string> = {
  low: chalk.green('low'),
  medium: chalk.yellow('medium'),
  high: chalk.red('high'),
};

export function printPlan(plan: Plan): void {
  if (plan.researchSummary?.trim()) {
    console.log(chalk.bold('\n🔍 Research summary'));
    console.log(renderTerminalMarkdown(plan.researchSummary));
  }
  console.log(chalk.bold('\n📋 Generated Plan\n'));
  for (const [i, s] of plan.steps.entries()) {
    const tag = s.complexity ? ` [${COMPLEXITY_COLOR[s.complexity]}]` : '';
    console.log(`  ${chalk.cyan(`Step ${String(i + 1).padStart(2)}`)}. ${chalk.bold(s.title)}${tag}`);
  }
  console.log();
}
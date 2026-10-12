import type { Telegraf } from "telegraf";
import { isOwner } from "./auth";
import { WELCOME } from "./constants";
import { commandArg } from "./text";
import { runAsk, runAgent, runPlanSteps } from "./agent-run";
import { generatePlan } from "../plan/planner";
import { type PlanSession, planSessions, planMessage, planKeyboard, refreshPlanUi } from "./plan-session";
import { approvalSessions, approvalDiff } from "./approval-session";



export function registerHandler(bot:Telegraf){
    bot.command("start", async(ctx)=>{
        if(!isOwner(ctx.chat.id)) return;
        await ctx.reply(WELCOME,{parse_mode:"Markdown"})
    })


    bot.command("ask",async(ctx)=>{
        if(!isOwner(ctx.chat.id)) return;
        const q = commandArg(ctx.message.text, "ask")
        if(!q) return ctx.reply('Usage: `/ask <your question>`', {parse_mode: 'Markdown'})

            await ctx.reply("Processing...")

            void runAsk(ctx , q).catch(console.error)

        
    })

    bot.command('agent', async(ctx)=>{
        if(!isOwner(ctx.chat.id)) return;
        const goal = commandArg(ctx.message.text,'agent');
        if(!goal) return ctx.reply('Usage: `/agent <your goal>`', {parse_mode: 'Markdown'})

            await ctx.reply("Agent is working on your task..");
            void runAgent(ctx, ctx.chat.id,goal).catch(console.error)   
        
    })

    bot.command('plan', async(ctx)=>{
         if(!isOwner(ctx.chat.id)) return;
        const goal = commandArg(ctx.message.text,'plan');
        if(!goal) return ctx.reply('Usage: `/plan <your goal>`', {parse_mode: 'Markdown'})

        await ctx.reply("Planning the task");
        void (async ()=>{
            const plan = await generatePlan(goal)
            const session: PlanSession = { plan, selected: new Set(plan.steps.map((s) => s.id)) };
            await ctx.reply(planMessage(session), { parse_mode: 'Markdown', ...planKeyboard(session) });
            planSessions.set(ctx.chat.id, session);
        })().catch(console.error)
    })

    bot.action(/^plan_toggle:(.+)$/, async(ctx)=>{
        if(!ctx.chat || !isOwner(ctx.chat.id)) return ctx.answerCbQuery();
        const s = planSessions.get(ctx.chat.id);
        if(!s) return ctx.answerCbQuery();
        
    const id = ctx.match[1]!;
    if(s.selected.has(id)) s.selected.delete(id);
    else s.selected.add(id);

    await refreshPlanUi(ctx, s);
    await ctx.answerCbQuery();
        
    })

    bot.action("plan_all",async(ctx)=>{
        if(!ctx.chat || !isOwner(ctx.chat.id)) return ctx.answerCbQuery();
        const s = planSessions.get(ctx.chat.id);
        if(!s) return ctx.answerCbQuery();
        s.selected = new Set(s.plan.steps.map((s)=>s.id));
        await refreshPlanUi(ctx,s);
        await ctx.answerCbQuery()
        
    })

    bot.action("plan_none", async(ctx)=>{
        if(!ctx.chat || !isOwner(ctx.chat.id)) return ctx.answerCbQuery();
        const s = planSessions.get(ctx.chat.id);
        if(!s) return ctx.answerCbQuery();
        s.selected.clear();
        await refreshPlanUi(ctx,s);
        await ctx.answerCbQuery()
    })

    bot.action("plan_proceed", async(ctx)=>{
        if(!ctx.chat || !isOwner(ctx.chat.id)) return ctx.answerCbQuery();
        const s = planSessions.get(ctx.chat.id);
        if(!s) return ctx.answerCbQuery();
        const steps = s.plan.steps.filter((step)=>s.selected.has(step.id));
        if(steps.length === 0){
            await ctx.reply("No steps selected");
            await ctx.answerCbQuery();
            return;
        }
        await refreshPlanUi(ctx,s);
        await ctx.answerCbQuery()
        void runPlanSteps(ctx,ctx.chat.id,s.plan,steps).catch(console.error);
    })

    bot.action("approval_diff", async (ctx) => {
        if (!ctx.chat || !isOwner(ctx.chat.id)) return ctx.answerCbQuery();
        const s = approvalSessions.get(ctx.chat.id);
        if (!s) return ctx.answerCbQuery();
        const diff = approvalDiff(s.pending);
        await ctx.reply(diff || "No diff available");
        await ctx.answerCbQuery();
    });

    bot.action("approval_accept", async (ctx) => {
        if (!ctx.chat || !isOwner(ctx.chat.id)) return ctx.answerCbQuery();
        const s = approvalSessions.get(ctx.chat.id);
        if (!s) return ctx.answerCbQuery();
        for (const a of s.pending) s.tracker.updateStatus(a.id, "approved", false);
        const { errors } = s.executor.applyApprovedFromTracker();
        s.executor.clearStaging();
        approvalSessions.delete(ctx.chat.id);
        if (errors.length > 0) {
            await ctx.reply(`❌ Errors applying changes:\n${errors.join('\n')}`);
        } else {
            await ctx.reply(`✅ Applied ${s.pending.length} changes successfully.`);
        }
        await ctx.answerCbQuery();
    });

    bot.action("approval_reject", async (ctx) => {
        if (!ctx.chat || !isOwner(ctx.chat.id)) return ctx.answerCbQuery();
        const s = approvalSessions.get(ctx.chat.id);
        if (!s) return ctx.answerCbQuery();
        for (const a of s.pending) s.tracker.updateStatus(a.id, "rejected", false);
        s.executor.clearStaging();
        approvalSessions.delete(ctx.chat.id);
        await ctx.reply("❌ Changes rejected.");
        await ctx.answerCbQuery();
    });
    
}
    

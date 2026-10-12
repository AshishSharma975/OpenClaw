import type {Telegraf} from "telegraf";
import { isOwner } from "./auth";
import { WELCOME } from "./constants";
import { commandArg } from "./text";

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
}
    

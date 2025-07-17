import express from "express";
import fetch from "node-fetch";
import { Client, GatewayIntentBits, Events } from "discord.js";
import OpenAI from "openai";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
const discordToken = process.env.DISCORD_TOKEN;
const suggestionChannel = process.env.SUGGESTION_CHANNEL_ID;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Express test route
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

// API route to get top movers
app.get("/api/stocks", async (req, res) => {
  try {
    const data = await fetchTopMovers();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stock data" });
  }
});

// API to get AI suggestions
app.post("/api/suggestion", async (req, res) => {
  const { input } = req.body;
  try {
    const suggestion = await generateAISuggestions(input);
    res.json({ suggestion });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate suggestion" });
  }
});

// Start Express
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// DISCORD BOT STUFF

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content === "!gainers") {
    const { gainers } = await fetchTopMovers();
    const reply = gainers
      .map(g => `📈 ${g.Scrip} – ${g.LTP} BDT (${g.ChangePer.toFixed(2)}%)`)
      .join("\n");

    message.channel.send(`Top Gainers Today:\n${reply}`);
  }

  if (message.channel.id === suggestionChannel) {
    const suggestion = await generateAISuggestions(message.content);
    message.reply(`🤖 AI Suggestion:\n${suggestion}`);
  }
});

client.login(discordToken);

// Fetch stock data
async function fetchTopMovers() {
  const res = await fetch("https://www.dse.com.bd/latest_share_price_scroll_l.php");
  const html = await res.text();

  const gainers = [];
  const losers = [];

  const rows = html.split("<tr>").slice(2);
  for (let r of rows) {
    const cols = r.split("<td").map(col => col.replace(/<[^>]+>/g, "").trim());
    if (cols.length < 7) continue;

    const [Scrip, LTP, High, Low, YCP, Change, Trade] = cols;
    const ChangePer = parseFloat(Change);

    if (ChangePer > 0) gainers.push({ Scrip, LTP, ChangePer });
    else if (ChangePer < 0) losers.push({ Scrip, LTP, ChangePer });
  }

  gainers.sort((a, b) => b.ChangePer - a.ChangePer);
  losers.sort((a, b) => a.ChangePer - b.ChangePer);

  return {
    gainers: gainers.slice(0, 5),
    losers: losers.slice(0, 5),
  };
}

// AI Suggestion Generator
async function generateAISuggestions(input) {
  const chat = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are an expert Bangladeshi stock market analyst." },
      { role: "user", content: input }
    ],
  });

  return chat.choices[0].message.content;
}

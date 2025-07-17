// index.js - Fully revamped with both slash & prefix commands

import express from "express";
import fetch from "node-fetch";
import { Client, GatewayIntentBits, Events, Collection, REST, Routes, SlashCommandBuilder } from "discord.js";
import OpenAI from "openai";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Setup
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;

// Environment variables
const { DISCORD_TOKEN, OPENAI_API_KEY, CLIENT_ID, SUGGESTION_CHANNEL_ID } = process.env;
const favoriteStocks = process.env.FAVORITE_STOCKS?.split(",") || [];

// Express route
app.get("/", (req, res) => res.send("Stock Bot is running!"));

// Start Express
app.listen(port, () => console.log(`Server running on port ${port}`));

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.commands = new Collection();
const commands = [];

// Slash Command: /gainers
commands.push(
  new SlashCommandBuilder()
    .setName("gainers")
    .setDescription("Show top 10 gainers of DSE today")
);

// Slash Command: /losers
commands.push(
  new SlashCommandBuilder()
    .setName("losers")
    .setDescription("Show top 10 losers of DSE today")
);

// Slash Command: /suggest
commands.push(
  new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Get AI suggestion for a stock")
    .addStringOption(option => option.setName("query").setDescription("Stock info or query").setRequired(true))
);

// Slash Command: /favorites
commands.push(
  new SlashCommandBuilder()
    .setName("favorites")
    .setDescription("Show your favorite stocks info")
);

// Register slash commands
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(cmd => cmd.toJSON()) });
    console.log("✅ Slash commands registered successfully.");
  } catch (err) {
    console.error("❌ Failed to register slash commands:", err);
  }
})();

// AI setup
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Discord ready
client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// Message (prefix) commands
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const content = message.content.toLowerCase();

  if (content === "!gainers") {
    const { gainers } = await fetchTopMovers();
    return message.channel.send(formatStocks("Top Gainers Today", gainers));
  }

  if (content === "!losers") {
    const { losers } = await fetchTopMovers();
    return message.channel.send(formatStocks("Top Losers Today", losers));
  }

  if (message.channel.id === SUGGESTION_CHANNEL_ID) {
    const suggestion = await generateAISuggestions(message.content);
    return message.reply(`🤖 AI Suggestion:\n${suggestion}`);
  }
});

// Slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "gainers") {
    const { gainers } = await fetchTopMovers();
    await interaction.reply(formatStocks("Top Gainers Today", gainers));
  }

  if (commandName === "losers") {
    const { losers } = await fetchTopMovers();
    await interaction.reply(formatStocks("Top Losers Today", losers));
  }

  if (commandName === "suggest") {
    const query = interaction.options.getString("query");
    const suggestion = await generateAISuggestions(query);
    await interaction.reply(`🤖 AI Suggestion:\n${suggestion}`);
  }

  if (commandName === "favorites") {
    const all = await fetchAllStocks();
    const filtered = all.filter(s => favoriteStocks.includes(s.Scrip));
    await interaction.reply(formatStocks("📌 Favorite Stocks", filtered));
  }
});

client.login(DISCORD_TOKEN);

// Utilities
function formatStocks(title, list) {
  return `**${title}**\n` +
    list
      .map(s => `**${s.Scrip}** – ${s.LTP} BDT | 📊 Vol: ${s.Volume} | Chg: ${s.ChangePer.toFixed(2)}%`)
      .join("\n");
}

async function fetchTopMovers() {
  const all = await fetchAllStocks();
  const gainers = all.filter(s => s.ChangePer > 0).sort((a, b) => b.ChangePer - a.ChangePer).slice(0, 10);
  const losers = all.filter(s => s.ChangePer < 0).sort((a, b) => a.ChangePer - b.ChangePer).slice(0, 10);
  return { gainers, losers };
}

async function fetchAllStocks() {
  const res = await fetch("https://www.dse.com.bd/latest_share_price_scroll_l.php");
  const html = await res.text();

  const stocks = [];
  const rows = html.split("<tr>").slice(2);
  for (let row of rows) {
    const cols = row.split("<td").map(col => col.replace(/<[^>]+>/g, "").trim());
    if (cols.length < 10) continue;

    const [Scrip, LTP, High, Low, YCP, Change, Trade, Value, Volume] = cols;
    stocks.push({ Scrip, LTP, ChangePer: parseFloat(Change), Volume });
  }

  return stocks;
}

async function generateAISuggestions(input) {
  const chat = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a Bangladeshi stock analyst." },
      { role: "user", content: input }
    ],
  });

  return chat.choices[0].message.content;
}

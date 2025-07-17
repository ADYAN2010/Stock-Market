import express from "express";
import fetch from "node-fetch";
import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from "discord.js";
import OpenAI from "openai";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
const discordToken = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const suggestionChannel = process.env.SUGGESTION_CHANNEL_ID;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Express routes
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(port, () => {
  console.log(`🌐 Express server running on port ${port}`);
});

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Slash commands
const commands = [
  new SlashCommandBuilder().setName("gainers").setDescription("Show top gainers from DSE"),
  new SlashCommandBuilder().setName("losers").setDescription("Show top losers from DSE"),
  new SlashCommandBuilder().setName("stocks").setDescription("Show both top gainers and losers"),
  new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Get AI stock suggestion")
    .addStringOption(option =>
      option.setName("input").setDescription("Your question").setRequired(true)
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(discordToken);
(async () => {
  try {
    console.log("📥 Registering slash commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Slash commands registered!");
  } catch (err) {
    console.error("Slash command error:", err);
  }
})();

// Event: Bot ready
client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// Event: Handle messages (prefix commands)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  if (content === "!gainers") {
    const { gainers } = await fetchTopMovers();
    const reply = gainers.map(g => `📈 ${g.Scrip} – ${g.LTP} BDT (${g.ChangePer.toFixed(2)}%)`).join("\n");
    message.channel.send(`**Top Gainers Today:**\n${reply}`);
  }

  if (content === "!losers") {
    const { losers } = await fetchTopMovers();
    const reply = losers.map(l => `📉 ${l.Scrip} – ${l.LTP} BDT (${l.ChangePer.toFixed(2)}%)`).join("\n");
    message.channel.send(`**Top Losers Today:**\n${reply}`);
  }

  if (content === "!stocks") {
    const { gainers, losers } = await fetchTopMovers();
    const reply = `🚀 **Top Gainers:**\n${gainers.map(g => `📈 ${g.Scrip} – ${g.LTP} (${g.ChangePer.toFixed(2)}%)`).join("\n")}\n\n📉 **Top Losers:**\n${losers.map(l => `📉 ${l.Scrip} – ${l.LTP} (${l.ChangePer.toFixed(2)}%)`).join("\n")}`;
    message.channel.send(reply);
  }

  if (message.channel.id === suggestionChannel) {
    const suggestion = await generateAISuggestions(message.content);
    message.reply(`💡 AI Suggestion:\n${suggestion}`);
  }
});

// Event: Slash command interaction
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "gainers") {
    const { gainers } = await fetchTopMovers();
    const reply = gainers.map(g => `📈 ${g.Scrip} – ${g.LTP} BDT (${g.ChangePer.toFixed(2)}%)`).join("\n");
    await interaction.reply(`**🚀 Top Gainers Today:**\n${reply}`);
  }

  if (commandName === "losers") {
    const { losers } = await fetchTopMovers();
    const reply = losers.map(l => `📉 ${l.Scrip} – ${l.LTP} BDT (${l.ChangePer.toFixed(2)}%)`).join("\n");
    await interaction.reply(`**📉 Top Losers Today:**\n${reply}`);
  }

  if (commandName === "stocks") {
    const { gainers, losers } = await fetchTopMovers();
    const reply = `🚀 **Top Gainers:**\n${gainers.map(g => `📈 ${g.Scrip} – ${g.LTP} (${g.ChangePer.toFixed(2)}%)`).join("\n")}\n\n📉 **Top Losers:**\n${losers.map(l => `📉 ${l.Scrip} – ${l.LTP} (${l.ChangePer.toFixed(2)}%)`).join("\n")}`;
    await interaction.reply(reply);
  }

  if (commandName === "suggest") {
    const input = interaction.options.getString("input");
    const suggestion = await generateAISuggestions(input);
    await interaction.reply(`💡 AI Suggestion:\n${suggestion}`);
  }
});

client.login(discordToken);

// Stock Fetch
async function fetchTopMovers() {
  const res = await fetch("https://www.dse.com.bd/latest_share_price_scroll_l.php");
  const html = await res.text();

  const gainers = [], losers = [];
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
    gainers: gainers.slice(0, 10),
    losers: losers.slice(0, 10),
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

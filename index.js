require('dotenv').config();
const fetch = require('node-fetch');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

async function fetchTopMovers() {
  try {
    const res = await fetch('https://www.amarstock.com/api/feed/index/move');
    const data = await res.json();
    return {
      gainers: data.pos.slice(0, 3),
      losers: data.neg.slice(0, 3),
    };
  } catch (err) {
    console.error("❌ Error fetching stock data:", err);
    return { gainers: [], losers: [] };
  }
}

function formatStockMessage(stocks, title, emoji) {
  if (stocks.length === 0) return `⚠️ No ${title.toLowerCase()} data available.`;
  return `**${emoji} ${title}**\n` + stocks.map(s =>
    `📈 **${s.Scrip}**: ${s.LTP} (${s.ChangePer.toFixed(2)}%)`
  ).join('\n');
}

async function postStockUpdate() {
  const { gainers, losers } = await fetchTopMovers();
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);
  const message = [
    formatStockMessage(gainers, "Top Gainers", "🚀"),
    formatStockMessage(losers, "Top Losers", "📉")
  ].join('\n\n');
  channel.send(message);
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  postStockUpdate(); // initial message
  setInterval(postStockUpdate, 5 * 60 * 1000); // every 5 minutes
});

client.login(process.env.DISCORD_TOKEN);

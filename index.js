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

// Get favorite stocks from .env (comma-separated, e.g. "GP,UPGDCL,BSCCL")
const favoriteTickers = process.env.FAVORITE_STOCKS
  ? process.env.FAVORITE_STOCKS.split(',').map(s => s.trim().toUpperCase())
  : [];

async function fetchTopMovers() {
  try {
    const res = await fetch('https://www.amarstock.com/api/feed/index/move');
    const data = await res.json();
    return {
      gainers: data.pos.slice(0, 10),
      losers: data.neg.slice(0, 10),
      allStocks: [...data.pos, ...data.neg],
    };
  } catch (err) {
    console.error("❌ Error fetching stock data:", err);
    return { gainers: [], losers: [], allStocks: [] };
  }
}

function formatStockMessage(stocks, title, emoji) {
  if (stocks.length === 0) return `⚠️ No ${title.toLowerCase()} data available.`;
  
  return `**${emoji} ${title}**\n` + stocks.map(s =>
    `📈 **${s.Scrip}**\n` +
    `Price: ${s.LTP} BDT\n` +
    `Change: ${s.ChangePer?.toFixed(2) ?? 'N/A'}%\n` +
    `Volume: ${s.Volume ?? 'N/A'}\n` +
    `------------------------`
  ).join('\n');
}

function filterFavoriteStocks(allStocks) {
  return allStocks.filter(s => favoriteTickers.includes(s.Scrip.toUpperCase()));
}

async function postStockUpdate() {
  const { gainers, losers, allStocks } = await fetchTopMovers();
  const favorites = filterFavoriteStocks(allStocks);
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);

  const message = [
    formatStockMessage(gainers, "Top Gainers", "🚀"),
    formatStockMessage(losers, "Top Losers", "📉"),
    formatStockMessage(favorites, "Favorite Stocks", "⭐")
  ].join('\n\n');

  channel.send(message);
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  postStockUpdate(); // initial message
  setInterval(postStockUpdate, 20 * 1000); // every 20 seconds
});

client.login(process.env.DISCORD_TOKEN);

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

  const header = `╭─ ${emoji} **${title}** ─────────────────────`;
  const footer = `╰──────────────────────────────`;

  const lines = stocks.map(s =>
    `• **${s.Scrip}**\n` +
    `  ├ 💰 Price: \`${s.LTP} BDT\`\n` +
    `  ├ 📊 Change: \`${s.ChangePer?.toFixed(2) ?? 'N/A'}%\`\n` +
    `  └ 📦 Volume: \`${s.Volume ?? 'N/A'}\``
  );

  return [header, ...lines, footer].join('\n');
}

function filterFavoriteStocks(allStocks) {
  return allStocks.filter(s => favoriteTickers.includes(s.Scrip.toUpperCase()));
}

// 🔮 Basic AI Suggestion Generator
function generateAISuggestions(gainers, losers) {
  let suggestions = [];

  gainers.forEach(stock => {
    if (stock.ChangePer > 4) {
      suggestions.push(`📈 **${stock.Scrip}** is rising fast (+${stock.ChangePer.toFixed(2)}%). Might be worth keeping an eye on!`);
    }
  });

  losers.forEach(stock => {
    if (stock.ChangePer < -4) {
      suggestions.push(`⚠️ **${stock.Scrip}** is dropping significantly (${stock.ChangePer.toFixed(2)}%). Consider avoiding or watching closely.`);
    }
  });

  if (suggestions.length === 0) {
    suggestions.push("🤖 No strong movements detected right now. Market's pretty chill.");
  }

  return `🧠 **AI Suggestions:**\n\n` + suggestions.join('\n');
}

const basicInfoSection = `🔑 **Basic Info You’ll See Everywhere**
• **Stock Name & Symbol** – The company name and its short code (e.g., Apple = AAPL).
• **Price** – Current market price per share.
• **Open/Close Price** – The price at the start/end of the trading day.
• **High/Low (Day)** – Highest and lowest prices during the day.
• **Volume** – Number of shares traded during the day.
• **Market Cap** – Total value of the company’s shares.
• **52-Week High/Low** – The highest and lowest prices in the last year.

📈 **Performance & Value Data**
• **P/E Ratio** – Price vs earnings.
• **EPS** – Profit per share.
• **Dividend Yield** – Returns given to shareholders.
• **Beta** – Volatility of the stock.

📊 **Trading Info**
• **Bid Price** – Max price buyers wanna pay.
• **Ask Price** – Min price sellers wanna accept.
• **Bid/Ask Volume** – How many shares buyers/sellers want.
• **Order Book** – Live list of buy/sell orders.

📉 **Charts & Trends**
• **Candlestick Chart** – Shows price movement visually.
• **Moving Averages (MA, EMA)** – Trend tracking tools.
• **RSI, MACD** – Technical indicators used by traders.`;

async function postStockUpdate() {
  const { gainers, losers, allStocks } = await fetchTopMovers();
  const favorites = filterFavoriteStocks(allStocks);

  let updateChannel, suggestionChannel;
  try {
    updateChannel = await client.channels.fetch(process.env.CHANNEL_ID);
    const allChannels = await updateChannel.guild.channels.fetch();
    suggestionChannel = allChannels.find(ch => ch.name.toLowerCase() === 'suggestion');
  } catch (e) {
    console.error("❌ Failed to fetch channels:", e);
    return;
  }

  const now = new Date().toLocaleTimeString('en-BD', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const stockMessage = [
    `🕒 **Updated at:** ${now} (BST)`,
    formatStockMessage(gainers, "Top Gainers", "🚀"),
    formatStockMessage(losers, "Top Losers", "📉"),
    formatStockMessage(favorites, "Favorite Stocks", "⭐")
  ].join('\n\n');

  try {
    await updateChannel.send(stockMessage);
    await updateChannel.send(basicInfoSection);

    if (suggestionChannel && suggestionChannel.isTextBased()) {
      const suggestionMessage = generateAISuggestions(gainers, losers);
      await suggestionChannel.send(suggestionMessage);
    } else {
      console.warn("⚠️ Suggestion channel not found or not text-based.");
    }
  } catch (e) {
    console.error("❌ Failed to send message:", e);
  }
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  postStockUpdate(); // Initial post
  setInterval(postStockUpdate, 300000); // Every 5 mins
});



client.login(process.env.DISCORD_TOKEN);

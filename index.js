require('dotenv').config();
const fetch = require('node-fetch');
const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');

// Setup Discord and OpenAI clients
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  const header = `╭─ ${emoji} **${title}** ───────────────`;
  const footer = `╰────────────────────────────`;
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

function generateAISuggestions(gainers, losers) {
  let suggestions = [];
  gainers.forEach(stock => {
    if (stock.ChangePer > 4) {
      suggestions.push(`📈 **${stock.Scrip}** is rising fast (+${stock.ChangePer.toFixed(2)}%). Might be worth watching!`);
    }
  });
  losers.forEach(stock => {
    if (stock.ChangePer < -4) {
      suggestions.push(`⚠️ **${stock.Scrip}** is dropping hard (${stock.ChangePer.toFixed(2)}%). Use caution.`);
    }
  });
  if (suggestions.length === 0) {
    suggestions.push("🤖 No strong stock movements detected. The market's calm for now.");
  }
  return `🧠 **AI Suggestions:**\n\n${suggestions.join('\n')}`;
}

async function fetchStockDetails(ticker) {
  try {
    const res = await fetch(`https://www.amarstock.com/LatestPrice/${ticker.toUpperCase()}`);
    if (!res.ok) throw new Error(`Ticker "${ticker}" not found.`);
    const data = await res.json();
    return data[0];
  } catch (err) {
    console.error("❌ Error fetching stock details:", err);
    return null;
  }
}

function formatStockDetails(data) {
  return (
    `🔎 **Stock Info: ${data.Scrip}**\n` +
    `• Price – \`${data.LTP} BDT\`\n` +
    `• Open/Close – \`${data.Open} / ${data.Close}\`\n` +
    `• High/Low (Day) – \`${data.High} / ${data.Low}\`\n` +
    `• Volume – \`${data.Volume}\`\n` +
    `• 52-Week High/Low – \`${data.WeekHigh} / ${data.WeekLow}\`\n` +
    `• P/E Ratio – \`${data.PE}\`\n` +
    `• EPS – \`${data.EPS}\`\n` +
    `• Market Cap – \`${data.MarketCap} BDT\`\n` +
    `• NAV – \`${data.NAV}\`\n` +
    `• Suggestion below ⬇️`
  );
}

async function getAISuggestionForStock(ticker, data) {
  const prompt = `Give a concise buy/sell/hold suggestion for the Bangladeshi stock "${ticker}" with this data: Price=${data.LTP}, P/E=${data.PE}, EPS=${data.EPS}, Volume=${data.Volume}, 52WHigh=${data.WeekHigh}, 52WLow=${data.WeekLow}. Keep it under 40 words.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 60,
  });

  return `🤖 **AI Suggestion:** ${response.choices[0].message.content}`;
}

async function postStockUpdate() {
  const { gainers, losers, allStocks } = await fetchTopMovers();
  const favorites = filterFavoriteStocks(allStocks);

  let updateChannel, suggestionChannel;
  try {
    updateChannel = await client.channels.fetch(process.env.CHANNEL_ID);
    suggestionChannel = await client.channels.fetch(process.env.SUGGESTION_CHANNEL_ID);
  } catch (e) {
    console.error("❌ Channel fetch failed:", e);
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
    const suggestionMsg = generateAISuggestions(gainers, losers);
    if (suggestionChannel && suggestionChannel.isTextBased()) {
      await suggestionChannel.send(suggestionMsg);
    }
  } catch (e) {
    console.error("❌ Failed to send messages:", e);
  }
}

client.on('messageCreate', async message => {
  if (!message.content.startsWith('!stock')) return;

  const parts = message.content.split(' ');
  if (parts.length !== 2) {
    return message.reply("⚠️ Usage: `!stock [TICKER]`");
  }

  const ticker = parts[1].toUpperCase();
  const data = await fetchStockDetails(ticker);
  if (!data) {
    return message.reply(`❌ Could not find data for \`${ticker}\`.`);
  }

  const details = formatStockDetails(data);
  const aiAdvice = await getAISuggestionForStock(ticker, data);
  await message.channel.send(`${details}\n\n${aiAdvice}`);
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  postStockUpdate();
  setInterval(postStockUpdate, 5 * 60 * 1000); // every 5 mins
});

client.login(process.env.DISCORD_TOKEN);

require('dotenv').config();
const fetch = require('node-fetch');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { Configuration, OpenAIApi } = require('openai');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));
const favoriteTickers = process.env.FAVORITE_STOCKS?.split(',').map(s => s.trim().toUpperCase()) || [];

async function fetchTopMovers() {
  try {
    const res = await fetch('https://www.amarstock.com/api/feed/index/move');
    const data = await res.json();
    return { gainers: data.pos.slice(0,10), losers: data.neg.slice(0,10), allStocks: [...data.pos, ...data.neg] };
  } catch (err) {
    console.error("❌ fetchTopMovers error:", err);
    return { gainers: [], losers: [], allStocks: [] };
  }
}

async function fetchStockDetails(ticker) {
  try {
    const res = await fetch(`https://www.amarstock.com/data/company/${ticker}`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`❌ fetchStockDetails(${ticker}) error:`, err);
    return null;
  }
}

function formatMainStock(stocks, title, emoji) {
  if (!stocks.length) return `⚠️ No ${title.toLowerCase()} data.`;
  const header = `╭─ ${emoji} **${title}** ──────────────`;
  const footer = `╰────────────────────────`;
  const lines = stocks.map(s =>
    `• **${s.Scrip}** — ${s.LTP} BDT (${s.ChangePer?.toFixed(2) ?? 'N/A'}%) Vol: ${s.Volume ?? 'N/A'}`
  );
  return [header, ...lines, footer].join('\n');
}

function formatDetailedStock(stock) {
  if (!stock) return "⚠️ Stock not found.";
  const mcap = (Number(stock.MarketCapitalization) / 1e9).toFixed(2);
  return `📌 **${stock.CompanyName} (${stock.Scrip})**
• Price – ${stock.LastTradePrice} BDT  
• Open/Close – ${stock.OpenPrice} / ${stock.ClosePrice}  
• High/Low – ${stock.High} / ${stock.Low}  
• Volume – ${stock.Volume}  
• Market Cap – ${mcap} B BDT  

• P/E Ratio – ${stock.PE}  
• EPS – ${stock.EPS}  
• Dividend Yield – ${stock.DividendYield}%  
• Beta – ${stock.Beta}`;
}

async function generateAISuggestions(text) {
  try {
    const resp = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [
        { role:"system", content:"You are a helpful Bangladeshi stock advisor." },
        { role:"user", content:text }
      ],
      temperature:0.7
    });
    return resp.data.choices[0].message.content;
  } catch(err) {
    console.error('❌ OpenAI error:', err);
    return null;
  }
}

async function postStockUpdate() {
  try {
    const { gainers, losers, allStocks } = await fetchTopMovers();
    const favorites = allStocks.filter(s => favoriteTickers.includes(s.Scrip.toUpperCase()));
    const updateCh = await client.channels.fetch(process.env.CHANNEL_ID);
    const suggCh = await client.channels.fetch(process.env.SUGGESTION_CHANNEL_ID);

    const now = new Date().toLocaleTimeString('en-BD', { timeZone:'Asia/Dhaka', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
    await updateCh.send(`🕒 **Updated at:** ${now}`);
    await updateCh.send(formatMainStock(gainers,"Top Gainers","🚀"));
    await updateCh.send(formatMainStock(losers,"Top Losers","📉"));
    await updateCh.send(formatMainStock(favorites,"Favorite Stocks","⭐"));

    if (suggCh.isTextBased()) {
      const input = `Gainers:\n${gainers.map(g => `${g.Scrip} (${g.ChangePer.toFixed(2)}%)`).join(', ')}\nLosers:\n${losers.map(l => `${l.Scrip} (${l.ChangePer.toFixed(2)}%)`).join(', ')}\nSuggest 2 to buy and 2 to sell.`;
      const ai = await generateAISuggestions(input);
      await suggCh.send(`🤖 **AI Suggestions:**\n${ai || "⚠️ AI unavailable"}`);
    }
  } catch (e) {
    console.error('❌ postStockUpdate error', e);
  }
}

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;

  const [cmd, ticker] = msg.content.trim().split(/\s+/);
  if (cmd === '!stock' && ticker) {
    const data = await fetchStockDetails(ticker.toUpperCase());
    const formatted = formatDetailedStock(data);
    await msg.channel.send(formatted);

    if (data) {
      const input = `Here are details for ${ticker}:\n` + Object.entries(data).map(([k,v]) => `${k}: ${v}`).join(', ') + `\nShould I buy or sell?`;
      const ai = await generateAISuggestions(input);
      await msg.channel.send(`🤖 **AI Advice:**\n${ai || "⚠️ AI unavailable"}`);
    }
  }
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  postStockUpdate();
  setInterval(postStockUpdate, 300000);
});

if (!process.env.DISCORD_TOKEN || !process.env.CHANNEL_ID ||
    !process.env.SUGGESTION_CHANNEL_ID || !process.env.OPENAI_API_KEY) {
  console.error("❌ Missing required .env variables");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

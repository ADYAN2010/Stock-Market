require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');
const express = require('express');

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Load environment variables
const {
  DISCORD_TOKEN,
  OPENAI_API_KEY,
  CHANNEL_ID,
  SUGGESTION_CHANNEL_ID,
  EMERGENCY_CHANNEL_ID,
  FAVORITE_STOCKS,
  GROWTH_ALERT_THRESHOLD
} = process.env;

const favoriteStocks = FAVORITE_STOCKS.split(',');
const threshold = parseFloat(GROWTH_ALERT_THRESHOLD || '5');

// OpenAI setup
const openai = new OpenAIApi(
  new Configuration({ apiKey: OPENAI_API_KEY })
);

// Express server for Render port binding
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('✅ Stock bot is running!');
});
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});

// Fetch stock details from TwelveData (or Amarstock if you swap URLs)
async function fetchStockDetails(ticker) {
  try {
    const res = await axios.get(`https://api.twelvedata.com/quote?symbol=${ticker}&apikey=demo`);
    if (res.data.code || !res.data.price) throw new Error("Invalid ticker");
    return res.data;
  } catch (e) {
    console.error(`❌ Error fetching ${ticker}:`, e.message);
    return null;
  }
}

// Stock update logic
async function fetchStockUpdates() {
  const updateCh = await client.channels.fetch(CHANNEL_ID);
  const suggestCh = await client.channels.fetch(SUGGESTION_CHANNEL_ID);
  const alertCh = await client.channels.fetch(EMERGENCY_CHANNEL_ID);

  const now = new Date().toLocaleTimeString('en-BD', {
    timeZone: 'Asia/Dhaka', hour12: true
  });

  for (const ticker of favoriteStocks) {
    const data = await fetchStockDetails(ticker);
    if (!data) continue;

    const msg = `📊 **${data.name} (${data.symbol})**
🔹 Price: $${data.price}
🔹 Open: $${data.open}
🔹 High/Low: $${data.high} / $${data.low}
🔹 Change: ${data.change} (${data.percent_change}%)
🕒 ${now} (BST)`;

    await updateCh.send(msg);

    // Emergency alert if threshold hit
    const changePercent = parseFloat(data.percent_change);
    if (!isNaN(changePercent) && Math.abs(changePercent) >= threshold) {
      await alertCh.send(`🚨 **ALERT:** ${data.symbol} moved ${changePercent}%!`);
    }

    // AI Suggestion
    try {
      const aiResponse = await openai.createChatCompletion({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You're a stock analyst. Give a short Bangladeshi-style recommendation." },
          { role: "user", content: `Stock: ${data.symbol}, Price: ${data.price}, Change: ${data.change}, Percent Change: ${data.percent_change}` }
        ],
        max_tokens: 60
      });

      const suggestion = aiResponse.data.choices[0].message.content;
      await suggestCh.send(`🤖 AI Suggestion for **${data.symbol}**:\n${suggestion}`);
    } catch (e) {
      console.error("❌ OpenAI error:", e.message);
    }
  }
}

// Command listener
client.on('messageCreate', async msg => {
  if (!msg.content.startsWith('!stock ') || msg.author.bot) return;

  const ticker = msg.content.split(' ')[1]?.toUpperCase();
  if (!ticker) return msg.reply('⚠️ Usage: `!stock <TICKER>`');

  const data = await fetchStockDetails(ticker);
  if (!data) return msg.reply(`❌ Could not find data for \`${ticker}\`.`);

  const info = `📌 **${data.name} (${ticker})**
• Price – $${data.price}
• Open – $${data.open}
• High/Low – $${data.high} / $${data.low}
• Volume – ${data.volume}
• Change – ${data.change} (${data.percent_change}%)`;

  const aiPrompt = `Should I buy/sell/hold ${ticker}? Price: ${data.price}, Change: ${data.change}, Percent: ${data.percent_change}`;

  try {
    const ai = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [
        { role: "user", content: aiPrompt }
      ],
      max_tokens: 60
    });
    await msg.channel.send(`${info}\n\n🤖 **AI Suggestion:** ${ai.data.choices[0].message.content}`);
  } catch (err) {
    await msg.channel.send(`${info}\n\n⚠️ AI Suggestion unavailable.`);
  }
});

// Bot start
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  fetchStockUpdates();
  setInterval(fetchStockUpdates, 5 * 60 * 1000); // Every 5 mins
});

client.login(DISCORD_TOKEN);

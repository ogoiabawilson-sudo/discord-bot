const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SELLAUTH_API_KEY = process.env.SELLAUTH_API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TARGET_PRODUCT_ID = 716794;
const SHOP_ID = '237519';
const MESSAGE_ID_FILE = path.join(__dirname, 'message_id.txt');

function loadMessageId() {
    try {
        if (fs.existsSync(MESSAGE_ID_FILE)) {
            const id = fs.readFileSync(MESSAGE_ID_FILE, 'utf8').trim();
            if (id) return id;
        }
    } catch (e) {}
    return null;
}

function saveMessageId(id) {
    fs.writeFileSync(MESSAGE_ID_FILE, id, 'utf8');
}

let lastDiscordMessageId = loadMessageId();

async function checkStock() {
    console.log(`[${new Date().toLocaleTimeString()}] -> Starting stock check...`);

    try {
        const res = await axios.get(`https://api.sellauth.com/v1/shops/${SHOP_ID}/products`, {
            headers: { 'Authorization': `Bearer ${SELLAUTH_API_KEY}` }
        });

        const productsList = res.data.data || res.data;
        const match = productsList.find(p => p.id === TARGET_PRODUCT_ID);

        if (match) {
            const stock = match.stock_count ?? match.stock ?? 0;
            console.log(`[${new Date().toLocaleTimeString()}] Success! Product: ${match.name} | Stock: ${stock}`);
            await sendToDiscord(match.name, stock);
        } else {
            console.error(`Product ${TARGET_PRODUCT_ID} not found in API response.`);
        }

    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Failure:`, error.response?.data || error.message);
    }
}

async function sendToDiscord(name, stock) {
    const unixTimestamp = Math.floor(Date.now() / 1000);

    const embed = {
        embeds: [{
            title: `Live stock monitor 🔷 liquidflow.mysellauth.com`,
            color: 5814783,
            description: `**__CS2__**\n✅ **Premier Ready** — \`${stock}\`\n\n*Last updated • <t:${unixTimestamp}:R>*`
        }]
    };

    try {
        if (!lastDiscordMessageId) {
            console.log('No ID defined. Creating new message...');
            const response = await axios.post(`${DISCORD_WEBHOOK_URL}?wait=true`, embed);
            lastDiscordMessageId = response.data.id;
            saveMessageId(lastDiscordMessageId);
            console.log(`NEW MESSAGE CREATED! ID saved: ${lastDiscordMessageId}`);
        } else {
            console.log(`Editing message ID: ${lastDiscordMessageId}`);
            await axios.patch(`${DISCORD_WEBHOOK_URL}/messages/${lastDiscordMessageId}`, embed);
            console.log('Discord message updated successfully.');
        }
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('Message not found (404). Resetting and creating new one...');
            lastDiscordMessageId = null;
            try { fs.unlinkSync(MESSAGE_ID_FILE); } catch (e) {}
            try {
                const response = await axios.post(`${DISCORD_WEBHOOK_URL}?wait=true`, embed);
                lastDiscordMessageId = response.data.id;
                saveMessageId(lastDiscordMessageId);
                console.log(`New message created. ID: ${lastDiscordMessageId}`);
            } catch (e) {
                console.error('Error creating message:', e.response?.data || e.message);
            }
        } else {
            console.error('Discord error:', error.response?.data || error.message);
        }
    }
}

async function startInfiniteLoop() {
    const FIVE_MINUTES = 5 * 60 * 1000;
    const START_TIME = Date.now();
    const MAX_DURATION = 5.2 * 60 * 60 * 1000;

    while (Date.now() - START_TIME < MAX_DURATION) {
        await checkStock();
        console.log(`Waiting 5 minutes for next cycle...\n-----------------------------`);
        await new Promise(resolve => setTimeout(resolve, FIVE_MINUTES));
    }
    console.log("Full shift completed. Awaiting GitHub Actions machine rotation.");
}

startInfiniteLoop();

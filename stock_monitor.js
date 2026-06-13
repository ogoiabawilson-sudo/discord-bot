const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Configurações fixas
const SELLAUTH_API_KEY = '5846245|Io0BdrdiTBsJg5LpD8tiZbZ9yYBmVp3GOFRx0YiSf7ab0518';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1507995961287249974/fu6ATVpvFgRh8vCDD3XYJkSziPDSjD41ArNLBDgO8LjPFZg4idgO5hZJJEnc88EwSku7';
const TARGET_PRODUCT_ID = 716794;
const SHOP_ID = '237519';
const MESSAGE_ID_FILE = path.join(__dirname, 'message_id.txt');

function loadMessageId() {
    try {
        if (fs.existsSync(MESSAGE_ID_FILE)) {
            return fs.readFileSync(MESSAGE_ID_FILE, 'utf8').trim();
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
    let browser;
    
    try {
        browser = await puppeteer.launch({ 
            headless: true, 
            executablePath: '/usr/bin/google-chrome-stable', 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        
        // Timeout de segurança contra congelamento de página
        page.setDefaultNavigationTimeout(30000); 
        page.setDefaultTimeout(30000);

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Authorization': `Bearer ${SELLAUTH_API_KEY}`,
            'Content-Type': 'application/json'
        });

        await page.goto(`https://api.sellauth.com/v1/shops/${SHOP_ID}/products`, {
            waitUntil: 'networkidle2'
        });

        // Aguarda a descriptografia da API
        await new Promise(resolve => setTimeout(resolve, 5000));
        const content = await page.evaluate(() => document.querySelector('body').innerText);
        
        if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
            const responseData = JSON.parse(content);
            const productsList = responseData.data || responseData;

            if (Array.isArray(productsList)) {
                const matchedProduct = productsList.find(p => p.id === TARGET_PRODUCT_ID);

                if (matchedProduct) {
                    const currentStock = matchedProduct.stock_count !== undefined ? matchedProduct.stock_count : (matchedProduct.stock || 0); 
                    const productName = matchedProduct.name || 'Unknown Product';
                    console.log(`[${new Date().toLocaleTimeString()}] Success! Product: ${productName} | Stock: ${currentStock}`);
                    
                    await sendToDiscord(productName, currentStock);
                }
            }
        } else {
            console.error(`[${new Date().toLocaleTimeString()}] Invalid response received from API.`);
        }

    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Failure in current cycle:`, error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function sendToDiscord(name, stock) {
    // Transforma o horário atual em segundos Unix para o timestamp relativo do Discord
    const unixTimestamp = Math.floor(Date.now() / 1000);

    const embed = {
        embeds: [{
            title: `Live stock monitor 🔷 liquidflow.mysellauth.com`,
            color: 5814783,
            // Formato limpo usando a marcação exata do seu modelo de exemplo
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
            console.log(`[${new Date().toLocaleTimeString()}] Editing message ID: ${lastDiscordMessageId}`);
            await axios.patch(`${DISCORD_WEBHOOK_URL}/messages/${lastDiscordMessageId}`, embed);
            console.log('Discord message updated successfully.');
        }
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('Message not found (404). Creating new one...');
            lastDiscordMessageId = null;
            try {
                const response = await axios.post(`${DISCORD_WEBHOOK_URL}?wait=true`, embed);
                lastDiscordMessageId = response.data.id;
                saveMessageId(lastDiscordMessageId);
                console.log(`New message created and ID saved: ${lastDiscordMessageId}`);
            } catch (postError) {
                console.error('Error creating message:', postError.message);
            }
        } else {
            console.error('Error sending request to Discord:', error.message);
        }
    }
}

async function startInfiniteLoop() {
    const FIVE_MINUTES = 5 * 60 * 1000;
    const START_TIME = Date.now();
    const MAX_DURATION = 5.2 * 60 * 60 * 1000; // Finaliza em 5 horas e 12 minutos de forma limpa

    while (Date.now() - START_TIME < MAX_DURATION) {
        await checkStock();
        console.log(`Waiting 5 minutes for next cycle...\n-----------------------------`);
        await new Promise(resolve => setTimeout(resolve, FIVE_MINUTES));
    }
    console.log("Full shift completed. Awaiting GitHub Actions machine rotation.");
}

startInfiniteLoop();

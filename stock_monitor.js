const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// Configurações fixas
const SELLAUTH_API_KEY = '5790468|c3Kv1kCC2CsBCKGeMAkyOkLzI0uvyxN6RhEFm5y46c3dd7c9';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1507995961287249974/fu6ATVpvFgRh8vCDD3XYJkSziPDSjD41ArNLBDgO8LjPFZg4idgO5hZJJEnc88EwSku7';
const TARGET_PRODUCT_ID = 716794; 
const SHOP_ID = '237519'; 
const CUSTOM_MESSAGE = 'units available';

// 🔴 SE VOCÊ JÁ TIVER UM ID DE MENSAGEM FIXO, COLOQUE ELE ENTRE AS ASPAS ABAIXO:
// Exemplo: let lastDiscordMessageId = '1508010138617774102';
let lastDiscordMessageId = null;

async function checkStock() {
    console.log(`Starting stock check at ${new Date().toLocaleTimeString()}`);
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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Authorization': `Bearer ${SELLAUTH_API_KEY}`,
            'Content-Type': 'application/json'
        });

        console.log('Navigating to SellAuth API...');
        await page.goto(`https://api.sellauth.com/v1/shops/${SHOP_ID}/products`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        await new Promise(resolve => setTimeout(resolve, 5000));
        const content = await page.evaluate(() => document.querySelector('body').innerText);
        
        console.log('Raw content snippet received:', content.substring(0, 200));

        if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
            const responseData = JSON.parse(content);
            const productsList = responseData.data || responseData;

            if (Array.isArray(productsList)) {
                const matchedProduct = productsList.find(p => p.id === TARGET_PRODUCT_ID);

                if (matchedProduct) {
                    const currentStock = matchedProduct.stock_count !== undefined ? matchedProduct.stock_count : (matchedProduct.stock || 0); 
                    const productName = matchedProduct.name || 'Unknown Product';
                    console.log(`Found Product: ${productName} | Stock: ${currentStock}`);
                    
                    await sendToDiscord(productName, currentStock);
                } else {
                    console.log(`Product ID ${TARGET_PRODUCT_ID} not found in the product list.`);
                }
            } else {
                console.log('Data structure is not an array.');
            }
        } else {
            console.error('Bypass failed or API returned HTML. Content started with:', content.substring(0, 50));
        }

    } catch (error) {
        console.error('An error occurred during verification:', error.message);
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
    }
}

async function sendToDiscord(name, stock) {
    const embed = {
        embeds: [{
            title: `🔄 Live Stock Monitor`,
            color: 5814783,
            fields: [
                { name: "📦 Product", value: `**${name}**`, inline: true },
                { name: "🔢 Current Stock", value: `\`${stock}\` ${CUSTOM_MESSAGE}`, inline: true }
            ],
            footer: { text: `Last updated: ${new Date().toLocaleTimeString()}` },
            timestamp: new Date()
        }]
    };

    try {
        if (!lastDiscordMessageId) {
            console.log('No message ID configured. Creating a new post on Discord...');
            const response = await axios.post(`${DISCORD_WEBHOOK_URL}?wait=true`, embed);
            console.log(`Message created! To prevent future spam, COPY this ID and put it into your script: ${response.data.id}`);
        } else {
            console.log(`Editing existing message ID: ${lastDiscordMessageId}`);
            await axios.patch(`${DISCORD_WEBHOOK_URL}/messages/${lastDiscordMessageId}`, embed);
            console.log('Discord post updated successfully.');
        }
    } catch (error) {
        console.error('Error sending data to Discord:', error.message);
    }
}

checkStock();

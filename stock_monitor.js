const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// Configurações fixas do seu produto e credenciais
const SELLAUTH_API_KEY = '5790468|c3Kv1kCC2CsBCKGeMAkyOkLzI0uvyxN6RhEFm5y46c3dd7c9';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1507995961287249974/fu6ATVpvFgRh8vCDD3XYJkSziPDSjD41ArNLBDgO8LjPFZg4idgO5hZJJEnc88EwSku7';
const TARGET_PRODUCT_ID = 716794; 
const SHOP_ID = '237519'; 
const CUSTOM_MESSAGE = 'units available';

// Controladores de estado do bot
let lastDiscordMessageId = null;

async function checkStock() {
    console.log(`[${new Date().toLocaleTimeString()}] Starting stock check...`);
    let browser;
    
    try {
        // Inicialização configurada para rodar silenciosamente em servidores Linux/Nuvem
        browser = await puppeteer.launch({ 
            headless: true, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        
        const page = await browser.newPage();
        
        // Simula um navegador comum para evitar bloqueios de segurança
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Authorization': `Bearer ${SELLAUTH_API_KEY}`,
            'Content-Type': 'application/json'
        });

        // Acessa os dados diretamente pela API do seu painel
        await page.goto(`https://api.sellauth.com/v1/shops/${SHOP_ID}/products`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Aguarda 5 segundos para a resposta processar completamente
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
                    
                    await sendToDiscord(productName, currentStock);
                } else {
                    console.log(`Product ID ${TARGET_PRODUCT_ID} not found in stock response.`);
                }
            }
        } else {
            console.error('Failed to bypass challenge or cloudflare structure changed.');
        }

    } catch (error) {
        console.error('An error occurred during verification:', error.message);
    } finally {
        if (browser) {
            await browser.close();
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
            // Cria a mensagem inicial no canal
            const response = await axios.post(`${DISCORD_WEBHOOK_URL}?wait=true`, embed);
            lastDiscordMessageId = response.data.id;
            console.log(`Initial monitoring post created (ID: ${lastDiscordMessageId}).`);
        } else {
            // Edita continuamente o mesmo post a cada 5 minutos
            await axios.patch(`${DISCORD_WEBHOOK_URL}/messages/${lastDiscordMessageId}`, embed);
            console.log(`Discord status post successfully updated.`);
        }
    } catch (error) {
        console.error('Error contacting Discord webhook:', error.message);
        // Se a mensagem original for apagada no Discord, limpa o ID para recriá-la no próximo ciclo
        if (error.response && error.response.status === 404) {
            lastDiscordMessageId = null;
        }
    }
}

// Execução imediata ao ligar
checkStock();

// Configurado para rodar a cada 5 minutos (5 * 60 * 1000 milissegundos)
const FIVE_MINUTES = 5 * 60 * 1000;
setInterval(checkStock, FIVE_MINUTES);

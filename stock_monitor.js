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

// ID da sua mensagem do Discord
let lastDiscordMessageId = '1508011150346944612';

async function checkStock() {
    console.log(`[${new Date().toLocaleTimeString()}] -> Iniciando checagem de estoque...`);
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
        
        // Timeout de segurança: Se travar no carregamento por mais de 30 segundos, cancela e joga pro erro
        page.setDefaultNavigationTimeout(30000); 
        page.setDefaultTimeout(30000);

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        await page.setExtraHTTPHeaders({
            'Authorization': `Bearer ${SELLAUTH_API_KEY}`,
            'Content-Type': 'application/json'
        });

        console.log(`[${new Date().toLocaleTimeString()}] Acessando API do SellAuth...`);
        await page.goto(`https://api.sellauth.com/v1/shops/${SHOP_ID}/products`, {
            waitUntil: 'networkidle2'
        });

        // Aguarda 5 segundos para garantir a descriptografia do Cloudflare
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
                    console.log(`[${new Date().toLocaleTimeString()}] Sucesso! Produto: ${productName} | Estoque: ${currentStock}`);
                    
                    await sendToDiscord(productName, currentStock);
                } else {
                    console.log(`[${new Date().toLocaleTimeString()}] Produto ID ${TARGET_PRODUCT_ID} não foi encontrado na lista.`);
                }
            }
        } else {
            console.error(`[${new Date().toLocaleTimeString()}] Erro: Resposta da API não é um JSON válido.`);
        }

    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Falha no ciclo atual (Timeout/Erro):`, error.message);
    } finally {
        if (browser) {
            await browser.close();
            console.log(`[${new Date().toLocaleTimeString()}] Navegador fechado.`);
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
            console.log('Criando nova mensagem no Discord...');
            const response = await axios.post(`${DISCORD_WEBHOOK_URL}?wait=true`, embed);
            lastDiscordMessageId = response.data.id;
            console.log(`Nova mensagem criada com ID: ${lastDiscordMessageId}`);
        } else {
            console.log(`Editando mensagem existente ID: ${lastDiscordMessageId}`);
            await axios.patch(`${DISCORD_WEBHOOK_URL}/messages/${lastDiscordMessageId}`, embed);
            console.log('Mensagem no Discord atualizada com sucesso.');
        }
    } catch (error) {
        console.error('Erro ao enviar para o Discord:', error.message);
        if (error.response && error.response.status === 404) {
            console.log('ID antigo inválido (404). Resetando para criar nova mensagem no próximo ciclo.');
            lastDiscordMessageId = null;
        }
    }
}

async function startInfiniteLoop() {
    const FIVE_MINUTES = 5 * 60 * 1000;
    const START_TIME = Date.now();
    const MAX_DURATION = 5.5 * 60 * 60 * 1000; 

    while (Date.now() - START_TIME < MAX_DURATION) {
        await checkStock();
        console.log(`Aguardando 5 minutos para o próximo ciclo...\n-----------------------------`);
        await new Promise(resolve => setTimeout(resolve, FIVE_MINUTES));
    }
    
    console.log("Limite de tempo da máquina atingido. Encerrando para rotação.");
}

startInfiniteLoop();

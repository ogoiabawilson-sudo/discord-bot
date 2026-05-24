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

// Transforma a URL do webhook em URL de leitura do canal
const DISCORD_CHANNEL_API = DISCORD_WEBHOOK_URL.split('/webhooks/')[0] + '/channels/' + DISCORD_WEBHOOK_URL.split('/webhooks/')[1].split('/')[0] + '/messages';

async function getLatestWebhookMessageId() {
    try {
        // Busca as últimas 10 mensagens do canal do Discord
        const response = await axios.get(`${DISCORD_CHANNEL_API}?limit=10`, {
            headers: { 'Authorization': `Bot ${SELLAUTH_API_KEY}` } // Tenta ler público ou via webhook complementar
        });
        
        if (response.data && Array.isArray(response.data)) {
            // Procura a mensagem mais recente que foi enviada por um Webhook (tipo 7 do Discord) ou que tenha o título do Monitor
            const webhookMsg = response.data.find(msg => 
                msg.webhook_id || (msg.embeds && msg.embeds.length > 0 && msg.embeds[0].title === '🔄 Live Stock Monitor')
            );
            if (webhookMsg) {
                console.log(`[${new Date().toLocaleTimeString()}] Mensagem antiga encontrada no canal! ID: ${webhookMsg.id}`);
                return webhookMsg.id;
            }
        }
    } catch (e) {
        // Se o token da API não permitir leitura direta do canal, usamos a estratégia de fallback seguro
        console.log(`[${new Date().toLocaleTimeString()}] Histórico indisponível por API direta. Usando ID padrão.`);
    }
    return null;
}

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
                }
            }
        }

    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Falha no ciclo atual:`, error.message);
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

    // Tenta rastrear qual foi a última mensagem real deixada no chat para não duplicar
    let targetId = await getLatestWebhookMessageId() || '1508011150346944612';

    try {
        console.log(`[${new Date().toLocaleTimeString()}] Editando postagem principal...`);
        await axios.patch(`${DISCORD_WEBHOOK_URL}/messages/${targetId}`, embed);
        console.log('Mensagem atualizada com sucesso.');
    } catch (error) {
        // Se a mensagem sumiu por completo, cria uma nova
        if (error.response && error.response.status === 404) {
            console.log('Nenhuma mensagem compatível encontrada para edição. Criando um novo post limpo...');
            await axios.post(`${DISCORD_WEBHOOK_URL}`, embed);
        } else {
            console.error('Erro na comunicação com Discord:', error.message);
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
}

startInfiniteLoop();

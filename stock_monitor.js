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

// 🛑 SEU ID FIXO E ESTÁVEL DO DISCORD (Coloque entre aspas simples para não corromper)
let lastDiscordMessageId = '1508134899020988546';

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
                    console.log(`[${new Date().toLocaleTimeString()}] Sucesso! Produto: ${productName} | Estoque: ${currentStock}`);
                    
                    await sendToDiscord(productName, currentStock);
                }
            }
        } else {
            console.error(`[${new Date().toLocaleTimeString()}] Resposta inválida obtida da API.`);
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
    // Transforma o horário atual em segundos Unix para o Discord tratar o fuso automaticamente
    const unixTimestamp = Math.floor(Date.now() / 1000);

    const embed = {
        embeds: [{
            title: `🔄 Live Stock Monitor`,
            color: 5814783,
            description: `🕒 **Última atualização:** <t:${unixTimestamp}:R> (<t:${unixTimestamp}:f>)`,
            fields: [
                { name: "📦 Produto", value: `**${name}**`, inline: true },
                { name: "🔢 Estoque Atual", value: `\`${stock}\` ${CUSTOM_MESSAGE}`, inline: true }
            ],
            footer: { text: `Monitoramento Automático Ativo` }
        }]
    };

    try {
        if (!lastDiscordMessageId) {
            console.log('Nenhum ID definido. Criando nova mensagem...');
            const response = await axios.post(`${DISCORD_WEBHOOK_URL}?wait=true`, embed);
            lastDiscordMessageId = response.data.id;
            console.log(`NOVA MENSAGEM CRIADA! ID gerado: ${lastDiscordMessageId}`);
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] Editando a mensagem ID: ${lastDiscordMessageId}`);
            await axios.patch(`${DISCORD_WEBHOOK_URL}/messages/${lastDiscordMessageId}`, embed);
            console.log('Mensagem atualizada com sucesso.');
        }
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('O ID configurado falhou (404). Gerando nova postagem de segurança...');
            try {
                const response = await axios.post(`${DISCORD_WEBHOOK_URL}?wait=true`, embed);
                lastDiscordMessageId = response.data.id;
                console.log(`ATENÇÃO: Novo ID gerado automaticamente. Atualize a linha 14 com: ${lastDiscordMessageId}`);
            } catch (postError) {
                console.error('Erro ao recuperar mensagem:', postError.message);
            }
        } else {
            console.error('Erro na requisição para o Discord:', error.message);
        }
    }
}

async function startInfiniteLoop() {
    const FIVE_MINUTES = 5 * 60 * 1000;
    const START_TIME = Date.now();
    const MAX_DURATION = 5.2 * 60 * 60 * 1000; // Finaliza em 5 horas e 12 minutos de forma limpa

    while (Date.now() - START_TIME < MAX_DURATION) {
        await checkStock();
        console.log(`Aguardando 5 minutos para o próximo ciclo...\n-----------------------------`);
        await new Promise(resolve => setTimeout(resolve, FIVE_MINUTES));
    }
    console.log("Turno completo concluído. Aguardando a rotação de máquinas do GitHub Actions.");
}

startInfiniteLoop();

const https = require('https');
const { parse } = require('node-html-parser');
const TelegramBot = require('node-telegram-bot-api');
const Agent = require('socks5-https-client/lib/Agent');
const processDotEnv = require('dotenv').config();

// #todo если цена упала до минимума, минимум уменьшается на subtractionStepFromMin
// #todo подключить базу для сохраниения айдишек пользователей
// #todo после сохранения айдишек пользователей можно будет
// организовать exchangeMin, realMin, priceCheckRetryTime, subtractionStepFromMin для
// каждого свои.

const token = processDotEnv.parsed.botToken;

const bot = new TelegramBot(token, {
    polling: true,
    request: {
        agentClass: Agent,
		agentOptions: {
			socksHost: processDotEnv.parsed.proxySocks5Host,
			socksPort: processDotEnv.parsed.proxyPort,
			socksUsername: processDotEnv.parsed.proxyUsername,
			socksPassword: processDotEnv.parsed.proxyPassword,
		}
    },
});

// preferences
const preferences = {
    exchangeMin: 300000,
    realMin: 280000,
    priceCheckRetryTime: 5000,
    subtractionStepFromMin: 30000,
};

const users = new Set();

// http reqs
const exchangeCoinUrl = 'https://localbitcoins.net/';
const exchangeCoin = httpsRequest(exchangeCoinUrl)
    .then(getStockPriceForBuying)
    .catch((e) => console.log('e: ', e));

const realCoinRateUrl = 'https://blockchain.info/ru/ticker';
const realCoinRate = httpsRequest(realCoinRateUrl)
    .then(getRealStockPrice)
    .catch((e) => console.log('e: ', e));

function getRealRate () {
    return Promise.resolve(realCoinRate).then((realRate) => {
        return realRate;
    });
};

function getExchangeRate () {
    return Promise.resolve(exchangeCoin).then((realRate) => {
        return realRate;
    });
};

function getRealAndExchangeRate () {
    return Promise.all([exchangeCoin, realCoinRate]).then(([exchangeCoinRate, realCoinRate]) => {
        return { exchangeCoinRate, realCoinRate };
    });
};

// http reqs promise wrapper
function httpsRequest (params, postData) {
    return new Promise((resolve, reject) => {
        httpsRequestCallback({resolve, reject}, {params, postData});
    });
};

function httpsRequestCallback ({resolve, reject}, {params, postData}) {
    const req = https.request(params, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error('statusCode=' + res.statusCode));
        }

        let body = [];
        res.on('data', (chunk) => {
            body.push(chunk);
        });

        res.on('end', () => {
            try {
                body = Buffer.concat(body).toString();
            } catch(e) {
                reject(e);
            }
            resolve(body);
        });
    });

    req.on('error', (e) => {
        reject(e);
    });

    if (postData) {
        req.write(postData);
    }

    req.end();
};

// general logic
setInterval(
    getAlertIfPriceHasFallen,
    preferences.priceCheckRetryTime,
);

async function getAlertIfPriceHasFallen () {
    const { exchangeCoinRate, realCoinRate } = await getRealAndExchangeRate();

    users.forEach((userId) => {
        if (exchangeCoinRate < preferences.exchangeMin) {
            bot.sendMessage(userId,
                rateView('Срочно! Цена в обменнике упала до: ', exchangeCoinRate)
            );
        }
        if (realCoinRate < preferences.realMin) {
            bot.sendMessage(userId,
                rateView('Срочно! Курс монеты упал до: ', realCoinRate)
            );
        }
    })
};

// exchange logic
function getStockPriceForBuying (htmlStr) {
    const stockPricesForBuying = getStockPricesFromHTML(htmlStr, '#purchase-bitcoins-online .column-price');
    const minimalStockPriceForBuying = getMinimalStockPriceForBuying(stockPricesForBuying);

    return parseInt(minimalStockPriceForBuying);
};

function getMinimalStockPriceForBuying (prices) {
    return prices[1];
};

function getStockPricesFromHTML (htmlStr, selector) {
    const stockPricesDOM = parse(htmlStr)
        .querySelectorAll(selector);

    const stockPricesValue = stockPricesDOM.map((priceDOM) => {
        return formatStockPrice(priceDOM.removeWhitespace().text);
    });

    return stockPricesValue;
};

function formatStockPrice (string) {
    const splittedPrice = string.split(/\.|\,/);
    const joinedCorrectPrice = splittedPrice.reduce((acc, path, index, arr) => {
        if (index === arr.length - 1) return acc;

        return acc.concat(path);
    }, '');

    return joinedCorrectPrice;
};

// real rate logic
function getRealStockPrice (jsonStr) {
    const parsedJsonWithPrices = JSON.parse(jsonStr);
    const targetCountryPrice = getPriceByCountry(parsedJsonWithPrices, 'RUB');

    return parseInt(targetCountryPrice);
};

function getPriceByCountry (jsonWithPrices, targetCountry) {
    return jsonWithPrices[targetCountry].last;
};

// routing
bot.onText(/\/start|\/help/, async (msg) => {
    // console.log('msg', msg.from.id);
    const startData = [
        {
            name: '/rate',
            description: 'Узнать цену биткоина на бирже и в обменниках',
        },
        {
            name: '/exchangerate',
            description: 'Узнать цену биткоина в обменниках',
        },
        {
            name: '/realrate',
            description: 'Узнать цену биткоина на бирже',
        },
    ];
    const chatId = msg.chat.id;
    users.add(msg.from.id);

    bot.sendMessage(chatId,
        startView(startData)
    );
});

bot.onText(/\/rate/, async (msg) => {
    const { exchangeCoinRate, realCoinRate } = await getRealAndExchangeRate();
    const chatId = msg.chat.id;
    users.add(msg.from.id);

    bot.sendMessage(chatId,
        rateView('Курс биткоина на бирже: ', realCoinRate)
            .concat('\n', rateView('Курс биткоина в обменниках: ', exchangeCoinRate)
        )
    );
});

bot.onText(/\/realrate/, async (msg) => {
    const realCoinRate = await getRealRate();
    const chatId = msg.chat.id;
    users.add(msg.from.id);
    
    bot.sendMessage(chatId,
        rateView('Курс биткоина на бирже: ', realCoinRate)
    );
});

bot.onText(/\/exchangerate/, async (msg) => {
    const exchangeCoinRate = await getExchangeRate();
    const chatId = msg.chat.id;
    users.add(msg.from.id);

    bot.sendMessage(chatId,
        rateView('Курс биткоина в обменниках: ', exchangeCoinRate)
    );
});

// views
function startView (data) {
    const descriptionText = `
Доброго дня!
    
Этот бот позволяет моментально узнавать о скачках
курса биткоина на бирже и в обменниках.
А также самостоятельно уведомляет, когда
биткоин активно растет или падает.
    
Бот может:
`

    return descriptionText.concat(
        data.map((el) => {
            return el.name.concat(' - ', el.description);
        }).join('\n')
    )
};

function rateView (text, coinNumber) {
    return text.concat(
        beautyCoinNumberView(coinNumber),
        '₽',
    );
};

function beautyCoinNumberView (coinNumber) {
    return coinNumber.toString().replace(/(\d)(?=(\d\d\d)+([^\d]|$))/g, '$1 ');
};

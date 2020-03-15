const https = require('https');
const { parse } = require('node-html-parser');

// #todo если цена упала до минимума, минимум уменьшается на subtractionStepFromMin
// #todo рассылка нотификаций через бота в телеграмм

// preferences
const preferences = {
    exchangeMin: 300000,
    realMin: 280000,
    priceCheckRetryTime: 5000,
    subtractionStepFromMin: 30000,
}

// http reqs
const exchangeCoinUrl = 'https://localbitcoins.net/';
const exchangeCoin = httpsRequest(exchangeCoinUrl)
    .then(getStockPriceForBuying)
    .catch((e) => console.log('e: ', e));

const realCoinRateUrl = 'https://blockchain.info/ru/ticker';
const realCoinRate = httpsRequest(realCoinRateUrl)
    .then(getRealStockPrice)
    .catch((e) => console.log('e: ', e))

setInterval(
    getAlertIfPriceHasFallen,
    preferences.priceCheckRetryTime,
)

function getAlertIfPriceHasFallen () {
    Promise.all([exchangeCoin, realCoinRate]).then(([exchangeRate, realRate]) => {
        if (exchangeRate < preferences.exchangeMin) {
            console.log('Цена в обменнике упала до: ', exchangeRate);
        };
        if (realRate < preferences.realMin) {
            console.log('Курс монеты упал до: ', realRate);
        };
    });
}

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
}

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

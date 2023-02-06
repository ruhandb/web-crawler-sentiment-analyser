const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const puppeteer = require('puppeteer');
const { SentimentAnalyzer, PorterStemmerPt, AggressiveTokenizerPt, BayesClassifier, JaroWinklerDistance } = require('natural')
const PORT = 8000;

const app = express();

const analyzer = new SentimentAnalyzer("Portuguese", PorterStemmerPt, "afinn");
const tokenizer = new AggressiveTokenizerPt();
const articlesBase = [];

const classifier = new BayesClassifier(PorterStemmerPt);
{

    classifier.addDocument('Bolsonaro', 'Bolsonaro');
    classifier.addDocument('Jair Messias Bolsonaro', 'Bolsonaro');
    classifier.addDocument('Bolsonarista', 'Bolsonaro');
    classifier.addDocument('Bolsonarismo', 'Bolsonaro');
    classifier.addDocument('Presidente', 'Bolsonaro');
    classifier.addDocument('Atual Presidente', 'Bolsonaro');
    classifier.addDocument('Lula', 'Lula');
    classifier.addDocument('Luiz Inácio Lula da Silva', 'Lula');
    classifier.addDocument('Lulista', 'Lula');
    classifier.addDocument('Lulismo', 'Lula');
    classifier.addDocument('Petista', 'Lula');
    classifier.addDocument('Presidente Lula', 'Lula');

    classifier.train();
}

/* axios(url).then(response => {
    const html = response.data;
    const $ = cheerio.load(html);
    const articles = [];
    $('.feed-post-link', html).each(function () {
        let title = $(this).text();
        let tokenTitle = tokenizer.tokenize(title);
        articles.push({
            title: title,
            //url: $(this).attr('href'),
            //tokens: tokenTitle,
            sentment: analyzer.getSentiment(tokenTitle)
        })
    })

    console.log(articles);
}).catch(err => console.log(err)); */

app.listen(PORT, () => console.log(`Server runing on port: ${PORT}`));

app.get("/", (req, res) => {
    res.send(articlesBase);
})

const portals = [
    {
        name: "G1",
        url: "https://g1.globo.com/",
        waitSelector: ".bstn-hl-link",
        selectors: [
            "span.bstn-hl-title",
            "a.feed-post-link"
        ]
    },
    {
        name: "R7",
        url: "https://www.r7.com/",
        waitSelector: ".r7-flex-title-h5__link",
        selectors: [
            "a.r7-flex-title-h1__link",
            "a.r7-flex-title-h5__link",
            "a.r7-flex-title-h4__link"
        ]
    },
    {
        name: "Folha de S.Paulo",
        url: "https://www.folha.uol.com.br/",
        waitSelector: ".c-main-headline__title",
        selectors: [
            "h2.c-main-headline__title",
            "h2.c-headline__title",
            "span.c-list-links__title"
        ]
    },
    /* {
        name: "Estadão",
        url: "https://www.estadao.com.br/",
        waitSelector: ".intro",
        selectors: [
            "div.intro > h3.title > a",
            "div.intro > a > h3.title",
        ]
    }, */
    {
        name: "CNN Brasil",
        url: "https://www.cnnbrasil.com.br/",
        waitSelector: ".headline__primary_title",
        selectors: [
            "h2.headline__primary_title",
            "h3.headline__secundary_title",
            "h3.articles__title"
        ]
    }
];


let processPortals = async () => {
    let articles = [];
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    for (let index = 0; index < portals.length; index++) {
        const portal = portals[index];
        console.log("Accessing: ", portal.name);
        await page.goto(portal.url);
        await page.waitForSelector(portal.waitSelector);

        for (let index = 0; index < portal.selectors.length; index++) {
            const selector = portal.selectors[index];
            let texts = await page.$$eval(selector, links => {
                return links.map(el => el.textContent);
            });
            console.log(`Found ${texts.length} occurrences on ${selector}`);

            texts.filter(t => t.trim() !== '').map(t => ({ text: t.trim(), portal: portal.name })).forEach(t => {
                articles.push(t);
            });
        }

    }
    await browser.close();

    let result = articles.map(t => {
        let classifications = classifier.getClassifications(t.text);
        let classification = classifications.reduce((cl, nw) => {
            return Math.round(nw.value * 100) > Math.round(cl.value * 100) ? nw :
                (Math.round(nw.value * 100) < Math.round(cl.value * 100) ? cl : { label: 'None', value: 0 });
        }, { label: 'None', value: 0 });

        return {
            portal: t.portal,
            title: t.text.trim(),
            fell: analyzer.getSentiment(tokenizer.tokenize(t.text)),
            class: classification.label,
            value: classification.value,
            date: new Date()
        };
    }).filter(r => r.value);

    result.forEach(a => {
        const article = articlesBase.find(ab => {
            const distance = JaroWinklerDistance(ab.title, a.title)

            return distance > 0.9;
        })
        if (!article) {
            console.log("NEW >> ", a.title);
            articlesBase.push(a);
        }
    })

    console.log("TOTAL: ", articlesBase.length);

};
processPortals();
setInterval(processPortals, 60000 * 10);



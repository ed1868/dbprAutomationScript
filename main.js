const { Builder, By, until } = require('selenium-webdriver');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const Bottleneck = require('bottleneck'); // Rate limiting
const chalk = require('chalk');
const cheerio = require('cheerio'); // For web scraping emails
require('dotenv').config();

console.log(chalk.blueBright.bold('🔍 Flashy Log Initialized!'));

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const OUTPUT_CSV_PATH = path.join(os.homedir(), "Desktop", "business_data.csv");

const counties = ["11"];
let allResults = [];

// Rate limiter for Google API
const limiter = new Bottleneck({
    minTime: 650,
    maxConcurrent: 1
});

/**
 * Validate if the given name is a business name (not garbage data)
 */
function isValidBusinessName(name) {
    if (!name || name.length < 3) return false;
    const blacklist = ["license location address", "online services", "name", "license type"];
    return !blacklist.some((word) => name.toLowerCase().includes(word));
}

/**
 * Fetch business details using Google Places API
 */
async function getBusinessDetails(name, retryCount = 0) {
    if (!isValidBusinessName(name)) {
        console.log(chalk.redBright.bold(`🚫 Skipping invalid search: ${name}`));
        return { phoneNumber: "", email: "", address: "" };
    }

    try {
        console.log(chalk.blueBright.bold(`🔍 Searching Google Places API for: ${name}`));

        // Step 1: Get Place ID using Places Text Search API
        const searchResponse = await limiter.schedule(() =>
            axios.get(`https://maps.googleapis.com/maps/api/place/textsearch/json`, {
                params: { query: name, key: GOOGLE_API_KEY }
            })
        );

        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            console.log(chalk.redBright.bold(`❌ No results found for: ${name}`));
            return { phoneNumber: "", email: "", address: "" };
        }

        const placeId = searchResponse.data.results[0].place_id;

        // Step 2: Fetch business details using Place Details API
        const detailsResponse = await limiter.schedule(() =>
            axios.get(`https://maps.googleapis.com/maps/api/place/details/json`, {
                params: {
                    place_id: placeId,
                    fields: "name,formatted_phone_number,website,formatted_address",
                    key: GOOGLE_API_KEY
                }
            })
        );

        const details = detailsResponse.data.result;
        const phoneNumber = details.formatted_phone_number || "";
        const address = details.formatted_address || "";
        const website = details.website || "";

        // Step 3: Scrape email from website (if available)
        let email = "";
        if (website) {
            email = await getEmailFromWebsite(website);
        }

        console.log(chalk.cyanBright.bold(`📞 Parsed details for ${name}:`));
        console.log(chalk.greenBright(`  📱 Phone: ${phoneNumber || 'N/A'}`));
        console.log(chalk.blueBright(`  📧 Email: ${email || 'N/A'}`));
        console.log(chalk.yellowBright(`  📍 Address: ${address || 'N/A'}`));

        return { phoneNumber, email, address };

    } catch (error) {
        console.error(chalk.redBright.bold(`🚨 Google API Error (${name}): ${error.message}`));

        if (error.message.includes("Quota exceeded") && retryCount < 5) {
            let waitTime = (retryCount + 1) * 3000;
            console.log(chalk.redBright.bold(`🔄 Retrying in ${waitTime / 1000} seconds...`));
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return getBusinessDetails(name, retryCount + 1);
        }

        return { phoneNumber: "", email: "", address: "" };
    }
}

/**
 * Scrape email from website
 */
async function getEmailFromWebsite(website) {
    try {
        console.log(chalk.blueBright(`🌐 Scraping website for email: ${website}`));
        const response = await axios.get(website);
        const $ = cheerio.load(response.data);
        const email = $("a[href^='mailto:']").attr("href")?.replace("mailto:", "") || "";

        if (email) {
            console.log(chalk.greenBright(`📧 Found email: ${email}`));
        } else {
            console.log(chalk.redBright(`❌ No email found on website.`));
        }

        return email;
    } catch (error) {
        console.log(chalk.redBright(`❌ Failed to scrape email from ${website}: ${error.message}`));
        return "";
    }
}

/**
 * 🔍 Start Web Scraping & Extract Business Names
 */
(async function searchByCounty() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        for (let county of counties) {
            console.log(chalk.greenBright.bold(`🚀 Starting search for county ${county}...`));
            await driver.get('https://www.myfloridalicense.com/wl11.asp?mode=0&SID=');

            await driver.wait(until.elementLocated(By.css("input[type='radio'][value='City']")), 10000).click();
            await driver.wait(until.elementLocated(By.css("button[name='SelectSearchType'][value='Search']")), 10000).click();
            await driver.sleep(3000);

            await driver.findElement(By.css("select[name='Board'] option[value='400']")).click();
            await driver.findElement(By.css("select[name='LicenseType'] option[value='4001']")).click();
            await driver.findElement(By.css(`select[name='County'] option[value='${county}']`)).click();
            await driver.findElement(By.css("select[name='RecsPerPage'] option[value='50']")).click();
            await driver.findElement(By.css("button[name='Search1'][value='Search']")).click();

            console.log(chalk.greenBright.bold(`✅ Search initiated for county ${county}, waiting for results...`));

            let table = await driver.wait(
                until.elementLocated(By.xpath("//table[contains(., 'License Type')]")),
                15000
            );

            let rows = await table.findElements(By.xpath(".//tr[td[@colspan='1']]"));

            if (rows.length === 0) {
                console.log(chalk.redBright.bold("⚠️ No valid business names found on the page!"));
                continue;
            }

            console.log(chalk.blueBright.bold(`📊 Extracting data from ${rows.length} rows...`));

            for (let row of rows) {
                let cells = await row.findElements(By.xpath(".//td[@colspan='1']"));

                if (cells.length < 2) continue;

                let getTextSafe = async (cell) => {
                    try {
                        return (await cell.getText()).trim();
                    } catch {
                        return "";
                    }
                };

                let name = await getTextSafe(cells[1]);

                if (isValidBusinessName(name)) {
                    let { phoneNumber, email, address } = await getBusinessDetails(name);
                    allResults.push([name, phoneNumber, email, address]);
                } else {
                    console.log(chalk.redBright.bold(`⏩ Skipping invalid search query: ${name}`));
                }
            }

            console.log(chalk.blueBright.bold(`✅ Successfully scraped ${allResults.length} records for county ${county}`));
            await driver.sleep(2000);
        }

        saveToCSV();

    } catch (err) {
        console.error(chalk.redBright.bold(`❌ Error: ${err.message}`));
    } finally {
        await driver.quit();
    }
})();

/**
 * ✍️ Write Data to CSV File
 */
function saveToCSV() {
    let csvHeaders = "Business Name,Phone Number,Email,Address\n";
    let csvContent = allResults.map(row => row.join(",")).join("\n");

    fs.writeFileSync(OUTPUT_CSV_PATH, csvHeaders + csvContent);
    console.log(chalk.greenBright.bold(`📂 CSV saved at: ${OUTPUT_CSV_PATH}`));
}

# Business Log Scraper

A Node.js script that scrapes business data from a licensing website using Selenium WebDriver, fetches additional details via the Google Places API, and even scrapes for emails on business websites. It’s designed to handle rate limiting, retries on API errors, and outputs all that juicy data to a CSV file right on your Desktop.

## Features

- **Web Scraping:** Uses Selenium to scrape business names by county.
- **Google Places API Integration:** Fetches detailed business info like phone number and address.
- **Email Scraping:** Extracts emails from business websites using Cheerio (with cool exceptions for certain domains).
- **Rate Limiting:** Implements Bottleneck to prevent API quota blowouts.
- **Visual Logging:** Logs everything with style using Chalk.
- **CSV Output:** Consolidates results into a CSV file for easy data handling.

## Prerequisites

- **Node.js:** Version 14 or later is recommended.
- **Chrome Browser:** The script is tailored for Chrome.
- **ChromeDriver:** Must be installed and in your PATH (make sure it’s compatible with your Chrome version).

## Setup

1. **Clone or Download the Repository:**

   ```bash
   git clone [https://github.com/yourusername/flashy-log-scraper.git](https://github.com/ed1868/dbprAutomationScript.git)
   cd dbprAutomationScript

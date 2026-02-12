
import * as cheerio from 'cheerio';


// Helper for Puppeteer (only loaded on server)
async function scrapeWithPuppeteer(url: string, isIndeed: boolean = false): Promise<string> {
    console.log(`[Scraper] Attempting Puppeteer for ${url} (Indeed mode: ${isIndeed})`);

    // Dynamic imports to avoid issues in environments where puppeteer isn't available
    const puppeteer = (await import('puppeteer-extra')).default;
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;

    puppeteer.use(StealthPlugin());

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for dynamic content to settle
        await new Promise(r => setTimeout(r, 2000));

        let content = "";

        if (isIndeed) {
            // --- Indeed-specific extraction with verified selectors ---
            const parts: string[] = [];

            // Job Title (h1 is the primary title element on Indeed)
            const title = await page.$eval('h1', el => el.textContent?.trim()).catch(() => null);
            if (title) parts.push(`JOB TITLE: ${title}`);

            // Company Name (try multiple selectors in priority order)
            const companySelectors = [
                '[data-testid="inlineHeader-companyName"]',
                '[data-testid="jobsearch-JobInfoHeader-companyName"]',
                'a[href*="/cmp/"]',
            ];
            let company: string | null = null;
            for (const sel of companySelectors) {
                company = await page.$eval(sel, el => el.textContent?.trim()).catch(() => null);
                if (company) break;
            }
            if (company) parts.push(`COMPANY: ${company}`);

            // Location (try multiple selectors)
            const locationSelectors = [
                '[data-testid="inlineHeader-companyLocation"]',
                '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
            ];
            let location: string | null = null;
            for (const sel of locationSelectors) {
                location = await page.$eval(sel, el => el.textContent?.trim()).catch(() => null);
                if (location) break;
            }
            if (location) parts.push(`LOCATION: ${location}`);

            // Salary & Job Type (e.g. "Tempo pieno")
            const salaryInfo = await page.$eval(
                '#salaryInfoAndJobType',
                el => el.textContent?.trim()
            ).catch(() => null);
            if (salaryInfo) parts.push(`CONTRACT/SALARY: ${salaryInfo}`);

            // Job details section (contract type, schedule, etc.)
            const jobDetails = await page.$$eval(
                '.jobsearch-JobDescriptionSection-sectionItem',
                els => els.map(el => el.textContent?.trim()).filter(Boolean)
            ).catch(() => []);
            if (jobDetails.length > 0) parts.push(`JOB DETAILS:\n${jobDetails.join('\n')}`);

            // Benefits
            const benefits = await page.$eval(
                '[data-testid="benefits-test"]',
                el => el.textContent?.trim()
            ).catch(() => null);
            if (benefits) parts.push(`BENEFITS: ${benefits}`);

            // Full Job Description
            const description = await page.$eval(
                '#jobDescriptionText',
                el => el.textContent?.trim()
            ).catch(() => null);
            if (description) parts.push(`\nFULL JOB DESCRIPTION:\n${description}`);

            content = parts.join('\n');
            console.log(`[Scraper] Indeed extraction: ${parts.length} sections found, ${content.length} chars`);
        }

        if (!content) {
            // Fallback to full body text if specific selectors fail
            content = await page.$eval('body', el => el.innerText);
        }

        return content.replace(/\s+/g, ' ').trim().substring(0, 50000);

    } catch (e) {
        console.error("Puppeteer scraping failed:", e);
        return "";
    } finally {
        await browser.close();
    }
}

export async function scrapeUrl(url: string): Promise<string> {
    const isIndeed = url.includes("indeed.com");

    // Try Jina AI Reader first (better for SPAs and clean markdown)
    try {
        const jinaUrl = `https://r.jina.ai/${url}`;
        const response = await fetch(jinaUrl);

        if (response.ok) {
            const text = await response.text();

            // Validation: Check if Jina failed to bypass Cloudflare/Bot protection
            const isBlocked = text.includes("Unavailable For Legal Reasons") ||
                text.includes("Just a moment...") ||
                (text.length < 500 && isIndeed); // Indeed pages are usually long. If short, it's likely a captcha page.

            if (!isBlocked && text.length > 100) {
                return text.substring(0, 50000);
            } else {
                console.warn(`[Scraper] Jina blocked or returned incomplete content for ${url}. Triggering fallback.`);
            }
        }
    } catch (error) {
        console.warn(`Jina AI scraping failed for ${url}, falling back to local scraper:`, error);
    }

    // Fallback to Puppeteer for known difficult sites or if Jina failed
    if (isIndeed) {
        try {
            return await scrapeWithPuppeteer(url, true);
        } catch (e) {
            console.error("Puppeteer fallback failed:", e);
        }
    }

    // Fallback to local scraping (cheerio)
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            // If simple fetch fails (403), try Puppeteer as last resort
            if (response.status === 403 || response.status === 401) {
                console.log("[Scraper] Fetch 403/401. Retrying with Puppeteer...");
                return await scrapeWithPuppeteer(url, isIndeed);
            }
            throw new Error(`Failed to fetch URL: ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove unwanted elements
        $('script, style, iframe, noscript, header, footer, nav').remove();

        // Extract text from body
        let text = $('body').text();

        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();

        // If content is suspiciously short/empty after simple scrape (e.g. JS required), try Puppeteer
        if (text.length < 500) {
            console.log("[Scraper] Simple fetch result too short. Retrying with Puppeteer...");
            return await scrapeWithPuppeteer(url, isIndeed);
        }

        return text.substring(0, 50000);
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        // Last ditch effort w/ Puppeteer if we haven't tried it yet
        if (!isIndeed) { // If it was Indeed, we already tried Puppeteer above
            try {
                return await scrapeWithPuppeteer(url, false);
            } catch (e) { return ""; }
        }
        return "";
    }
}


import * as cheerio from 'cheerio';

export async function scrapeUrl(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
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

        // Truncate to reasonable length to fit context window if needed
        // Gemini Pro 1.5 has large context, but let's be safe and limit to like 50k chars for now to avoid huge payloads
        return text.substring(0, 50000);
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return "";
    }
}

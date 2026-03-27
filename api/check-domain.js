const fetch = require('node-fetch');

// CORS Proxies list
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://cors-anywhere.herokuapp.com/'
];

// User-Agent list for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url, useProxy = true } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await analyzeUrl(url, useProxy);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({
            url: url,
            statusCode: 'Error',
            statusText: error.message,
            title: '❌ Failed to fetch website',
            canonical: '-',
            amp: '-',
            error: error.message
        });
    }
};

async function analyzeUrl(url, useProxy) {
    // Normalize URL
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }

    let html = '';
    let statusCode = 0;
    let statusText = '';
    let usedProxy = false;

    // Try direct fetch first
    try {
        const result = await fetchWithTimeout(targetUrl, 10000);
        html = result.html;
        statusCode = result.statusCode;
        statusText = result.statusText;
    } catch (directError) {
        console.log('Direct fetch failed:', directError.message);
        
        if (!useProxy) {
            throw directError;
        }
        
        // Try with proxies
        let proxySuccess = false;
        for (const proxy of CORS_PROXIES) {
            try {
                const proxyUrl = proxy + encodeURIComponent(targetUrl);
                const result = await fetchWithTimeout(proxyUrl, 15000, true);
                html = result.html;
                statusCode = 200;
                statusText = 'OK (via Proxy)';
                usedProxy = true;
                proxySuccess = true;
                break;
            } catch (proxyError) {
                console.log(`Proxy ${proxy} failed:`, proxyError.message);
                continue;
            }
        }
        
        if (!proxySuccess) {
            throw new Error('Failed to fetch URL with all methods');
        }
    }

    // Parse HTML with regex (lightweight)
    const parsed = parseHtml(html, targetUrl);
    
    return {
        url: targetUrl,
        statusCode: statusCode,
        statusText: statusText + (usedProxy ? ' 🔄' : ''),
        title: parsed.title,
        canonical: parsed.canonical,
        amp: parsed.amp,
        usedProxy: usedProxy
    };
}

async function fetchWithTimeout(url, timeout, isProxy = false) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const html = await response.text();
        
        return {
            html: html,
            statusCode: response.status,
            statusText: response.statusText
        };
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    }
}

function parseHtml(html, baseUrl) {
    // Extract Title
    let title = 'No title found';
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim().replace(/\s+/g, ' ');
        if (title.length > 200) title = title.substring(0, 200) + '...';
    }
    
    // Extract Canonical URL
    let canonical = '-';
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
                          html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
    if (canonicalMatch && canonicalMatch[1]) {
        canonical = canonicalMatch[1];
        // Make absolute URL if needed
        if (!canonical.startsWith('http')) {
            try {
                const base = new URL(baseUrl);
                canonical = new URL(canonical, base).href;
            } catch (e) {
                // Keep as is
            }
        }
    }
    
    // Detect AMP
    let amp = '-';
    
    // Check for amphtml link
    const ampLinkMatch = html.match(/<link[^>]*rel=["']amphtml["'][^>]*href=["']([^"']+)["']/i) ||
                         html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']amphtml["']/i);
    if (ampLinkMatch && ampLinkMatch[1]) {
        amp = ampLinkMatch[1];
        // Make absolute URL if needed
        if (!amp.startsWith('http')) {
            try {
                const base = new URL(baseUrl);
                amp = new URL(amp, base).href;
            } catch (e) {
                // Keep as is
            }
        }
    }
    // Check for AMP attribute on html tag
    else if (/<html[^>]*\samp\s/i.test(html) || /<html[^>]*\s⚡\s/i.test(html)) {
        amp = '✓ AMP Page (⚡ attribute)';
    }
    // Check for AMP boilerplate
    else if (html.includes('amp-boilerplate')) {
        amp = '✓ AMP Page (boilerplate)';
    }
    
    return { title, canonical, amp };
}

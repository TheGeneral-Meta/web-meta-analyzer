const fetch = require('node-fetch');
const dns = require('dns');
const https = require('https');
const tls = require('tls');

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
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url, useProxy = true } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await analyzeComplete(url, useProxy);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({
            url: url,
            error: error.message,
            basicInfo: { status: 'Error', message: error.message }
        });
    }
};

async function analyzeComplete(url, useProxy) {
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }

    const domain = new URL(targetUrl).hostname;
    const startTime = Date.now();

    // Run all checks in parallel
    const [
        htmlResult,
        sslInfo,
        dnsInfo,
        securityHeaders,
        robotsTxt,
        sitemap
    ] = await Promise.allSettled([
        fetchHtml(targetUrl, useProxy),
        checkSSL(domain),
        checkDNS(domain),
        checkSecurityHeaders(targetUrl),
        checkRobotsTxt(targetUrl),
        checkSitemap(targetUrl)
    ]);

    const html = htmlResult.status === 'fulfilled' ? htmlResult.value : null;
    
    // Parse HTML data
    const parsedData = html ? parseHtmlData(html.html, targetUrl, html.statusCode, html.statusText) : {
        title: 'Failed to fetch',
        canonical: '-',
        amp: '-',
        metaTags: {},
        openGraph: {},
        twitterCard: {},
        jsonLd: [],
        h1Tags: [],
        h2Tags: [],
        images: [],
        links: [],
        wordCount: 0
    };

    return {
        url: targetUrl,
        domain: domain,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        
        // Basic Info
        basicInfo: {
            statusCode: html?.statusCode || 0,
            statusText: html?.statusText || 'Error',
            protocol: targetUrl.split(':')[0],
            finalUrl: html?.finalUrl || targetUrl,
            usedProxy: html?.usedProxy || false
        },
        
        // HTML Meta Data
        metaData: {
            title: parsedData.title,
            canonical: parsedData.canonical,
            amp: parsedData.amp,
            description: parsedData.metaTags.description || '-',
            keywords: parsedData.metaTags.keywords || '-',
            robots: parsedData.metaTags.robots || '-',
            viewport: parsedData.metaTags.viewport || '-',
            charset: parsedData.metaTags.charset || '-'
        },
        
        // Open Graph Tags
        openGraph: {
            title: parsedData.openGraph.title || '-',
            description: parsedData.openGraph.description || '-',
            image: parsedData.openGraph.image || '-',
            url: parsedData.openGraph.url || '-',
            type: parsedData.openGraph.type || '-',
            siteName: parsedData.openGraph.siteName || '-'
        },
        
        // Twitter Card Tags
        twitterCard: {
            card: parsedData.twitterCard.card || '-',
            title: parsedData.twitterCard.title || '-',
            description: parsedData.twitterCard.description || '-',
            image: parsedData.twitterCard.image || '-',
            site: parsedData.twitterCard.site || '-',
            creator: parsedData.twitterCard.creator || '-'
        },
        
        // SSL Certificate Info
        sslInfo: sslInfo.status === 'fulfilled' ? sslInfo.value : {
            valid: false,
            error: sslInfo.reason?.message || 'SSL check failed'
        },
        
        // DNS Information
        dnsInfo: dnsInfo.status === 'fulfilled' ? dnsInfo.value : {
            error: dnsInfo.reason?.message || 'DNS lookup failed'
        },
        
        // Security Headers
        securityHeaders: securityHeaders.status === 'fulfilled' ? securityHeaders.value : {
            error: securityHeaders.reason?.message || 'Failed to fetch headers'
        },
        
        // Robots.txt
        robotsTxt: robotsTxt.status === 'fulfilled' ? robotsTxt.value : {
            exists: false,
            content: null,
            error: robotsTxt.reason?.message
        },
        
        // Sitemap
        sitemap: sitemap.status === 'fulfilled' ? sitemap.value : {
            exists: false,
            url: null,
            error: sitemap.reason?.message
        },
        
        // Content Analysis
        contentAnalysis: {
            h1Tags: parsedData.h1Tags,
            h2Tags: parsedData.h2Tags.slice(0, 10),
            imagesCount: parsedData.images.length,
            linksCount: parsedData.links.length,
            internalLinks: parsedData.links.filter(l => l.includes(domain)).length,
            externalLinks: parsedData.links.filter(l => !l.includes(domain)).length,
            wordCount: parsedData.wordCount,
            hasVideo: parsedData.hasVideo || false,
            hasAudio: parsedData.hasAudio || false,
            hasIframe: parsedData.hasIframe || false
        },
        
        // Structured Data
        structuredData: {
            jsonLdCount: parsedData.jsonLd.length,
            jsonLdTypes: parsedData.jsonLd.map(jd => jd['@type'] || 'Unknown'),
            hasSchemaOrg: parsedData.hasSchemaOrg || false
        },
        
        // Recommendations
        recommendations: generateRecommendations({
            title: parsedData.title,
            canonical: parsedData.canonical,
            amp: parsedData.amp,
            ssl: sslInfo.status === 'fulfilled' ? sslInfo.value : null,
            securityHeaders: securityHeaders.status === 'fulfilled' ? securityHeaders.value : null,
            openGraph: parsedData.openGraph,
            twitterCard: parsedData.twitterCard,
            h1Tags: parsedData.h1Tags,
            wordCount: parsedData.wordCount
        })
    };
}

async function fetchHtml(url, useProxy) {
    let html = '';
    let statusCode = 0;
    let statusText = '';
    let finalUrl = url;
    let usedProxy = false;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: controller.signal,
            redirect: 'follow'
        });
        
        clearTimeout(timeoutId);
        
        statusCode = response.status;
        statusText = response.statusText;
        finalUrl = response.url;
        html = await response.text();
        
    } catch (directError) {
        if (!useProxy) throw directError;
        
        for (const proxy of CORS_PROXIES) {
            try {
                const proxyUrl = proxy + encodeURIComponent(url);
                const response = await fetch(proxyUrl, {
                    headers: { 'User-Agent': USER_AGENTS[0] }
                });
                
                if (response.ok) {
                    html = await response.text();
                    statusCode = 200;
                    statusText = 'OK (via Proxy)';
                    usedProxy = true;
                    break;
                }
            } catch (proxyError) {
                continue;
            }
        }
        
        if (!html) throw new Error('Failed to fetch with all methods');
    }
    
    return { html, statusCode, statusText, finalUrl, usedProxy };
}

function parseHtmlData(html, baseUrl, statusCode, statusText) {
    const result = {
        title: 'No title found',
        canonical: '-',
        amp: '-',
        metaTags: {},
        openGraph: {},
        twitterCard: {},
        jsonLd: [],
        h1Tags: [],
        h2Tags: [],
        images: [],
        links: [],
        wordCount: 0,
        hasVideo: false,
        hasAudio: false,
        hasIframe: false,
        hasSchemaOrg: false
    };
    
    // Extract Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        result.title = titleMatch[1].trim().replace(/\s+/g, ' ');
        if (result.title.length > 200) result.title = result.title.substring(0, 200) + '...';
    }
    
    // Extract Canonical URL
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
                          html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
    if (canonicalMatch && canonicalMatch[1]) {
        result.canonical = canonicalMatch[1];
    }
    
    // Detect AMP
    const ampLinkMatch = html.match(/<link[^>]*rel=["']amphtml["'][^>]*href=["']([^"']+)["']/i);
    if (ampLinkMatch && ampLinkMatch[1]) {
        result.amp = ampLinkMatch[1];
    } else if (/<html[^>]*\samp\s/i.test(html) || /<html[^>]*\s⚡\s/i.test(html)) {
        result.amp = '✓ AMP Page (⚡ attribute)';
    } else if (html.includes('amp-boilerplate')) {
        result.amp = '✓ AMP Page (boilerplate)';
    }
    
    // Extract Meta Tags
    const metaRegex = /<meta[^>]*>/gi;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(html)) !== null) {
        const metaTag = metaMatch[0];
        const nameMatch = metaTag.match(/name=["']([^"']+)["']/i);
        const propertyMatch = metaTag.match(/property=["']([^"']+)["']/i);
        const contentMatch = metaTag.match(/content=["']([^"']+)["']/i);
        
        if (contentMatch && contentMatch[1]) {
            const name = nameMatch ? nameMatch[1] : (propertyMatch ? propertyMatch[1] : null);
            if (name) {
                if (name.startsWith('og:')) {
                    const key = name.replace('og:', '');
                    result.openGraph[key] = contentMatch[1];
                } else if (name.startsWith('twitter:')) {
                    const key = name.replace('twitter:', '');
                    result.twitterCard[key] = contentMatch[1];
                } else {
                    result.metaTags[name] = contentMatch[1];
                }
            }
        }
    }
    
    // Extract H1 Tags
    const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
    let h1Match;
    while ((h1Match = h1Regex.exec(html)) !== null) {
        const text = h1Match[1].replace(/<[^>]*>/g, '').trim();
        if (text) result.h1Tags.push(text);
    }
    
    // Extract H2 Tags
    const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    let h2Match;
    while ((h2Match = h2Regex.exec(html)) !== null) {
        const text = h2Match[1].replace(/<[^>]*>/g, '').trim();
        if (text) result.h2Tags.push(text);
    }
    
    // Extract Images
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
        result.images.push(imgMatch[1]);
    }
    
    // Extract Links
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
        const href = linkMatch[1];
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            result.links.push(href);
        }
    }
    
    // Extract JSON-LD
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonMatch;
    while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
        try {
            const jsonData = JSON.parse(jsonMatch[1]);
            result.jsonLd.push(jsonData);
            result.hasSchemaOrg = true;
        } catch (e) {}
    }
    
    // Check for video/audio/iframe
    result.hasVideo = /<video[^>]*>/i.test(html);
    result.hasAudio = /<audio[^>]*>/i.test(html);
    result.hasIframe = /<iframe[^>]*>/i.test(html);
    
    // Word count (remove HTML tags)
    const textContent = html.replace(/<[^>]*>/g, ' ');
    result.wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
    
    return result;
}

async function checkSSL(domain) {
    return new Promise((resolve) => {
        const options = {
            host: domain,
            port: 443,
            method: 'HEAD',
            rejectUnauthorized: false,
            timeout: 10000
        };
        
        const req = https.request(options, (res) => {
            const cert = res.socket.getPeerCertificate();
            
            if (cert && cert.subject) {
                resolve({
                    valid: true,
                    issuer: cert.issuer?.CN || 'Unknown',
                    subject: cert.subject?.CN || domain,
                    validFrom: cert.valid_from,
                    validTo: cert.valid_to,
                    daysRemaining: Math.ceil((new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24)),
                    protocol: res.socket.getProtocol(),
                    cipher: res.socket.getCipher()?.name
                });
            } else {
                resolve({ valid: false, error: 'No certificate found' });
            }
            res.destroy();
        });
        
        req.on('error', (error) => {
            resolve({ valid: false, error: error.message });
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve({ valid: false, error: 'Timeout' });
        });
        
        req.end();
    });
}

async function checkDNS(domain) {
    return new Promise((resolve) => {
        const results = {
            a: [],
            aaaa: [],
            mx: [],
            txt: [],
            ns: [],
            cname: null
        };
        
        const checks = [
            new Promise((res) => dns.resolve4(domain, (err, addresses) => {
                if (!err) results.a = addresses;
                res();
            })),
            new Promise((res) => dns.resolve6(domain, (err, addresses) => {
                if (!err) results.aaaa = addresses;
                res();
            })),
            new Promise((res) => dns.resolveMx(domain, (err, addresses) => {
                if (!err) results.mx = addresses.sort((a,b) => a.priority - b.priority);
                res();
            })),
            new Promise((res) => dns.resolveTxt(domain, (err, addresses) => {
                if (!err) results.txt = addresses.flat();
                res();
            })),
            new Promise((res) => dns.resolveNs(domain, (err, addresses) => {
                if (!err) results.ns = addresses;
                res();
            })),
            new Promise((res) => dns.resolveCname(domain, (err, addresses) => {
                if (!err && addresses[0]) results.cname = addresses[0];
                res();
            }))
        ];
        
        Promise.all(checks).then(() => {
            resolve(results);
        });
    });
}

async function checkSecurityHeaders(url) {
    try {
        const response = await fetch(url, { method: 'HEAD', timeout: 10000 });
        const headers = response.headers.raw();
        
        const securityHeaders = {
            strictTransportSecurity: headers['strict-transport-security']?.[0] || null,
            contentSecurityPolicy: headers['content-security-policy']?.[0] || null,
            xFrameOptions: headers['x-frame-options']?.[0] || null,
            xContentTypeOptions: headers['x-content-type-options']?.[0] || null,
            xXssProtection: headers['x-xss-protection']?.[0] || null,
            referrerPolicy: headers['referrer-policy']?.[0] || null,
            permissionsPolicy: headers['permissions-policy']?.[0] || null,
            crossOriginOpenerPolicy: headers['cross-origin-opener-policy']?.[0] || null
        };
        
        const score = calculateSecurityScore(securityHeaders);
        
        return {
            headers: securityHeaders,
            score: score,
            grade: getSecurityGrade(score),
            recommendations: getSecurityRecommendations(securityHeaders)
        };
    } catch (error) {
        return { error: error.message };
    }
}

function calculateSecurityScore(headers) {
    let score = 0;
    if (headers.strictTransportSecurity) score += 20;
    if (headers.contentSecurityPolicy) score += 25;
    if (headers.xFrameOptions === 'SAMEORIGIN' || headers.xFrameOptions === 'DENY') score += 15;
    if (headers.xContentTypeOptions === 'nosniff') score += 15;
    if (headers.xXssProtection === '1; mode=block') score += 10;
    if (headers.referrerPolicy) score += 10;
    if (headers.permissionsPolicy) score += 5;
    return score;
}

function getSecurityGrade(score) {
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    if (score >= 20) return 'D';
    return 'F';
}

function getSecurityRecommendations(headers) {
    const recommendations = [];
    if (!headers.strictTransportSecurity) recommendations.push('Enable HSTS (Strict-Transport-Security)');
    if (!headers.contentSecurityPolicy) recommendations.push('Implement Content Security Policy (CSP)');
    if (!headers.xFrameOptions) recommendations.push('Set X-Frame-Options to prevent clickjacking');
    if (!headers.xContentTypeOptions) recommendations.push('Add X-Content-Type-Options: nosniff');
    if (!headers.xXssProtection) recommendations.push('Add X-XSS-Protection: 1; mode=block');
    return recommendations;
}

async function checkRobotsTxt(url) {
    const robotsUrl = new URL('/robots.txt', url).href;
    try {
        const response = await fetch(robotsUrl, { timeout: 5000 });
        if (response.ok) {
            const content = await response.text();
            return {
                exists: true,
                url: robotsUrl,
                content: content.substring(0, 2000),
                statusCode: response.status
            };
        }
        return { exists: false, url: robotsUrl, statusCode: response.status };
    } catch (error) {
        return { exists: false, url: robotsUrl, error: error.message };
    }
}

async function checkSitemap(url) {
    const sitemapUrls = [
        new URL('/sitemap.xml', url).href,
        new URL('/sitemap_index.xml', url).href,
        new URL('/sitemap/sitemap.xml', url).href
    ];
    
    for (const sitemapUrl of sitemapUrls) {
        try {
            const response = await fetch(sitemapUrl, { timeout: 5000 });
            if (response.ok) {
                const content = await response.text();
                const urls = (content.match(/<loc>(.*?)<\/loc>/g) || []).slice(0, 50);
                return {
                    exists: true,
                    url: sitemapUrl,
                    urlCount: urls.length,
                    preview: urls.slice(0, 5)
                };
            }
        } catch (error) {
            continue;
        }
    }
    
    return { exists: false, url: null };
}

function generateRecommendations(data) {
    const recommendations = [];
    
    if (!data.title || data.title === 'No title found' || data.title.length < 10) {
        recommendations.push('Add a descriptive title tag (50-60 characters recommended)');
    }
    
    if (data.title && data.title.length > 70) {
        recommendations.push('Title tag is too long (recommended: 50-60 characters)');
    }
    
    if (!data.canonical || data.canonical === '-') {
        recommendations.push('Add canonical URL to prevent duplicate content issues');
    }
    
    if (!data.amp || data.amp === '-') {
        recommendations.push('Consider implementing AMP for better mobile performance');
    }
    
    if (data.ssl && !data.ssl.valid) {
        recommendations.push('Install SSL certificate for secure HTTPS connection');
    } else if (data.ssl && data.ssl.daysRemaining < 30) {
        recommendations.push(`SSL certificate expires in ${data.ssl.daysRemaining} days. Renew soon!`);
    }
    
    if (data.securityHeaders && data.securityHeaders.grade !== 'A' && data.securityHeaders.grade !== 'B') {
        recommendations.push('Improve security headers to protect against common vulnerabilities');
    }
    
    if (!data.openGraph.title || data.openGraph.title === '-') {
        recommendations.push('Add Open Graph tags for better social media sharing');
    }
    
    if (!data.twitterCard.card || data.twitterCard.card === '-') {
        recommendations.push('Add Twitter Card tags for better Twitter sharing');
    }
    
    if (data.h1Tags.length === 0) {
        recommendations.push('Add H1 heading for better SEO structure');
    } else if (data.h1Tags.length > 1) {
        recommendations.push('Use only one H1 heading per page');
    }
    
    if (data.wordCount < 300) {
        recommendations.push('Add more content (300+ words recommended for SEO)');
    }
    
    return {
        total: recommendations.length,
        items: recommendations.slice(0, 10),
        priority: recommendations.length > 5 ? 'High' : recommendations.length > 0 ? 'Medium' : 'Low'
    };
}

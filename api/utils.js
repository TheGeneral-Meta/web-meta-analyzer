const axios = require('axios');
const cheerio = require('cheerio');
const dns = require('dns').promises;
const tls = require('tls');
const validator = require('validator');

// Helper functions for domain checking
class DomainChecker {
  constructor() {
    this.timeout = 10000;
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  normalizeUrl(url) {
    if (!url) return null;
    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    return url;
  }

  extractDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  async checkHttpStatus(url) {
    try {
      const startTime = Date.now();
      const response = await axios.get(url, {
        timeout: this.timeout,
        maxRedirects: 5,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      const responseTime = Date.now() - startTime;
      return {
        status: response.status,
        statusText: response.statusText,
        responseTime: responseTime,
        redirected: response.request._redirectable?._redirectCount > 0,
        finalUrl: response.request.res.responseUrl || url
      };
    } catch (error) {
      if (error.response) {
        return {
          status: error.response.status,
          statusText: error.response.statusText,
          responseTime: null,
          error: error.message
        };
      }
      return {
        status: null,
        statusText: null,
        responseTime: null,
        error: error.message
      };
    }
  }

  async parseHtml(url) {
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      
      const $ = cheerio.load(response.data);
      return {
        $,
        html: response.data,
        contentType: response.headers['content-type']
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  getTitle($) {
    return $('title').text().trim() || null;
  }

  getCanonical($) {
    return $('link[rel="canonical"]').attr('href') || null;
  }

  getAmp($) {
    const ampLink = $('link[rel="amphtml"]').attr('href');
    const ampAttr = $('html[amp], html[⚡]').length > 0;
    return ampLink || (ampAttr ? 'AMP HTML detected' : null);
  }

  getMetaTags($) {
    const meta = {
      description: null,
      keywords: null,
      robots: null,
      viewport: null
    };

    $('meta').each((i, elem) => {
      const name = $(elem).attr('name');
      const property = $(elem).attr('property');
      const content = $(elem).attr('content');

      if (name === 'description') meta.description = content;
      if (name === 'keywords') meta.keywords = content;
      if (name === 'robots') meta.robots = content;
      if (name === 'viewport') meta.viewport = content;
    });

    return meta;
  }

  getOpenGraphTags($) {
    const og = {};
    $('meta[property^="og:"]').each((i, elem) => {
      const property = $(elem).attr('property');
      const content = $(elem).attr('content');
      if (property && content) {
        og[property] = content;
      }
    });
    return og;
  }

  getTwitterCards($) {
    const twitter = {};
    $('meta[name^="twitter:"]').each((i, elem) => {
      const name = $(elem).attr('name');
      const content = $(elem).attr('content');
      if (name && content) {
        twitter[name] = content;
      }
    });
    return twitter;
  }

  getHeaders($) {
    const headers = {
      h1: [],
      h2: [],
      h3: []
    };

    $('h1').each((i, elem) => {
      headers.h1.push($(elem).text().trim());
    });
    $('h2').each((i, elem) => {
      headers.h2.push($(elem).text().trim());
    });
    $('h3').each((i, elem) => {
      headers.h3.push($(elem).text().trim());
    });

    return headers;
  }

  getContentStats($) {
    const text = $('body').text();
    const words = text.trim().split(/\s+/).length;
    const images = $('img').length;
    const links = $('a').length;
    
    return {
      wordCount: words,
      imageCount: images,
      linkCount: links
    };
  }

  async getDnsRecords(domain) {
    const records = {
      A: [],
      AAAA: [],
      MX: [],
      NS: [],
      TXT: []
    };

    try {
      const a = await dns.resolve4(domain);
      records.A = a;
    } catch {}
    
    try {
      const aaaa = await dns.resolve6(domain);
      records.AAAA = aaaa;
    } catch {}
    
    try {
      const mx = await dns.resolveMx(domain);
      records.MX = mx.sort((a, b) => a.priority - b.priority).map(m => `${m.exchange} (priority ${m.priority})`);
    } catch {}
    
    try {
      const ns = await dns.resolveNs(domain);
      records.NS = ns;
    } catch {}
    
    try {
      const txt = await dns.resolveTxt(domain);
      records.TXT = txt.flat();
    } catch {}

    return records;
  }

  async checkSslCertificate(domain) {
    return new Promise((resolve) => {
      const socket = tls.connect({
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false,
        timeout: 5000
      });

      socket.once('secureConnect', () => {
        const cert = socket.getPeerCertificate();
        if (cert && cert.subject) {
          resolve({
            valid: true,
            issuer: cert.issuer?.CN || cert.issuer?.O || 'Unknown',
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            subject: cert.subject?.CN || domain
          });
        } else {
          resolve({
            valid: false,
            error: 'No certificate found'
          });
        }
        socket.destroy();
      });

      socket.once('error', (err) => {
        resolve({
          valid: false,
          error: err.message
        });
        socket.destroy();
      });

      socket.setTimeout(5000, () => {
        resolve({
          valid: false,
          error: 'Timeout'
        });
        socket.destroy();
      });
    });
  }

  async checkSecurityHeaders(url) {
    try {
      const response = await axios.head(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      
      const headers = response.headers;
      const security = {
        'Strict-Transport-Security': headers['strict-transport-security'] || null,
        'Content-Security-Policy': headers['content-security-policy'] || null,
        'X-Frame-Options': headers['x-frame-options'] || null,
        'X-Content-Type-Options': headers['x-content-type-options'] || null,
        'X-XSS-Protection': headers['x-xss-protection'] || null,
        'Referrer-Policy': headers['referrer-policy'] || null
      };
      
      return security;
    } catch {
      return {};
    }
  }

  async checkRobotsTxt(domain) {
    try {
      const response = await axios.get(`https://${domain}/robots.txt`, {
        timeout: 5000,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      return response.data;
    } catch {
      return null;
    }
  }

  async checkSitemapXml(domain) {
    try {
      const response = await axios.get(`https://${domain}/sitemap.xml`, {
        timeout: 5000,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  getStructuredData($) {
    const structuredData = [];
    $('script[type="application/ld+json"]').each((i, elem) => {
      try {
        const data = JSON.parse($(elem).html());
        structuredData.push(data);
      } catch {}
    });
    return structuredData;
  }

  generateSeoRecommendations(results) {
    const recommendations = [];
    
    if (!results.title || results.title.length < 10 || results.title.length > 60) {
      recommendations.push('Title tag should be between 10-60 characters for optimal SEO');
    }
    
    if (!results.meta?.description || results.meta.description.length < 50 || results.meta.description.length > 160) {
      recommendations.push('Meta description should be between 50-160 characters');
    }
    
    if (!results.canonical) {
      recommendations.push('Add canonical URL to avoid duplicate content issues');
    }
    
    if (results.headers?.h1?.length === 0) {
      recommendations.push('Add H1 heading for better content structure');
    }
    
    if (results.ssl?.valid !== true) {
      recommendations.push('Install SSL certificate for secure connection');
    }
    
    if (!results.securityHeaders?.['Strict-Transport-Security']) {
      recommendations.push('Implement HSTS header for better security');
    }
    
    if (!results.securityHeaders?.['X-Frame-Options']) {
      recommendations.push('Add X-Frame-Options header to prevent clickjacking');
    }
    
    if (results.contentStats?.wordCount < 300) {
      recommendations.push('Add more content (minimum 300 words recommended)');
    }
    
    return recommendations;
  }
}

module.exports = DomainChecker;

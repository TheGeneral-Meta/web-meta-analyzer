let currentAnalysis = null;
let isAnalyzing = false;

const API_URL = '/api/check-domain';

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tab === 'single') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('singleTab').classList.add('active');
    } else {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('batchTab').classList.add('active');
    }
}

async function checkSingle() {
    const url = document.getElementById('singleUrl').value.trim();
    if (!url) {
        showNotification('Please enter a URL', 'error');
        return;
    }
    await analyzeUrls([url]);
}

async function checkBatch() {
    const urlsText = document.getElementById('batchUrls').value;
    if (!urlsText.trim()) {
        showNotification('Please enter URLs', 'error');
        return;
    }
    
    const urls = urlsText.split('\n')
        .map(u => u.trim())
        .filter(u => u && !u.startsWith('#'));
    
    if (urls.length === 0) {
        showNotification('Please enter valid URLs', 'error');
        return;
    }
    
    await analyzeUrls(urls);
}

async function analyzeUrls(urls) {
    if (isAnalyzing) {
        showNotification('Already analyzing, please wait...', 'warning');
        return;
    }
    
    isAnalyzing = true;
    const loading = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    const emptyDiv = document.getElementById('empty');
    const loadingText = document.getElementById('loadingText');
    const progressBar = document.getElementById('progressBar');
    
    loading.style.display = 'block';
    resultsDiv.style.display = 'none';
    emptyDiv.style.display = 'none';
    
    const allResults = [];
    let completed = 0;
    
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        loadingText.textContent = `Analyzing ${i + 1}/${urls.length}: ${url}`;
        progressBar.style.width = `${(i / urls.length) * 100}%`;
        
        const useProxy = document.getElementById('useProxy').checked;
        
        try {
            const result = await analyzeUrl(url, useProxy);
            allResults.push(result);
            currentAnalysis = result;
            displayAnalysis(result);
        } catch (error) {
            showNotification(`Error analyzing ${url}: ${error.message}`, 'error');
        }
        
        completed++;
        
        if (i < urls.length - 1) {
            await delay(500);
        }
    }
    
    progressBar.style.width = '100%';
    loadingText.textContent = 'Complete! Loading results...';
    await delay(500);
    
    loading.style.display = 'none';
    resultsDiv.style.display = 'block';
    isAnalyzing = false;
    
    showNotification(`✅ Analysis completed! ${allResults.length} websites analyzed.`, 'success');
}

async function analyzeUrl(url, useProxy) {
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }
    
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, useProxy })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
}

function displayAnalysis(data) {
    const container = document.getElementById('analysisContent');
    const detailedView = document.getElementById('detailedView').checked;
    
    container.innerHTML = `
        ${createSection('Basic Information', createBasicInfoHTML(data), true)}
        ${createSection('Meta Tags', createMetaTagsHTML(data), detailedView)}
        ${createSection('Open Graph Tags (Facebook/Social)', createOpenGraphHTML(data), detailedView)}
        ${createSection('Twitter Card Tags', createTwitterCardHTML(data), detailedView)}
        ${createSection('SSL Certificate', createSSLHTML(data), detailedView)}
        ${createSection('DNS Records', createDNSHTML(data), detailedView)}
        ${createSection('Security Headers', createSecurityHeadersHTML(data), detailedView)}
        ${createSection('Content Analysis', createContentAnalysisHTML(data), detailedView)}
        ${createSection('Robots.txt & Sitemap', createRobotsSitemapHTML(data), detailedView)}
        ${createSection('Structured Data', createStructuredDataHTML(data), detailedView)}
        ${createSection('SEO Recommendations', createRecommendationsHTML(data), true)}
    `;
    
    updateSummary(data);
    
    // Add collapse functionality
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            content.classList.toggle('collapsed');
        });
    });
}

function createSection(title, content, isOpen = true) {
    return `
        <div class="analysis-section">
            <div class="section-header">
                <span>${title}</span>
                <span>▼</span>
            </div>
            <div class="section-content ${!isOpen ? 'collapsed' : ''}">
                ${content}
            </div>
        </div>
    `;
}

function createBasicInfoHTML(data) {
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">URL</div>
                <div class="info-value"><a href="${data.url}" target="_blank">${data.url}</a></div>
            </div>
            <div class="info-item">
                <div class="info-label">Domain</div>
                <div class="info-value">${data.domain}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Status Code</div>
                <div class="info-value ${data.basicInfo.statusCode < 400 ? 'status-success' : 'status-error'}">
                    ${data.basicInfo.statusCode} ${data.basicInfo.statusText}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Response Time</div>
                <div class="info-value">${data.responseTime} ms</div>
            </div>
            <div class="info-item">
                <div class="info-label">Protocol</div>
                <div class="info-value">${data.basicInfo.protocol}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Using Proxy</div>
                <div class="info-value">${data.basicInfo.usedProxy ? 'Yes' : 'No'}</div>
            </div>
        </div>
    `;
}

function createMetaTagsHTML(data) {
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Title</div>
                <div class="info-value">${escapeHtml(data.metaData.title)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Description</div>
                <div class="info-value">${escapeHtml(data.metaData.description)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Keywords</div>
                <div class="info-value">${escapeHtml(data.metaData.keywords)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Canonical URL</div>
                <div class="info-value">
                    ${data.metaData.canonical !== '-' ? `<a href="${data.metaData.canonical}" target="_blank">${data.metaData.canonical}</a>` : '-'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">AMP Version</div>
                <div class="info-value">
                    ${data.metaData.amp !== '-' ? 
                        (data.metaData.amp.includes('http') ? `<a href="${data.metaData.amp}" target="_blank">${data.metaData.amp}</a>` : 
                        `<span class="badge badge-success">${data.metaData.amp}</span>`) : '-'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Robots</div>
                <div class="info-value">${data.metaData.robots}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Viewport</div>
                <div class="info-value">${data.metaData.viewport}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Charset</div>
                <div class="info-value">${data.metaData.charset}</div>
            </div>
        </div>
    `;
}

function createOpenGraphHTML(data) {
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">OG Title</div>
                <div class="info-value">${escapeHtml(data.openGraph.title)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">OG Description</div>
                <div class="info-value">${escapeHtml(data.openGraph.description)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">OG Image</div>
                <div class="info-value">${data.openGraph.image !== '-' ? `<a href="${data.openGraph.image}" target="_blank">View Image</a>` : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">OG URL</div>
                <div class="info-value">${data.openGraph.url !== '-' ? `<a href="${data.openGraph.url}" target="_blank">${data.openGraph.url}</a>` : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">OG Type</div>
                <div class="info-value">${data.openGraph.type}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Site Name</div>
                <div class="info-value">${data.openGraph.siteName}</div>
            </div>
        </div>
    `;
}

function createTwitterCardHTML(data) {
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Twitter Card</div>
                <div class="info-value">${data.twitterCard.card}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Title</div>
                <div class="info-value">${escapeHtml(data.twitterCard.title)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Description</div>
                <div class="info-value">${escapeHtml(data.twitterCard.description)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Image</div>
                <div class="info-value">${data.twitterCard.image !== '-' ? `<a href="${data.twitterCard.image}" target="_blank">View Image</a>` : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Site</div>
                <div class="info-value">${data.twitterCard.site}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Creator</div>
                <div class="info-value">${data.twitterCard.creator}</div>
            </div>
        </div>
    `;
}

function createSSLHTML(data) {
    const ssl = data.sslInfo;
    if (ssl.error) {
        return `<div class="status-error">⚠️ ${ssl.error}</div>`;
    }
    
    const daysClass = ssl.daysRemaining < 30 ? 'status-warning' : 'status-success';
    
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">SSL Valid</div>
                <div class="info-value ${ssl.valid ? 'status-success' : 'status-error'}">
                    ${ssl.valid ? '✓ Valid' : '✗ Invalid'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Issuer</div>
                <div class="info-value">${ssl.issuer || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Subject</div>
                <div class="info-value">${ssl.subject || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Valid From</div>
                <div class="info-value">${ssl.validFrom || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Valid To</div>
                <div class="info-value">${ssl.validTo || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Days Remaining</div>
                <div class="info-value ${daysClass}">${ssl.daysRemaining || 0} days</div>
            </div>
            <div class="info-item">
                <div class="info-label">Protocol</div>
                <div class="info-value">${ssl.protocol || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Cipher</div>
                <div class="info-value">${ssl.cipher || '-'}</div>
            </div>
        </div>
    `;
}

function createDNSHTML(data) {
    const dns = data.dnsInfo;
    if (dns.error) {
        return `<div class="status-error">⚠️ ${dns.error}</div>`;
    }
    
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">A Records (IPv4)</div>
                <div class="info-value">${dns.a.length > 0 ? dns.a.join(', ') : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">AAAA Records (IPv6)</div>
                <div class="info-value">${dns.aaaa.length > 0 ? dns.aaaa.join(', ') : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">MX Records</div>
                <div class="info-value">${dns.mx.length > 0 ? dns.mx.map(m => `${m.exchange} (priority ${m.priority})`).join(', ') : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">NS Records</div>
                <div class="info-value">${dns.ns.length > 0 ? dns.ns.join(', ') : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">CNAME</div>
                <div class="info-value">${dns.cname || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">TXT Records</div>
                <div class="info-value">${dns.txt.length > 0 ? dns.txt.slice(0, 3).join(', ') + (dns.txt.length > 3 ? '...' : '') : '-'}</div>
            </div>
        </div>
    `;
}

function createSecurityHeadersHTML(data) {
    const headers = data.securityHeaders;
    if (headers.error) {
        return `<div class="status-error">⚠️ ${headers.error}</div>`;
    }
    
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Security Grade</div>
                <div class="info-value">
                    <span class="badge ${headers.grade === 'A' ? 'badge-success' : headers.grade === 'F' ? 'badge-error' : 'badge-warning'}">
                        Grade ${headers.grade} (${headers.score}/100)
                    </span>
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">HSTS</div>
                <div class="info-value">${headers.headers.strictTransportSecurity || 'Not Set'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">CSP</div>
                <div class="info-value">${headers.headers.contentSecurityPolicy || 'Not Set'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">X-Frame-Options</div>
                <div class="info-value">${headers.headers.xFrameOptions || 'Not Set'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">X-Content-Type-Options</div>
                <div class="info-value">${headers.headers.xContentTypeOptions || 'Not Set'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">X-XSS-Protection</div>
                <div class="info-value">${headers.headers.xXssProtection || 'Not Set'}</div>
            </div>
        </div>
    `;
}

function createContentAnalysisHTML(data) {
    const content = data.contentAnalysis;
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">H1 Tags</div>
                <div class="info-value">
                    ${content.h1Tags.length > 0 ? content.h1Tags.map(h => `• ${escapeHtml(h)}`).join('<br>') : 'No H1 tags found'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">H2 Tags (First 5)</div>
                <div class="info-value">
                    ${content.h2Tags.length > 0 ? content.h2Tags.slice(0, 5).map(h => `• ${escapeHtml(h)}`).join('<br>') : 'No H2 tags found'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Images</div>
                <div class="info-value">${content.imagesCount} images found</div>
            </div>
            <div class="info-item">
                <div class="info-label">Links</div>
                <div class="info-value">
                    Total: ${content.linksCount}<br>
                    Internal: ${content.internalLinks}<br>
                    External: ${content.externalLinks}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Word Count</div>
                <div class="info-value">${content.wordCount.toLocaleString()} words</div>
            </div>
            <div class="info-item">
                <div class="info-label">Media Content</div>
                <div class="info-value">
                    ${content.hasVideo ? '✓ Video' : '✗ No video'} | 
                    ${content.hasAudio ? '✓ Audio' : '✗ No audio'} | 
                    ${content.hasIframe ? '✓ Iframe' : '✗ No iframe'}
                </div>
            </div>
        </div>
    `;
}

function createRobotsSitemapHTML(data) {
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Robots.txt</div>
                <div class="info-value">
                    ${data.robotsTxt.exists ? 
                        `<span class="status-success">✓ Found</span><br>
                         <a href="${data.robotsTxt.url}" target="_blank">${data.robotsTxt.url}</a><br>
                         <details><summary>Preview</summary><pre style="margin-top: 10px; font-size: 0.75rem;">${escapeHtml(data.robotsTxt.content || '')}</pre></details>` : 
                        `<span class="status-warning">✗ Not found</span>`}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Sitemap</div>
                <div class="info-value">
                    ${data.sitemap.exists ? 
                        `<span class="status-success">✓ Found</span><br>
                         <a href="${data.sitemap.url}" target="_blank">${data.sitemap.url}</a><br>
                         ${data.sitemap.urlCount ? `URLs: ${data.sitemap.urlCount}` : ''}` : 
                        `<span class="status-warning">✗ Not found</span>`}
                </div>
            </div>
        </div>
    `;
}

function createStructuredDataHTML(data) {
    const sd = data.structuredData;
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">JSON-LD Found</div>
                <div class="info-value">
                    ${sd.jsonLdCount > 0 ? 
                        `<span class="status-success">✓ ${sd.jsonLdCount} items</span>` : 
                        `<span class="status-warning">✗ No structured data found</span>`}
                </div>
            </div>
            ${sd.jsonLdCount > 0 ? `
            <div class="info-item">
                <div class="info-label">Schema Types</div>
                <div class="info-value">${sd.jsonLdTypes.join(', ')}</div>
            </div>` : ''}
        </div>
    `;
}

function createRecommendationsHTML(data) {
    const rec = data.recommendations;
    
    if (rec.total === 0) {
        return '<div class="status-success">✓ Excellent! No major issues found.</div>';
    }
    
    return `
        <div class="info-item">
            <div class="info-label">Priority: ${rec.priority}</div>
            <div class="info-value">${rec.total} recommendations found</div>
        </div>
        ${rec.items.map(item => `<div class="recommendation-item">💡 ${item}</div>`).join('')}
    `;
}

function updateSummary(data) {
    const summaryDiv = document.getElementById('summary');
    const grade = data.securityHeaders?.grade || 'N/A';
    const sslValid = data.sslInfo?.valid ? '✓ SSL Valid' : '⚠️ SSL Issue';
    
    summaryDiv.innerHTML = `
        <span>🌐 ${data.domain}</span>
        <span class="${data.basicInfo.statusCode < 400 ? 'status-success' : 'status-error'}">
            ${data.basicInfo.statusCode} ${data.basicInfo.statusText}
        </span>
        <span>⏱️ ${data.responseTime}ms</span>
        <span>🔒 ${sslValid}</span>
        <span>🛡️ Security Grade: ${grade}</span>
        <span>📊 Recommendations: ${data.recommendations.total}</span>
    `;
}

function clearAll() {
    currentAnalysis = null;
    document.getElementById('analysisContent').innerHTML = '';
    document.getElementById('results').style.display = 'none';
    document.getElementById('empty').style.display = 'block';
    document.getElementById('singleUrl').value = '';
    document.getElementById('batchUrls').value = '';
    showNotification('All results cleared', 'info');
}

function loadExamples() {
    const examples = [
        'https://www.google.com',
        'https://github.com',
        'https://www.bbc.com',
        'https://www.cnn.com',
        'https://stackoverflow.com'
    ];
    document.getElementById('batchUrls').value = examples.join('\n');
    showNotification('Example URLs loaded', 'info');
}

function exportCSV() {
    if (!currentAnalysis) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const data = currentAnalysis;
    const rows = [
        ['Category', 'Field', 'Value'],
        ['Basic', 'URL', data.url],
        ['Basic', 'Status', `${data.basicInfo.statusCode} ${data.basicInfo.statusText}`],
        ['Basic', 'Response Time', `${data.responseTime}ms`],
        ['Meta', 'Title', data.metaData.title],
        ['Meta', 'Description', data.metaData.description],
        ['Meta', 'Canonical', data.metaData.canonical],
        ['Meta', 'AMP', data.metaData.amp],
        ['SSL', 'Valid', data.sslInfo.valid ? 'Yes' : 'No'],
        ['SSL', 'Days Remaining', data.sslInfo.daysRemaining || 'N/A'],
        ['Security', 'Grade', data.securityHeaders?.grade || 'N/A'],
        ['Content', 'Word Count', data.contentAnalysis.wordCount],
        ['Content', 'H1 Tags', data.contentAnalysis.h1Tags.length],
        ['SEO', 'Recommendations', data.recommendations.total]
    ];
    
    const csvContent = rows.map(row => row.join(',')).join('\n');
    downloadFile(csvContent, 'csv', `analysis-${data.domain}-${Date.now()}.csv`);
    showNotification('CSV exported successfully', 'success');
}

function exportJSON() {
    if (!currentAnalysis) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    downloadFile(JSON.stringify(currentAnalysis, null, 2), 'json', `analysis-${currentAnalysis.domain}-${Date.now()}.json`);
    showNotification('JSON exported successfully', 'success');
}

function printReport() {
    window.print();
}

function downloadFile(content, type, filename) {
    const mimeTypes = {
        csv: 'text/csv;charset=utf-8;',
        json: 'application/json;charset=utf-8;'
    };
    
    const blob = new Blob([content], { type: mimeTypes[type] });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const colors = {
        success: '#48bb78',
        error: '#f56565',
        warning: '#ed8936',
        info: '#4299e1'
    };
    
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${colors[type]};
        color: white;
        border-radius: 10px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-weight: 500;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '-';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Event listeners
document.getElementById('singleUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') checkSingle();
});

document.getElementById('detailedView').addEventListener('change', function() {
    if (currentAnalysis) displayAnalysis(currentAnalysis);
});

// Add notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

console.log('✅ Web Meta Analyzer Pro ready!');
console.log('Features: Meta Tags | SSL | DNS | Security | Social | AMP | SEO Recommendations');

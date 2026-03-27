let allAnalysisResults = []; // Store all results for batch mode
let currentAnalysisIndex = 0; // Track current displayed result
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
    
    // Reset results when switching tabs
    if (tab === 'single') {
        clearAll();
    }
}

async function checkSingle() {
    const url = document.getElementById('singleUrl').value.trim();
    if (!url) {
        showNotification('Please enter a URL', 'error');
        return;
    }
    
    // Clear previous results
    allAnalysisResults = [];
    currentAnalysisIndex = 0;
    
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
    
    // Clear previous results
    allAnalysisResults = [];
    currentAnalysisIndex = 0;
    
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
    
    allAnalysisResults = [];
    let completed = 0;
    let hasError = false;
    
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        loadingText.textContent = `Analyzing ${i + 1}/${urls.length}: ${url}`;
        progressBar.style.width = `${(i / urls.length) * 100}%`;
        
        const useProxy = document.getElementById('useProxy').checked;
        
        try {
            const result = await analyzeUrl(url, useProxy);
            allAnalysisResults.push(result);
        } catch (error) {
            hasError = true;
            console.error(`Error analyzing ${url}:`, error);
            // Push error result
            allAnalysisResults.push({
                url: url,
                domain: extractDomain(url),
                error: error.message,
                basicInfo: {
                    statusCode: 'Error',
                    statusText: error.message,
                    protocol: 'unknown'
                },
                timestamp: new Date().toISOString(),
                responseTime: 0
            });
        }
        
        completed++;
        
        // Update progress display
        const progressPercent = ((i + 1) / urls.length) * 100;
        progressBar.style.width = `${progressPercent}%`;
        loadingText.textContent = `Analyzing ${i + 1}/${urls.length}: ${url} - ${Math.round(progressPercent)}% complete`;
        
        // Small delay to avoid rate limiting
        if (i < urls.length - 1) {
            await delay(500);
        }
    }
    
    progressBar.style.width = '100%';
    loadingText.textContent = 'Complete! Loading results...';
    await delay(800);
    
    loading.style.display = 'none';
    
    if (allAnalysisResults.length > 0) {
        resultsDiv.style.display = 'block';
        // Display the first result
        currentAnalysisIndex = 0;
        displayCurrentAnalysis();
        displayBatchNavigation();
        updateSummaryForCurrent();
        
        const successCount = allAnalysisResults.filter(r => !r.error && r.basicInfo?.statusCode < 400).length;
        const errorCount = allAnalysisResults.filter(r => r.error || r.basicInfo?.statusCode >= 400).length;
        
        showNotification(`✅ Analysis completed! ${successCount} successful, ${errorCount} failed out of ${allAnalysisResults.length} URLs.`, 'success');
    } else {
        emptyDiv.style.display = 'block';
        showNotification('No results to display', 'warning');
    }
    
    isAnalyzing = false;
}

async function analyzeUrl(url, useProxy) {
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl, useProxy }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout (30 seconds)');
        }
        throw error;
    }
}

function extractDomain(url) {
    try {
        const domain = new URL(url).hostname;
        return domain;
    } catch (e) {
        return url;
    }
}

function displayCurrentAnalysis() {
    if (!allAnalysisResults.length || currentAnalysisIndex >= allAnalysisResults.length) {
        return;
    }
    
    const data = allAnalysisResults[currentAnalysisIndex];
    const detailedView = document.getElementById('detailedView').checked;
    
    // Check if there was an error
    if (data.error) {
        displayErrorResult(data);
        return;
    }
    
    const container = document.getElementById('analysisContent');
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
    
    // Add collapse functionality
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            content.classList.toggle('collapsed');
        });
    });
    
    updateSummaryForCurrent();
}

function displayErrorResult(data) {
    const container = document.getElementById('analysisContent');
    container.innerHTML = `
        <div class="analysis-section">
            <div class="section-header" style="background: #f56565;">
                <span>⚠️ Error Analyzing ${data.url}</span>
                <span>▼</span>
            </div>
            <div class="section-content">
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">URL</div>
                        <div class="info-value">${escapeHtml(data.url)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Error Message</div>
                        <div class="info-value status-error">${escapeHtml(data.error)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Possible Reasons</div>
                        <div class="info-value">
                            <ul style="margin-left: 20px;">
                                <li>Website is down or unreachable</li>
                                <li>Invalid URL format</li>
                                <li>Connection timeout</li>
                                <li>CORS restrictions</li>
                                <li>SSL certificate issues</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function displayBatchNavigation() {
    const container = document.getElementById('analysisContent');
    const totalUrls = allAnalysisResults.length;
    
    if (totalUrls <= 1) return;
    
    const navigationHtml = `
        <div class="batch-navigation" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        ">
            <div class="nav-info">
                <strong>📚 Batch Analysis Mode</strong> | 
                URL ${currentAnalysisIndex + 1} of ${totalUrls}
            </div>
            <div class="nav-controls" style="display: flex; gap: 10px;">
                <button onclick="navigateResult(-1)" ${currentAnalysisIndex === 0 ? 'disabled' : ''} style="
                    padding: 8px 16px;
                    background: rgba(255,255,255,0.2);
                    border: none;
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    ${currentAnalysisIndex === 0 ? 'opacity: 0.5; cursor: not-allowed;' : ''}
                ">
                    ◀ Previous
                </button>
                <span style="
                    padding: 8px 16px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 8px;
                ">
                    ${currentAnalysisIndex + 1} / ${totalUrls}
                </span>
                <button onclick="navigateResult(1)" ${currentAnalysisIndex === totalUrls - 1 ? 'disabled' : ''} style="
                    padding: 8px 16px;
                    background: rgba(255,255,255,0.2);
                    border: none;
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    ${currentAnalysisIndex === totalUrls - 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}
                ">
                    Next ▶
                </button>
            </div>
            <div class="quick-jump">
                <select id="quickJump" onchange="jumpToResult(this.value)" style="
                    padding: 8px;
                    border-radius: 8px;
                    border: none;
                    background: white;
                    color: #333;
                ">
                    <option value="">Quick jump to...</option>
                    ${allAnalysisResults.map((result, idx) => `
                        <option value="${idx}">
                            ${idx + 1}. ${result.domain || result.url.substring(0, 40)}
                            ${result.error ? '❌' : result.basicInfo?.statusCode < 400 ? '✓' : '⚠️'}
                        </option>
                    `).join('')}
                </select>
            </div>
        </div>
    `;
    
    // Prepend navigation to container
    const existingNav = document.querySelector('.batch-navigation');
    if (existingNav) {
        existingNav.remove();
    }
    container.insertAdjacentHTML('afterbegin', navigationHtml);
}

function navigateResult(direction) {
    const newIndex = currentAnalysisIndex + direction;
    if (newIndex >= 0 && newIndex < allAnalysisResults.length) {
        currentAnalysisIndex = newIndex;
        displayCurrentAnalysis();
        displayBatchNavigation();
        updateSummaryForCurrent();
        
        // Scroll to top
        document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
    }
}

function jumpToResult(index) {
    if (index !== '') {
        currentAnalysisIndex = parseInt(index);
        displayCurrentAnalysis();
        displayBatchNavigation();
        updateSummaryForCurrent();
        document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
    }
}

function updateSummaryForCurrent() {
    if (!allAnalysisResults.length || currentAnalysisIndex >= allAnalysisResults.length) return;
    
    const data = allAnalysisResults[currentAnalysisIndex];
    const summaryDiv = document.getElementById('summary');
    
    if (data.error) {
        summaryDiv.innerHTML = `
            <span>🌐 ${data.domain || data.url}</span>
            <span class="status-error">⚠️ Error: ${data.error}</span>
            <span>📊 ${currentAnalysisIndex + 1}/${allAnalysisResults.length} URLs</span>
        `;
        return;
    }
    
    const grade = data.securityHeaders?.grade || 'N/A';
    const sslValid = data.sslInfo?.valid ? '✓ SSL Valid' : (data.sslInfo?.error ? '⚠️ SSL Check Failed' : '⚠️ No SSL');
    const statusClass = data.basicInfo.statusCode < 400 ? 'status-success' : 'status-error';
    
    summaryDiv.innerHTML = `
        <span>🌐 ${data.domain}</span>
        <span class="${statusClass}">
            ${data.basicInfo.statusCode} ${data.basicInfo.statusText}
        </span>
        <span>⏱️ ${data.responseTime}ms</span>
        <span>🔒 ${sslValid}</span>
        <span>🛡️ Security: Grade ${grade}</span>
        <span>📊 Recommendations: ${data.recommendations?.total || 0}</span>
        <span>📚 URL ${currentAnalysisIndex + 1}/${allAnalysisResults.length}</span>
    `;
}

// Create section functions (same as before, but ensure they handle missing data)
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
                <div class="info-value">${data.domain || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Status Code</div>
                <div class="info-value ${data.basicInfo?.statusCode < 400 ? 'status-success' : 'status-error'}">
                    ${data.basicInfo?.statusCode || 'N/A'} ${data.basicInfo?.statusText || ''}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Response Time</div>
                <div class="info-value">${data.responseTime || 0} ms</div>
            </div>
            <div class="info-item">
                <div class="info-label">Protocol</div>
                <div class="info-value">${data.basicInfo?.protocol || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Using Proxy</div>
                <div class="info-value">${data.basicInfo?.usedProxy ? 'Yes' : 'No'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Analyzed At</div>
                <div class="info-value">${new Date(data.timestamp || Date.now()).toLocaleString()}</div>
            </div>
        </div>
    `;
}

function createMetaTagsHTML(data) {
    const meta = data.metaData || {};
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Title</div>
                <div class="info-value">${escapeHtml(meta.title || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Description</div>
                <div class="info-value">${escapeHtml(meta.description || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Keywords</div>
                <div class="info-value">${escapeHtml(meta.keywords || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Canonical URL</div>
                <div class="info-value">
                    ${meta.canonical && meta.canonical !== '-' ? `<a href="${meta.canonical}" target="_blank">${meta.canonical}</a>` : '-'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">AMP Version</div>
                <div class="info-value">
                    ${meta.amp && meta.amp !== '-' ? 
                        (meta.amp.includes('http') ? `<a href="${meta.amp}" target="_blank">${meta.amp}</a>` : 
                        `<span class="badge badge-success">${meta.amp}</span>`) : '-'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Robots</div>
                <div class="info-value">${meta.robots || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Viewport</div>
                <div class="info-value">${meta.viewport || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Charset</div>
                <div class="info-value">${meta.charset || '-'}</div>
            </div>
        </div>
    `;
}

function createOpenGraphHTML(data) {
    const og = data.openGraph || {};
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">OG Title</div>
                <div class="info-value">${escapeHtml(og.title || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">OG Description</div>
                <div class="info-value">${escapeHtml(og.description || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">OG Image</div>
                <div class="info-value">${og.image && og.image !== '-' ? `<a href="${og.image}" target="_blank">View Image</a>` : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">OG URL</div>
                <div class="info-value">${og.url && og.url !== '-' ? `<a href="${og.url}" target="_blank">${og.url}</a>` : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">OG Type</div>
                <div class="info-value">${og.type || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Site Name</div>
                <div class="info-value">${og.siteName || '-'}</div>
            </div>
        </div>
    `;
}

function createTwitterCardHTML(data) {
    const twitter = data.twitterCard || {};
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Twitter Card</div>
                <div class="info-value">${twitter.card || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Title</div>
                <div class="info-value">${escapeHtml(twitter.title || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Description</div>
                <div class="info-value">${escapeHtml(twitter.description || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Image</div>
                <div class="info-value">${twitter.image && twitter.image !== '-' ? `<a href="${twitter.image}" target="_blank">View Image</a>` : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Site</div>
                <div class="info-value">${twitter.site || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Twitter Creator</div>
                <div class="info-value">${twitter.creator || '-'}</div>
            </div>
        </div>
    `;
}

function createSSLHTML(data) {
    const ssl = data.sslInfo || {};
    if (ssl.error) {
        return `<div class="status-error">⚠️ ${ssl.error}</div>`;
    }
    
    if (!ssl.valid && !ssl.issuer) {
        return `<div class="status-warning">⚠️ SSL certificate not found or not accessible</div>`;
    }
    
    const daysClass = ssl.daysRemaining < 30 ? 'status-warning' : 'status-success';
    
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">SSL Valid</div>
                <div class="info-value ${ssl.valid ? 'status-success' : 'status-error'}">
                    ${ssl.valid ? '✓ Valid' : '✗ Invalid or Not Found'}
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
    const dns = data.dnsInfo || {};
    if (dns.error) {
        return `<div class="status-error">⚠️ ${dns.error}</div>`;
    }
    
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">A Records (IPv4)</div>
                <div class="info-value">${dns.a && dns.a.length > 0 ? dns.a.join(', ') : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">AAAA Records (IPv6)</div>
                <div class="info-value">${dns.aaaa && dns.aaaa.length > 0 ? dns.aaaa.join(', ') : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">MX Records</div>
                <div class="info-value">${dns.mx && dns.mx.length > 0 ? dns.mx.map(m => `${m.exchange} (priority ${m.priority})`).join(', ') : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">NS Records</div>
                <div class="info-value">${dns.ns && dns.ns.length > 0 ? dns.ns.join(', ') : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">CNAME</div>
                <div class="info-value">${dns.cname || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">TXT Records</div>
                <div class="info-value">${dns.txt && dns.txt.length > 0 ? dns.txt.slice(0, 3).join(', ') + (dns.txt.length > 3 ? '...' : '') : '-'}</div>
            </div>
        </div>
    `;
}

function createSecurityHeadersHTML(data) {
    const headers = data.securityHeaders || {};
    if (headers.error) {
        return `<div class="status-error">⚠️ ${headers.error}</div>`;
    }
    
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Security Grade</div>
                <div class="info-value">
                    <span class="badge ${headers.grade === 'A' ? 'badge-success' : headers.grade === 'F' ? 'badge-error' : 'badge-warning'}">
                        Grade ${headers.grade || 'N/A'} (${headers.score || 0}/100)
                    </span>
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">HSTS</div>
                <div class="info-value">${headers.headers?.strictTransportSecurity || 'Not Set'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">CSP</div>
                <div class="info-value">${headers.headers?.contentSecurityPolicy || 'Not Set'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">X-Frame-Options</div>
                <div class="info-value">${headers.headers?.xFrameOptions || 'Not Set'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">X-Content-Type-Options</div>
                <div class="info-value">${headers.headers?.xContentTypeOptions || 'Not Set'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">X-XSS-Protection</div>
                <div class="info-value">${headers.headers?.xXssProtection || 'Not Set'}</div>
            </div>
        </div>
    `;
}

function createContentAnalysisHTML(data) {
    const content = data.contentAnalysis || {};
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">H1 Tags</div>
                <div class="info-value">
                    ${content.h1Tags && content.h1Tags.length > 0 ? content.h1Tags.map(h => `• ${escapeHtml(h)}`).join('<br>') : 'No H1 tags found'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">H2 Tags (First 5)</div>
                <div class="info-value">
                    ${content.h2Tags && content.h2Tags.length > 0 ? content.h2Tags.slice(0, 5).map(h => `• ${escapeHtml(h)}`).join('<br>') : 'No H2 tags found'}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Images</div>
                <div class="info-value">${content.imagesCount || 0} images found</div>
            </div>
            <div class="info-item">
                <div class="info-label">Links</div>
                <div class="info-value">
                    Total: ${content.linksCount || 0}<br>
                    Internal: ${content.internalLinks || 0}<br>
                    External: ${content.externalLinks || 0}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Word Count</div>
                <div class="info-value">${(content.wordCount || 0).toLocaleString()} words</div>
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
    const robots = data.robotsTxt || {};
    const sitemap = data.sitemap || {};
    return `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Robots.txt</div>
                <div class="info-value">
                    ${robots.exists ? 
                        `<span class="status-success">✓ Found</span><br>
                         <a href="${robots.url || '#'}" target="_blank">${robots.url || '-'}</a><br>
                         ${robots.content ? `<details><summary>Preview</summary><pre style="margin-top: 10px; font-size: 0.75rem; max-height: 200px; overflow: auto;">${escapeHtml(robots.content)}</pre></details>` : ''}` : 
                        `<span class="status-warning">✗ Not found</span>`}
                </div>
            </div>
            <div class="info-item">
                <div class="info-label">Sitemap</div>
                <div class="info-value">
                    ${sitemap.exists ? 
                        `<span class="status-success">✓ Found</span><br>
                         <a href="${sitemap.url || '#'}" target="_blank">${sitemap.url || '-'}</a><br>
                         ${sitemap.urlCount ? `URLs: ${sitemap.urlCount}` : ''}` : 
                        `<span class="status-warning">✗ Not found</span>`}
                </div>
            </div>
        </div>
    `;
}

function createStructuredDataHTML(data) {
    const sd = data.structuredData || {};
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
                <div class="info-value">${sd.jsonLdTypes ? sd.jsonLdTypes.join(', ') : '-'}</div>
            </div>` : ''}
        </div>
    `;
}

function createRecommendationsHTML(data) {
    const rec = data.recommendations || {};
    
    if (rec.total === 0) {
        return '<div class="status-success">✓ Excellent! No major issues found.</div>';
    }
    
    return `
        <div class="info-item" style="margin-bottom: 15px;">
            <div class="info-label">Priority: ${rec.priority || 'Medium'}</div>
            <div class="info-value">${rec.total || 0} recommendations found</div>
        </div>
        ${rec.items && rec.items.length > 0 ? rec.items.map(item => `<div class="recommendation-item">💡 ${escapeHtml(item)}</div>`).join('') : '<div>No specific recommendations</div>'}
    `;
}

function clearAll() {
    allAnalysisResults = [];
    currentAnalysisIndex = 0;
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
    showNotification('Example URLs loaded. Click "Analyze All" to start.', 'info');
}

function exportCSV() {
    if (allAnalysisResults.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const rows = [['No', 'URL', 'Domain', 'Status', 'Response Time', 'Title', 'SSL Valid', 'Security Grade', 'Recommendations']];
    
    allAnalysisResults.forEach((result, idx) => {
        if (result.error) {
            rows.push([
                idx + 1,
                result.url,
                result.domain || '-',
                'Error',
                '-',
                '-',
                '-',
                '-',
                result.error
            ]);
        } else {
            rows.push([
                idx + 1,
                result.url,
                result.domain || '-',
                `${result.basicInfo?.statusCode || '-'} ${result.basicInfo?.statusText || ''}`,
                `${result.responseTime || 0}ms`,
                `"${(result.metaData?.title || '-').replace(/"/g, '""')}"`,
                result.sslInfo?.valid ? 'Yes' : 'No',
                result.securityHeaders?.grade || 'N/A',
                result.recommendations?.total || 0
            ]);
        }
    });
    
    const csvContent = rows.map(row => row.join(',')).join('\n');
    downloadFile(csvContent, 'csv', `batch-analysis-${Date.now()}.csv`);
    showNotification(`CSV exported with ${allAnalysisResults.length} URLs`, 'success');
}

function exportJSON() {
    if (allAnalysisResults.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const exportData = allAnalysisResults.map((result, idx) => ({
        no: idx + 1,
        ...result
    }));
    
    downloadFile(JSON.stringify(exportData, null, 2), 'json', `batch-analysis-${Date.now()}.json`);
    showNotification(`JSON exported with ${allAnalysisResults.length} URLs`, 'success');
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
        max-width: 400px;
        word-break: break-word;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
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

// Add CSS for batch navigation print support
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
    
    @media print {
        .batch-navigation, .export-buttons, .options, .tabs, .btn-clear {
            display: none !important;
        }
        .analysis-section {
            break-inside: avoid;
            page-break-inside: avoid;
        }
        body {
            background: white;
            padding: 0;
        }
        .card, .results {
            box-shadow: none;
            padding: 0;
        }
    }
    
    .badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 5px;
        font-size: 0.75rem;
        font-weight: 500;
    }
    
    .badge-success {
        background: #48bb78;
        color: white;
    }
    
    .badge-warning {
        background: #ed8936;
        color: white;
    }
    
    .badge-error {
        background: #f56565;
        color: white;
    }
    
    .recommendation-item {
        padding: 10px;
        margin: 5px 0;
        background: #fff3e0;
        border-left: 3px solid #ed8936;
        border-radius: 5px;
    }
`;
document.head.appendChild(style);

// Event listeners
document.getElementById('singleUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') checkSingle();
});

document.getElementById('detailedView').addEventListener('change', function() {
    if (allAnalysisResults.length > 0 && currentAnalysisIndex < allAnalysisResults.length) {
        displayCurrentAnalysis();
        displayBatchNavigation();
    }
});

console.log('✅ Web Meta Analyzer Pro ready!');
console.log('Features: Single URL | Batch URLs | SSL | DNS | Security | Social | AMP | SEO');
console.log('Batch mode: All URLs are analyzed and can be navigated using Previous/Next buttons');

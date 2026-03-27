let allAnalysisResults = [];
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
    
    allAnalysisResults = [];
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
    
    if (urls.length > 1000) {
        showNotification('Maximum 1000 URLs allowed. Please reduce the number.', 'warning');
        return;
    }
    
    allAnalysisResults = [];
    await analyzeUrls(urls);
}

async function analyzeUrls(urls) {
    if (isAnalyzing) {
        showNotification('Already analyzing, please wait...', 'warning');
        return;
    }
    
    isAnalyzing = true;
    const loading = document.getElementById('loading');
    const resultsContainer = document.getElementById('resultsContainer');
    const emptyDiv = document.getElementById('empty');
    const exportButtons = document.getElementById('exportButtons');
    const loadingText = document.getElementById('loadingText');
    const progressBar = document.getElementById('progressBar');
    const progressCount = document.getElementById('progressCount');
    
    loading.style.display = 'block';
    resultsContainer.style.display = 'none';
    emptyDiv.style.display = 'none';
    exportButtons.style.display = 'none';
    
    allAnalysisResults = [];
    let completed = 0;
    
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        loadingText.textContent = `Analyzing URL ${i + 1} of ${urls.length}`;
        progressCount.textContent = `${i + 1} / ${urls.length} URLs processed`;
        progressBar.style.width = `${(i / urls.length) * 100}%`;
        
        const useProxy = document.getElementById('useProxy').checked;
        
        try {
            const result = await analyzeUrl(url, useProxy);
            allAnalysisResults.push(result);
        } catch (error) {
            console.error(`Error analyzing ${url}:`, error);
            allAnalysisResults.push({
                url: url,
                domain: extractDomain(url),
                error: error.message,
                basicInfo: {
                    statusCode: 'Error',
                    statusText: error.message
                },
                metaData: {
                    title: 'Failed to fetch',
                    canonical: '-',
                    amp: '-'
                },
                timestamp: new Date().toISOString()
            });
        }
        
        completed++;
        
        // Update table in real-time
        renderResultsTable();
        
        // Small delay to avoid rate limiting
        if (i < urls.length - 1) {
            await delay(300);
        }
    }
    
    progressBar.style.width = '100%';
    loadingText.textContent = 'Complete! Loading results...';
    await delay(500);
    
    loading.style.display = 'none';
    
    if (allAnalysisResults.length > 0) {
        resultsContainer.style.display = 'block';
        exportButtons.style.display = 'flex';
        renderResultsTable();
        updateStatsSummary();
        
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

function renderResultsTable() {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = '';
    
    allAnalysisResults.forEach((result, index) => {
        const row = tbody.insertRow();
        
        // No
        row.insertCell(0).textContent = index + 1;
        
        // Domain / URL
        const urlCell = row.insertCell(1);
        urlCell.className = 'url-cell';
        const displayUrl = result.domain || result.url;
        const shortUrl = displayUrl.length > 50 ? displayUrl.substring(0, 47) + '...' : displayUrl;
        urlCell.innerHTML = `<a href="${result.url}" target="_blank" onclick="event.stopPropagation()" title="${displayUrl}">${shortUrl}</a>`;
        
        // Status
        const statusCell = row.insertCell(2);
        if (result.error) {
            statusCell.innerHTML = `<span class="status-badge status-error">Error</span>`;
        } else if (result.basicInfo?.statusCode < 400) {
            statusCell.innerHTML = `<span class="status-badge status-success">${result.basicInfo.statusCode}</span>`;
        } else {
            statusCell.innerHTML = `<span class="status-badge status-error">${result.basicInfo.statusCode}</span>`;
        }
        
        // Title
        const titleCell = row.insertCell(3);
        titleCell.className = 'title-cell';
        const title = result.metaData?.title || (result.error ? 'Failed to fetch' : 'No title');
        titleCell.textContent = title.length > 80 ? title.substring(0, 77) + '...' : title;
        titleCell.title = title;
        
        // Canonical URL
        const canonicalCell = row.insertCell(4);
        canonicalCell.className = 'canonical-cell';
        const canonical = result.metaData?.canonical || '-';
        canonicalCell.textContent = canonical !== '-' && canonical.length > 70 ? canonical.substring(0, 67) + '...' : canonical;
        canonicalCell.title = canonical;
        
        // AMP Version
        const ampCell = row.insertCell(5);
        ampCell.className = 'amp-cell';
        const amp = result.metaData?.amp || '-';
        if (amp !== '-' && amp.includes('http')) {
            ampCell.innerHTML = `<a href="${amp}" target="_blank" onclick="event.stopPropagation()" title="${amp}">AMP Link</a>`;
        } else {
            ampCell.textContent = amp.length > 40 ? amp.substring(0, 37) + '...' : amp;
            ampCell.title = amp;
        }
        
        // Action Button
        const actionCell = row.insertCell(6);
        actionCell.innerHTML = `<button class="view-details-btn" onclick="openDetails(${index})">📋 Details</button>`;
        
        // Add click handler for row
        row.style.cursor = 'pointer';
        row.onclick = () => openDetails(index);
    });
}

function updateStatsSummary() {
    const total = allAnalysisResults.length;
    const success = allAnalysisResults.filter(r => !r.error && r.basicInfo?.statusCode < 400).length;
    const error = allAnalysisResults.filter(r => r.error || r.basicInfo?.statusCode >= 400).length;
    const withCanonical = allAnalysisResults.filter(r => r.metaData?.canonical && r.metaData.canonical !== '-').length;
    const withAmp = allAnalysisResults.filter(r => r.metaData?.amp && r.metaData.amp !== '-').length;
    
    const statsDiv = document.getElementById('statsSummary');
    statsDiv.innerHTML = `
        <span>📊 Total: ${total}</span>
        <span style="color: #48bb78;">✓ Success: ${success}</span>
        <span style="color: #f56565;">✗ Failed: ${error}</span>
        <span>🔗 Canonical: ${withCanonical}</span>
        <span>⚡ AMP: ${withAmp}</span>
    `;
}

async function openDetails(index) {
    const result = allAnalysisResults[index];
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = `Details: ${result.domain || result.url}`;
    modalBody.innerHTML = '<div class="loading-spinner">Loading details...</div>';
    modal.style.display = 'block';
    
    // If result already has full data, display immediately
    if (!result.error && result.sslInfo !== undefined) {
        renderModalDetails(result, modalBody);
    } else if (!result.error && !result.sslInfo) {
        // Fetch full details if not already fetched
        try {
            const fullResult = await analyzeUrl(result.url, true);
            allAnalysisResults[index] = fullResult;
            renderModalDetails(fullResult, modalBody);
            renderResultsTable(); // Update table with any new data
        } catch (error) {
            modalBody.innerHTML = `
                <div class="status-error" style="padding: 20px; text-align: center;">
                    ⚠️ Failed to load details: ${error.message}
                </div>
            `;
        }
    } else {
        renderModalDetails(result, modalBody);
    }
}

function renderModalDetails(data, container) {
    if (data.error) {
        container.innerHTML = `
            <div class="status-error" style="padding: 20px; text-align: center;">
                <h3>⚠️ Error Analyzing ${data.url}</h3>
                <p>${data.error}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        ${createModalSection('Basic Information', createBasicInfoHTML(data), true)}
        ${createModalSection('Meta Tags', createMetaTagsHTML(data), true)}
        ${createModalSection('Open Graph Tags (Facebook/Social)', createOpenGraphHTML(data), true)}
        ${createModalSection('Twitter Card Tags', createTwitterCardHTML(data), true)}
        ${createModalSection('SSL Certificate', createSSLHTML(data), true)}
        ${createModalSection('DNS Records', createDNSHTML(data), true)}
        ${createModalSection('Security Headers', createSecurityHeadersHTML(data), true)}
        ${createModalSection('Content Analysis', createContentAnalysisHTML(data), true)}
        ${createModalSection('Robots.txt & Sitemap', createRobotsSitemapHTML(data), true)}
        ${createModalSection('Structured Data', createStructuredDataHTML(data), true)}
        ${createModalSection('SEO Recommendations', createRecommendationsHTML(data), true)}
    `;
    
    // Add collapse functionality
    document.querySelectorAll('.modal-section-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            content.classList.toggle('collapsed');
        });
    });
}

function createModalSection(title, content, isOpen = true) {
    return `
        <div class="modal-section">
            <div class="modal-section-header">
                <span>${title}</span>
                <span>▼</span>
            </div>
            <div class="modal-section-content ${!isOpen ? 'collapsed' : ''}">
                ${content}
            </div>
        </div>
    `;
}

function createBasicInfoHTML(data) {
    return `
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">URL</div>
                <div class="modal-info-value"><a href="${data.url}" target="_blank">${data.url}</a></div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Domain</div>
                <div class="modal-info-value">${data.domain || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Status Code</div>
                <div class="modal-info-value ${data.basicInfo?.statusCode < 400 ? 'status-success' : 'status-error'}">
                    ${data.basicInfo?.statusCode || 'N/A'} ${data.basicInfo?.statusText || ''}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Response Time</div>
                <div class="modal-info-value">${data.responseTime || 0} ms</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Protocol</div>
                <div class="modal-info-value">${data.basicInfo?.protocol || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Using Proxy</div>
                <div class="modal-info-value">${data.basicInfo?.usedProxy ? 'Yes' : 'No'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Analyzed At</div>
                <div class="modal-info-value">${new Date(data.timestamp || Date.now()).toLocaleString()}</div>
            </div>
        </div>
    `;
}

function createMetaTagsHTML(data) {
    const meta = data.metaData || {};
    return `
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">Title</div>
                <div class="modal-info-value">${escapeHtml(meta.title || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Description</div>
                <div class="modal-info-value">${escapeHtml(meta.description || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Keywords</div>
                <div class="modal-info-value">${escapeHtml(meta.keywords || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Canonical URL</div>
                <div class="modal-info-value">
                    ${meta.canonical && meta.canonical !== '-' ? `<a href="${meta.canonical}" target="_blank">${meta.canonical}</a>` : '-'}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">AMP Version</div>
                <div class="modal-info-value">
                    ${meta.amp && meta.amp !== '-' ? 
                        (meta.amp.includes('http') ? `<a href="${meta.amp}" target="_blank">${meta.amp}</a>` : 
                        `<span class="badge badge-success">${meta.amp}</span>`) : '-'}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Robots</div>
                <div class="modal-info-value">${meta.robots || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Viewport</div>
                <div class="modal-info-value">${meta.viewport || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Charset</div>
                <div class="modal-info-value">${meta.charset || '-'}</div>
            </div>
        </div>
    `;
}

function createOpenGraphHTML(data) {
    const og = data.openGraph || {};
    return `
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">OG Title</div>
                <div class="modal-info-value">${escapeHtml(og.title || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">OG Description</div>
                <div class="modal-info-value">${escapeHtml(og.description || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">OG Image</div>
                <div class="modal-info-value">${og.image && og.image !== '-' ? `<a href="${og.image}" target="_blank">View Image</a>` : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">OG URL</div>
                <div class="modal-info-value">${og.url && og.url !== '-' ? `<a href="${og.url}" target="_blank">${og.url}</a>` : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">OG Type</div>
                <div class="modal-info-value">${og.type || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Site Name</div>
                <div class="modal-info-value">${og.siteName || '-'}</div>
            </div>
        </div>
    `;
}

function createTwitterCardHTML(data) {
    const twitter = data.twitterCard || {};
    return `
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">Twitter Card</div>
                <div class="modal-info-value">${twitter.card || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Twitter Title</div>
                <div class="modal-info-value">${escapeHtml(twitter.title || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Twitter Description</div>
                <div class="modal-info-value">${escapeHtml(twitter.description || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Twitter Image</div>
                <div class="modal-info-value">${twitter.image && twitter.image !== '-' ? `<a href="${twitter.image}" target="_blank">View Image</a>` : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Twitter Site</div>
                <div class="modal-info-value">${twitter.site || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Twitter Creator</div>
                <div class="modal-info-value">${twitter.creator || '-'}</div>
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
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">SSL Valid</div>
                <div class="modal-info-value ${ssl.valid ? 'status-success' : 'status-error'}">
                    ${ssl.valid ? '✓ Valid' : '✗ Invalid or Not Found'}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Issuer</div>
                <div class="modal-info-value">${ssl.issuer || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Subject</div>
                <div class="modal-info-value">${ssl.subject || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Valid From</div>
                <div class="modal-info-value">${ssl.validFrom || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Valid To</div>
                <div class="modal-info-value">${ssl.validTo || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Days Remaining</div>
                <div class="modal-info-value ${daysClass}">${ssl.daysRemaining || 0} days</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Protocol</div>
                <div class="modal-info-value">${ssl.protocol || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Cipher</div>
                <div class="modal-info-value">${ssl.cipher || '-'}</div>
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
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">A Records (IPv4)</div>
                <div class="modal-info-value">${dns.a && dns.a.length > 0 ? dns.a.join(', ') : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">AAAA Records (IPv6)</div>
                <div class="modal-info-value">${dns.aaaa && dns.aaaa.length > 0 ? dns.aaaa.join(', ') : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">MX Records</div>
                <div class="modal-info-value">${dns.mx && dns.mx.length > 0 ? dns.mx.map(m => `${m.exchange} (priority ${m.priority})`).join(', ') : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">NS Records</div>
                <div class="modal-info-value">${dns.ns && dns.ns.length > 0 ? dns.ns.join(', ') : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">CNAME</div>
                <div class="modal-info-value">${dns.cname || '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">TXT Records</div>
                <div class="modal-info-value">${dns.txt && dns.txt.length > 0 ? dns.txt.slice(0, 3).join(', ') + (dns.txt.length > 3 ? '...' : '') : '-'}</div>
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
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">Security Grade</div>
                <div class="modal-info-value">
                    <span class="badge ${headers.grade === 'A' ? 'badge-success' : headers.grade === 'F' ? 'badge-error' : 'badge-warning'}">
                        Grade ${headers.grade || 'N/A'} (${headers.score || 0}/100)
                    </span>
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">HSTS</div>
                <div class="modal-info-value">${headers.headers?.strictTransportSecurity || 'Not Set'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">CSP</div>
                <div class="modal-info-value">${headers.headers?.contentSecurityPolicy || 'Not Set'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">X-Frame-Options</div>
                <div class="modal-info-value">${headers.headers?.xFrameOptions || 'Not Set'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">X-Content-Type-Options</div>
                <div class="modal-info-value">${headers.headers?.xContentTypeOptions || 'Not Set'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">X-XSS-Protection</div>
                <div class="modal-info-value">${headers.headers?.xXssProtection || 'Not Set'}</div>
            </div>
        </div>
    `;
}

function createContentAnalysisHTML(data) {
    const content = data.contentAnalysis || {};
    return `
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">H1 Tags</div>
                <div class="modal-info-value">
                    ${content.h1Tags && content.h1Tags.length > 0 ? content.h1Tags.map(h => `• ${escapeHtml(h)}`).join('<br>') : 'No H1 tags found'}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">H2 Tags (First 5)</div>
                <div class="modal-info-value">
                    ${content.h2Tags && content.h2Tags.length > 0 ? content.h2Tags.slice(0, 5).map(h => `• ${escapeHtml(h)}`).join('<br>') : 'No H2 tags found'}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Images</div>
                <div class="modal-info-value">${content.imagesCount || 0} images found</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Links</div>
                <div class="modal-info-value">
                    Total: ${content.linksCount || 0}<br>
                    Internal: ${content.internalLinks || 0}<br>
                    External: ${content.externalLinks || 0}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Word Count</div>
                <div class="modal-info-value">${(content.wordCount || 0).toLocaleString()} words</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Media Content</div>
                <div class="modal-info-value">
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
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">Robots.txt</div>
                <div class="modal-info-value">
                    ${robots.exists ? 
                        `<span class="status-success">✓ Found</span><br>
                         <a href="${robots.url || '#'}" target="_blank">${robots.url || '-'}</a><br>
                         ${robots.content ? `<details><summary>Preview</summary><pre style="margin-top: 10px; font-size: 0.75rem; max-height: 200px; overflow: auto;">${escapeHtml(robots.content)}</pre></details>` : ''}` : 
                        `<span class="status-warning">✗ Not found</span>`}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Sitemap</div>
                <div class="modal-info-value">
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
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">JSON-LD Found</div>
                <div class="modal-info-value">
                    ${sd.jsonLdCount > 0 ? 
                        `<span class="status-success">✓ ${sd.jsonLdCount} items</span>` : 
                        `<span class="status-warning">✗ No structured data found</span>`}
                </div>
            </div>
            ${sd.jsonLdCount > 0 ? `
            <div class="modal-info-item">
                <div class="modal-info-label">Schema Types</div>
                <div class="modal-info-value">${sd.jsonLdTypes ? sd.jsonLdTypes.join(', ') : '-'}</div>
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
        <div class="modal-info-item" style="margin-bottom: 15px;">
            <div class="modal-info-label">Priority: ${rec.priority || 'Medium'}</div>
            <div class="modal-info-value">${rec.total || 0} recommendations found</div>
        </div>
        ${rec.items && rec.items.length > 0 ? rec.items.map(item => `<div class="recommendation-item">💡 ${escapeHtml(item)}</div>`).join('') : '<div>No specific recommendations</div>'}
    `;
}

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

function clearAll() {
    allAnalysisResults = [];
    document.getElementById('resultsTableBody').innerHTML = '';
    document.getElementById('resultsContainer').style.display = 'none';
    document.getElementById('empty').style.display = 'block';
    document.getElementById('exportButtons').style.display = 'none';
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
        'https://stackoverflow.com',
        'https://www.wikipedia.org',
        'https://www.amazon.com',
        'https://www.netflix.com'
    ];
    document.getElementById('batchUrls').value = examples.join('\n');
    showNotification('Example URLs loaded. Click "Analyze All URLs" to start.', 'info');
}

function exportToCSV() {
    if (allAnalysisResults.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const rows = [['No', 'URL', 'Domain', 'Status', 'Title', 'Canonical URL', 'AMP', 'Response Time']];
    
    allAnalysisResults.forEach((result, idx) => {
        if (result.error) {
            rows.push([
                idx + 1,
                result.url,
                result.domain || '-',
                'Error',
                'Failed to fetch',
                '-',
                '-',
                '-'
            ]);
        } else {
            rows.push([
                idx + 1,
                result.url,
                result.domain || '-',
                `${result.basicInfo?.statusCode || '-'} ${result.basicInfo?.statusText || ''}`,
                `"${(result.metaData?.title || '-').replace(/"/g, '""')}"`,
                result.metaData?.canonical || '-',
                result.metaData?.amp || '-',
                `${result.responseTime || 0}ms`
            ]);
        }
    });
    
    const csvContent = rows.map(row => row.join(',')).join('\n');
    downloadFile(csvContent, 'csv', `batch-analysis-${Date.now()}.csv`);
    showNotification(`CSV exported with ${allAnalysisResults.length} URLs`, 'success');
}

function exportToJSON() {
    if (allAnalysisResults.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const exportData = allAnalysisResults.map((result, idx) => ({
        no: idx + 1,
        url: result.url,
        domain: result.domain,
        status: result.error ? 'Error' : `${result.basicInfo?.statusCode} ${result.basicInfo?.statusText}`,
        title: result.metaData?.title || (result.error ? 'Failed to fetch' : '-'),
        canonical: result.metaData?.canonical || '-',
        amp: result.metaData?.amp || '-',
        responseTime: result.responseTime || 0,
        error: result.error || null,
        timestamp: result.timestamp
    }));
    
    downloadFile(JSON.stringify(exportData, null, 2), 'json', `batch-analysis-${Date.now()}.json`);
    showNotification(`JSON exported with ${allAnalysisResults.length} URLs`, 'success');
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

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('detailModal');
    if (event.target === modal) {
        closeModal();
    }
};

// Add CSS animations
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

console.log('✅ Web Meta Analyzer Pro ready!');
console.log('Features: Batch URL Analysis | Table View | Modal Details | Export CSV/JSON');

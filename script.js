let allAnalysisResults = [];
let isAnalyzing = false;

const API_URL = '/api/check-domain';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    
    // Initialize event listeners for tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            const tab = this.getAttribute('data-tab');
            if (tab) {
                switchTab(tab);
            }
        });
    });
    
    // Initialize event listeners for inputs
    const singleUrlInput = document.getElementById('singleUrl');
    if (singleUrlInput) {
        singleUrlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') checkSingle();
        });
    }
    
    // Initialize URL counter for batch textarea
    const batchUrlsTextarea = document.getElementById('batchUrls');
    const urlCounter = document.getElementById('urlCounter');
    if (batchUrlsTextarea && urlCounter) {
        batchUrlsTextarea.addEventListener('input', function() {
            const urls = this.value.split('\n').filter(u => u.trim() && !u.startsWith('#')).length;
            urlCounter.textContent = `${urls} URL${urls !== 1 ? 's' : ''}`;
        });
    }
});

function switchTab(tab) {
    const singleTab = document.getElementById('singleTab');
    const batchTab = document.getElementById('batchTab');
    const singleBtn = document.querySelector('.tab-btn[data-tab="single"]');
    const batchBtn = document.querySelector('.tab-btn[data-tab="batch"]');
    
    if (tab === 'single') {
        if (singleBtn) singleBtn.classList.add('active');
        if (batchBtn) batchBtn.classList.remove('active');
        if (singleTab) singleTab.classList.add('active');
        if (batchTab) batchTab.classList.remove('active');
    } else if (tab === 'batch') {
        if (singleBtn) singleBtn.classList.remove('active');
        if (batchBtn) batchBtn.classList.add('active');
        if (singleTab) singleTab.classList.remove('active');
        if (batchTab) batchTab.classList.add('active');
    }
}

async function checkSingle() {
    const urlInput = document.getElementById('singleUrl');
    if (!urlInput) return;
    
    const url = urlInput.value.trim();
    if (!url) {
        showNotification('Please enter a URL', 'error');
        return;
    }
    
    allAnalysisResults = [];
    await analyzeUrls([url]);
}

async function checkBatch() {
    console.log('checkBatch called'); // Debug log
    const batchUrlsTextarea = document.getElementById('batchUrls');
    if (!batchUrlsTextarea) {
        console.error('batchUrls textarea not found');
        return;
    }
    
    const urlsText = batchUrlsTextarea.value;
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
    
    // Get DOM elements with null checks
    const loading = document.getElementById('loading');
    const resultsContainer = document.getElementById('resultsContainer');
    const emptyDiv = document.getElementById('empty');
    const exportButtons = document.getElementById('exportButtons');
    const loadingText = document.getElementById('loadingText');
    const progressBar = document.getElementById('progressBar');
    const progressCount = document.getElementById('progressCount');
    
    // Hide/show elements safely
    if (loading) loading.style.display = 'flex';
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (emptyDiv) emptyDiv.style.display = 'none';
    if (exportButtons) exportButtons.style.display = 'none';
    
    allAnalysisResults = [];
    let completed = 0;
    
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        
        // Update loading text safely
        if (loadingText) loadingText.textContent = `Analyzing URL ${i + 1} of ${urls.length}`;
        if (progressCount) progressCount.textContent = `${i + 1} / ${urls.length} URLs processed`;
        if (progressBar) progressBar.style.width = `${((i + 1) / urls.length) * 100}%`;
        
        const useProxyCheckbox = document.getElementById('useProxy');
        const useProxy = useProxyCheckbox ? useProxyCheckbox.checked : true;
        
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
            await delay(500);
        }
    }
    
    // Update progress to 100%
    if (progressBar) progressBar.style.width = '100%';
    if (loadingText) loadingText.textContent = 'Complete! Loading results...';
    await delay(500);
    
    // Hide loading, show results
    if (loading) loading.style.display = 'none';
    
    if (allAnalysisResults.length > 0) {
        if (resultsContainer) resultsContainer.style.display = 'block';
        if (exportButtons) exportButtons.style.display = 'flex';
        renderResultsTable();
        updateStatsSummary();
        
        const successCount = allAnalysisResults.filter(r => !r.error && r.basicInfo?.statusCode < 400).length;
        const errorCount = allAnalysisResults.filter(r => r.error || r.basicInfo?.statusCode >= 400).length;
        
        showNotification(`✅ Analysis completed! ${successCount} successful, ${errorCount} failed out of ${allAnalysisResults.length} URLs.`, 'success');
    } else {
        if (emptyDiv) emptyDiv.style.display = 'block';
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
    if (!tbody) return;
    
    // Clear placeholder if exists
    if (allAnalysisResults.length === 0) {
        tbody.innerHTML = '';
        return;
    }
    
    tbody.innerHTML = '';
    
    allAnalysisResults.forEach((result, index) => {
        const row = tbody.insertRow();
        
        // No
        const noCell = row.insertCell(0);
        noCell.textContent = index + 1;
        
        // Domain / URL
        const urlCell = row.insertCell(1);
        urlCell.className = 'url-cell';
        const displayUrl = result.domain || result.url;
        const shortUrl = displayUrl.length > 50 ? displayUrl.substring(0, 47) + '...' : displayUrl;
        urlCell.innerHTML = `<a href="${escapeHtml(result.url)}" target="_blank" onclick="event.stopPropagation()" title="${escapeHtml(displayUrl)}">${escapeHtml(shortUrl)}</a>`;
        
        // Status
        const statusCell = row.insertCell(2);
        if (result.error) {
            statusCell.innerHTML = `<span class="status-badge error">Error</span>`;
        } else if (result.basicInfo?.statusCode < 400) {
            statusCell.innerHTML = `<span class="status-badge success">${result.basicInfo.statusCode}</span>`;
        } else {
            statusCell.innerHTML = `<span class="status-badge error">${result.basicInfo.statusCode}</span>`;
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
            ampCell.innerHTML = `<a href="${escapeHtml(amp)}" target="_blank" onclick="event.stopPropagation()" title="${escapeHtml(amp)}">AMP Link</a>`;
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
    const statsDiv = document.getElementById('statsSummary');
    if (!statsDiv) return;
    
    const total = allAnalysisResults.length;
    const success = allAnalysisResults.filter(r => !r.error && r.basicInfo?.statusCode < 400).length;
    const error = allAnalysisResults.filter(r => r.error || r.basicInfo?.statusCode >= 400).length;
    const withCanonical = allAnalysisResults.filter(r => r.metaData?.canonical && r.metaData.canonical !== '-').length;
    const withAmp = allAnalysisResults.filter(r => r.metaData?.amp && r.metaData.amp !== '-').length;
    
    statsDiv.innerHTML = `
        <div class="stat-card"><i class="fas fa-chart-line"></i> Total: ${total}</div>
        <div class="stat-card"><i class="fas fa-check-circle" style="color: #10b981;"></i> Success: ${success}</div>
        <div class="stat-card"><i class="fas fa-times-circle" style="color: #ef4444;"></i> Failed: ${error}</div>
        <div class="stat-card"><i class="fas fa-link"></i> Canonical: ${withCanonical}</div>
        <div class="stat-card"><i class="fas fa-bolt"></i> AMP: ${withAmp}</div>
    `;
}

async function openDetails(index) {
    if (!allAnalysisResults[index]) return;
    
    const result = allAnalysisResults[index];
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    modalTitle.innerHTML = `<i class="fas fa-chart-pie"></i> Details: ${escapeHtml(result.domain || result.url)}`;
    modalBody.innerHTML = '<div class="modal-loading"><div class="loading-spinner-small"></div><p>Loading comprehensive analysis...</p></div>';
    modal.style.display = 'flex';
    
    // If result already has full data, display immediately
    if (!result.error && result.sslInfo !== undefined) {
        renderModalDetails(result, modalBody);
    } else if (!result.error && !result.sslInfo) {
        // Fetch full details if not already fetched
        try {
            const useProxyCheckbox = document.getElementById('useProxy');
            const useProxy = useProxyCheckbox ? useProxyCheckbox.checked : true;
            const fullResult = await analyzeUrl(result.url, useProxy);
            allAnalysisResults[index] = fullResult;
            renderModalDetails(fullResult, modalBody);
            renderResultsTable(); // Update table with any new data
        } catch (error) {
            modalBody.innerHTML = `
                <div class="error-state" style="padding: 40px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px; display: block;"></i>
                    <h3>Failed to Load Details</h3>
                    <p>${escapeHtml(error.message)}</p>
                    <button onclick="closeModal()" class="btn-primary" style="margin-top: 20px;">Close</button>
                </div>
            `;
        }
    } else {
        renderModalDetails(result, modalBody);
    }
}

function renderModalDetails(data, container) {
    if (!container) return;
    
    if (data.error) {
        container.innerHTML = `
            <div class="error-state" style="padding: 40px; text-align: center;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px; display: block;"></i>
                <h3>⚠️ Error Analyzing ${escapeHtml(data.url)}</h3>
                <p>${escapeHtml(data.error)}</p>
                <button onclick="closeModal()" class="btn-primary" style="margin-top: 20px;">Close</button>
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
        header.removeEventListener('click', header.clickHandler);
        const handler = () => {
            const content = header.nextElementSibling;
            if (content) {
                content.classList.toggle('collapsed');
            }
        };
        header.clickHandler = handler;
        header.addEventListener('click', handler);
    });
}

function createModalSection(title, content, isOpen = true) {
    return `
        <div class="modal-section">
            <div class="modal-section-header">
                <span><i class="fas fa-folder-open"></i> ${escapeHtml(title)}</span>
                <i class="fas fa-chevron-down"></i>
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
                <div class="modal-info-value"><a href="${escapeHtml(data.url)}" target="_blank">${escapeHtml(data.url)}</a></div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Domain</div>
                <div class="modal-info-value">${escapeHtml(data.domain || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Status Code</div>
                <div class="modal-info-value ${data.basicInfo?.statusCode < 400 ? 'text-success' : 'text-error'}">
                    ${data.basicInfo?.statusCode || 'N/A'} ${escapeHtml(data.basicInfo?.statusText || '')}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Response Time</div>
                <div class="modal-info-value">${data.responseTime || 0} ms</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Protocol</div>
                <div class="modal-info-value">${escapeHtml(data.basicInfo?.protocol || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Using Proxy</div>
                <div class="modal-info-value">${data.basicInfo?.usedProxy ? 'Yes' : 'No'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Analyzed At</div>
                <div class="modal-info-value">${data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString()}</div>
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
                    ${meta.canonical && meta.canonical !== '-' ? `<a href="${escapeHtml(meta.canonical)}" target="_blank">${escapeHtml(meta.canonical)}</a>` : '-'}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">AMP Version</div>
                <div class="modal-info-value">
                    ${meta.amp && meta.amp !== '-' ? 
                        (meta.amp.includes('http') ? `<a href="${escapeHtml(meta.amp)}" target="_blank">${escapeHtml(meta.amp)}</a>` : 
                        `<span class="badge badge-success">${escapeHtml(meta.amp)}</span>`) : '-'}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Robots</div>
                <div class="modal-info-value">${escapeHtml(meta.robots || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Viewport</div>
                <div class="modal-info-value">${escapeHtml(meta.viewport || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Charset</div>
                <div class="modal-info-value">${escapeHtml(meta.charset || '-')}</div>
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
                <div class="modal-info-value">${og.image && og.image !== '-' ? `<a href="${escapeHtml(og.image)}" target="_blank">View Image</a>` : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">OG URL</div>
                <div class="modal-info-value">${og.url && og.url !== '-' ? `<a href="${escapeHtml(og.url)}" target="_blank">${escapeHtml(og.url)}</a>` : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">OG Type</div>
                <div class="modal-info-value">${escapeHtml(og.type || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Site Name</div>
                <div class="modal-info-value">${escapeHtml(og.siteName || '-')}</div>
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
                <div class="modal-info-value">${escapeHtml(twitter.card || '-')}</div>
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
                <div class="modal-info-value">${twitter.image && twitter.image !== '-' ? `<a href="${escapeHtml(twitter.image)}" target="_blank">View Image</a>` : '-'}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Twitter Site</div>
                <div class="modal-info-value">${escapeHtml(twitter.site || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Twitter Creator</div>
                <div class="modal-info-value">${escapeHtml(twitter.creator || '-')}</div>
            </div>
        </div>
    `;
}

function createSSLHTML(data) {
    const ssl = data.sslInfo || {};
    if (ssl.error) {
        return `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(ssl.error)}</div>`;
    }
    
    if (!ssl.valid && !ssl.issuer) {
        return `<div class="warning-message"><i class="fas fa-shield-alt"></i> SSL certificate not found or not accessible</div>`;
    }
    
    const daysClass = ssl.daysRemaining < 30 ? 'text-warning' : 'text-success';
    
    return `
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">SSL Valid</div>
                <div class="modal-info-value ${ssl.valid ? 'text-success' : 'text-error'}">
                    ${ssl.valid ? '<i class="fas fa-check-circle"></i> Valid' : '<i class="fas fa-times-circle"></i> Invalid or Not Found'}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Issuer</div>
                <div class="modal-info-value">${escapeHtml(ssl.issuer || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Subject</div>
                <div class="modal-info-value">${escapeHtml(ssl.subject || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Valid From</div>
                <div class="modal-info-value">${escapeHtml(ssl.validFrom || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Valid To</div>
                <div class="modal-info-value">${escapeHtml(ssl.validTo || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Days Remaining</div>
                <div class="modal-info-value ${daysClass}">${ssl.daysRemaining || 0} days</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Protocol</div>
                <div class="modal-info-value">${escapeHtml(ssl.protocol || '-')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Cipher</div>
                <div class="modal-info-value">${escapeHtml(ssl.cipher || '-')}</div>
            </div>
        </div>
    `;
}

function createDNSHTML(data) {
    const dns = data.dnsInfo || {};
    if (dns.error) {
        return `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(dns.error)}</div>`;
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
        return `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(headers.error)}</div>`;
    }
    
    const gradeClass = headers.grade === 'A' ? 'badge-success' : headers.grade === 'F' ? 'badge-error' : 'badge-warning';
    
    return `
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label">Security Grade</div>
                <div class="modal-info-value">
                    <span class="badge ${gradeClass}">
                        Grade ${headers.grade || 'N/A'} (${headers.score || 0}/100)
                    </span>
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">HSTS</div>
                <div class="modal-info-value">${escapeHtml(headers.headers?.strictTransportSecurity || 'Not Set')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">CSP</div>
                <div class="modal-info-value">${escapeHtml(headers.headers?.contentSecurityPolicy || 'Not Set')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">X-Frame-Options</div>
                <div class="modal-info-value">${escapeHtml(headers.headers?.xFrameOptions || 'Not Set')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">X-Content-Type-Options</div>
                <div class="modal-info-value">${escapeHtml(headers.headers?.xContentTypeOptions || 'Not Set')}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">X-XSS-Protection</div>
                <div class="modal-info-value">${escapeHtml(headers.headers?.xXssProtection || 'Not Set')}</div>
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
                        `<span class="text-success"><i class="fas fa-check-circle"></i> Found</span><br>
                         <a href="${escapeHtml(robots.url || '#')}" target="_blank">${escapeHtml(robots.url || '-')}</a><br>
                         ${robots.content ? `<details><summary>Preview</summary><pre style="margin-top: 10px; font-size: 0.75rem; max-height: 200px; overflow: auto;">${escapeHtml(robots.content)}</pre></details>` : ''}` : 
                        `<span class="text-warning"><i class="fas fa-exclamation-triangle"></i> Not found</span>`}
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label">Sitemap</div>
                <div class="modal-info-value">
                    ${sitemap.exists ? 
                        `<span class="text-success"><i class="fas fa-check-circle"></i> Found</span><br>
                         <a href="${escapeHtml(sitemap.url || '#')}" target="_blank">${escapeHtml(sitemap.url || '-')}</a><br>
                         ${sitemap.urlCount ? `URLs: ${sitemap.urlCount}` : ''}` : 
                        `<span class="text-warning"><i class="fas fa-exclamation-triangle"></i> Not found</span>`}
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
                        `<span class="text-success"><i class="fas fa-check-circle"></i> ${sd.jsonLdCount} items</span>` : 
                        `<span class="text-warning"><i class="fas fa-exclamation-triangle"></i> No structured data found</span>`}
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
        return '<div class="text-success"><i class="fas fa-check-circle"></i> Excellent! No major issues found.</div>';
    }
    
    return `
        <div class="recommendations-header">
            <div class="stat-card"><i class="fas fa-flag-checkered"></i> Priority: ${escapeHtml(rec.priority || 'Medium')}</div>
            <div class="stat-card"><i class="fas fa-list"></i> ${rec.total || 0} recommendations found</div>
        </div>
        ${rec.items && rec.items.length > 0 ? rec.items.map(item => `<div class="recommendation-item"><i class="fas fa-lightbulb"></i> ${escapeHtml(item)}</div>`).join('') : '<div>No specific recommendations</div>'}
    `;
}

function closeModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function clearAll() {
    allAnalysisResults = [];
    
    const resultsTableBody = document.getElementById('resultsTableBody');
    const resultsContainer = document.getElementById('resultsContainer');
    const emptyDiv = document.getElementById('empty');
    const exportButtons = document.getElementById('exportButtons');
    const singleUrl = document.getElementById('singleUrl');
    const batchUrls = document.getElementById('batchUrls');
    const urlCounter = document.getElementById('urlCounter');
    
    if (resultsTableBody) resultsTableBody.innerHTML = '<tr class="placeholder-row"><td colspan="7"><div class="placeholder-content"><i class="fas fa-chart-simple"></i><p>No data yet. Start analysis to see results.</p></div></td></tr>';
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (emptyDiv) emptyDiv.style.display = 'block';
    if (exportButtons) exportButtons.style.display = 'none';
    if (singleUrl) singleUrl.value = '';
    if (batchUrls) batchUrls.value = '';
    if (urlCounter) urlCounter.textContent = '0 URLs';
    
    showNotification('All results cleared', 'info');
}

function loadExamples() {
    const batchUrls = document.getElementById('batchUrls');
    const urlCounter = document.getElementById('urlCounter');
    if (!batchUrls) return;
    
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
    batchUrls.value = examples.join('\n');
    if (urlCounter) urlCounter.textContent = `${examples.length} URLs`;
    showNotification('Example URLs loaded. Click "Start Batch Analysis" to begin.', 'info');
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
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i> ${message}`;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${colors[type]};
        color: white;
        border-radius: 12px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-weight: 500;
        max-width: 400px;
        word-break: break-word;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => {
        if (notification && notification.remove) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 4000);
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

// Add CSS animations and styles
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
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    
    .badge-success {
        background: #d1fae5;
        color: #065f46;
    }
    
    .badge-warning {
        background: #fed7aa;
        color: #92400e;
    }
    
    .badge-error {
        background: #fee2e2;
        color: #991b1b;
    }
    
    .text-success {
        color: #10b981;
    }
    
    .text-error {
        color: #ef4444;
    }
    
    .text-warning {
        color: #f59e0b;
    }
    
    .recommendation-item {
        padding: 12px;
        margin: 8px 0;
        background: #fef3c7;
        border-left: 3px solid #f59e0b;
        border-radius: 8px;
        font-size: 0.875rem;
        display: flex;
        align-items: flex-start;
        gap: 8px;
    }
    
    .recommendation-item i {
        color: #f59e0b;
        margin-top: 2px;
    }
    
    .recommendations-header {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
    }
    
    .stat-card {
        background: #f1f5f9;
        padding: 8px 16px;
        border-radius: 10px;
        font-size: 0.875rem;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    
    .error-message, .warning-message {
        padding: 12px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .error-message {
        background: #fee2e2;
        color: #991b1b;
    }
    
    .warning-message {
        background: #fed7aa;
        color: #92400e;
    }
    
    .modal-section-header i:last-child {
        transition: transform 0.3s ease;
    }
    
    .modal-section-content.collapsed + .modal-section-header i:last-child {
        transform: rotate(-90deg);
    }
    
    .loading-spinner-small {
        width: 40px;
        height: 40px;
        border: 3px solid #e2e8f0;
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .placeholder-row td {
        text-align: center;
        padding: 60px 20px;
    }
    
    .placeholder-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        color: #94a3b8;
    }
    
    .placeholder-content i {
        font-size: 48px;
    }
`;
document.head.appendChild(style);

console.log('✅ Web Meta Analyzer Pro ready!');
console.log('Features: Batch URL Analysis | Table View | Modal Details | Export CSV/JSON');

let results = [];
let currentResults = [];
let isChecking = false;

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
    await checkUrls([url]);
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
    
    await checkUrls(urls);
}

async function checkUrls(urls) {
    if (isChecking) {
        showNotification('Already checking, please wait...', 'warning');
        return;
    }
    
    isChecking = true;
    const loading = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    const emptyDiv = document.getElementById('empty');
    const loadingText = document.getElementById('loadingText');
    const progressBar = document.getElementById('progressBar');
    
    loading.style.display = 'block';
    resultsDiv.style.display = 'none';
    emptyDiv.style.display = 'none';
    
    currentResults = [];
    let completed = 0;
    
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        loadingText.textContent = `Checking ${i + 1}/${urls.length}: ${url}`;
        progressBar.style.width = `${(i / urls.length) * 100}%`;
        
        const useProxy = document.getElementById('useProxy').checked;
        const startTime = Date.now();
        
        try {
            const result = await checkUrl(url, useProxy);
            const responseTime = Date.now() - startTime;
            
            currentResults.push({
                ...result,
                responseTime: responseTime,
                checkedAt: new Date().toLocaleString('id-ID')
            });
        } catch (error) {
            currentResults.push({
                url: url,
                statusCode: 'Error',
                statusText: error.message,
                title: '❌ Failed to fetch website',
                canonical: '-',
                amp: '-',
                responseTime: 0,
                checkedAt: new Date().toLocaleString('id-ID')
            });
        }
        
        completed++;
        updateTable();
        
        // Rate limiting delay
        if (i < urls.length - 1) {
            await delay(500);
        }
    }
    
    progressBar.style.width = '100%';
    loadingText.textContent = 'Complete! Loading results...';
    await delay(500);
    
    loading.style.display = 'none';
    resultsDiv.style.display = 'block';
    results = currentResults;
    isChecking = false;
    
    showNotification(`✅ Check completed! ${currentResults.length} URLs processed.`, 'success');
}

async function checkUrl(url, useProxy) {
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }
    
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            url: targetUrl,
            useProxy: useProxy 
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
}

function updateTable() {
    const tbody = document.getElementById('resultsBody');
    const showTime = document.getElementById('showTime').checked;
    const timeHeader = document.getElementById('timeHeader');
    
    timeHeader.style.display = showTime ? 'table-cell' : 'none';
    
    tbody.innerHTML = '';
    
    currentResults.forEach((result, index) => {
        const row = tbody.insertRow();
        
        row.insertCell(0).textContent = index + 1;
        
        // URL
        const urlCell = row.insertCell(1);
        urlCell.className = 'url-cell';
        const link = document.createElement('a');
        link.href = result.url;
        link.textContent = result.url;
        link.target = '_blank';
        link.title = 'Click to open';
        urlCell.appendChild(link);
        
        // Status
        const statusCell = row.insertCell(2);
        const statusCode = parseInt(result.statusCode);
        if (!isNaN(statusCode) && statusCode < 400) {
            statusCell.className = 'status-success';
            statusCell.innerHTML = `✓ ${result.statusCode} ${result.statusText}`;
        } else if (!isNaN(statusCode) && statusCode >= 400) {
            statusCell.className = 'status-error';
            statusCell.innerHTML = `✗ ${result.statusCode} ${result.statusText}`;
        } else {
            statusCell.className = 'status-error';
            statusCell.innerHTML = `✗ ${result.statusText}`;
        }
        
        // Title
        const titleCell = row.insertCell(3);
        titleCell.textContent = result.title.length > 80 ? result.title.substring(0, 80) + '...' : result.title;
        titleCell.title = result.title;
        
        // Canonical
        const canonicalCell = row.insertCell(4);
        if (result.canonical && result.canonical !== '-') {
            const canonicalLink = document.createElement('a');
            canonicalLink.href = result.canonical;
            canonicalLink.textContent = result.canonical.length > 60 ? result.canonical.substring(0, 60) + '...' : result.canonical;
            canonicalLink.target = '_blank';
            canonicalLink.style.color = '#48bb78';
            canonicalLink.style.textDecoration = 'none';
            canonicalLink.title = 'Open canonical URL';
            canonicalCell.appendChild(canonicalLink);
        } else {
            canonicalCell.textContent = result.canonical;
        }
        
        // AMP
        const ampCell = row.insertCell(5);
        if (result.amp && result.amp !== '-') {
            if (result.amp.includes('http')) {
                const ampLink = document.createElement('a');
                ampLink.href = result.amp;
                ampLink.textContent = result.amp.length > 60 ? result.amp.substring(0, 60) + '...' : result.amp;
                ampLink.target = '_blank';
                ampLink.style.color = '#f56565';
                ampLink.style.textDecoration = 'none';
                ampLink.title = 'Open AMP version';
                ampCell.appendChild(ampLink);
            } else {
                ampCell.innerHTML = `<span class="badge-amp">${result.amp}</span>`;
            }
        } else {
            ampCell.textContent = result.amp;
        }
        
        // Response Time
        if (showTime) {
            const timeCell = row.insertCell(6);
            if (result.responseTime && result.responseTime > 0) {
                timeCell.textContent = `${result.responseTime} ms`;
                if (result.responseTime < 1000) {
                    timeCell.style.color = '#48bb78';
                } else if (result.responseTime < 3000) {
                    timeCell.style.color = '#ed8936';
                } else {
                    timeCell.style.color = '#f56565';
                }
            } else {
                timeCell.textContent = '-';
            }
            row.insertCell(7).textContent = result.checkedAt;
        } else {
            row.insertCell(6).textContent = result.checkedAt;
        }
    });
    
    updateSummary(showTime);
}

function updateSummary(showTime) {
    const total = currentResults.length;
    const success = currentResults.filter(r => {
        const code = parseInt(r.statusCode);
        return !isNaN(code) && code < 400;
    }).length;
    const redirect = currentResults.filter(r => {
        const code = parseInt(r.statusCode);
        return !isNaN(code) && code >= 300 && code < 400;
    }).length;
    const failed = total - success;
    const avgTime = currentResults.filter(r => r.responseTime > 0).reduce((sum, r) => sum + r.responseTime, 0) / total;
    const withCanonical = currentResults.filter(r => r.canonical && r.canonical !== '-').length;
    const withAmp = currentResults.filter(r => r.amp && r.amp !== '-').length;
    const viaProxy = currentResults.filter(r => r.usedProxy).length;
    
    const summaryDiv = document.getElementById('summary');
    summaryDiv.innerHTML = `
        <span>📊 Total: ${total}</span>
        <span style="color: #48bb78;">✓ Success: ${success}</span>
        ${redirect > 0 ? `<span style="color: #ed8936;">↻ Redirect: ${redirect}</span>` : ''}
        <span style="color: #f56565;">✗ Failed: ${failed}</span>
        ${showTime && avgTime > 0 ? `<span>⏱️ Avg: ${Math.round(avgTime)}ms</span>` : ''}
        <span>🔗 Canonical: ${withCanonical}</span>
        <span>⚡ AMP: ${withAmp}</span>
        ${viaProxy > 0 ? `<span>🔄 Proxy: ${viaProxy}</span>` : ''}
    `;
}

function clearAll() {
    currentResults = [];
    results = [];
    document.getElementById('resultsBody').innerHTML = '';
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
    if (currentResults.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const showTime = document.getElementById('showTime').checked;
    const headers = ['No', 'URL', 'Status Code', 'Status Text', 'Title', 'Canonical', 'AMP'];
    if (showTime) headers.push('Response Time (ms)');
    headers.push('Checked At');
    
    const rows = [headers];
    
    currentResults.forEach((result, index) => {
        const row = [
            index + 1,
            result.url,
            result.statusCode,
            `"${result.statusText.replace(/"/g, '""')}"`,
            `"${result.title.replace(/"/g, '""')}"`,
            result.canonical,
            result.amp
        ];
        if (showTime) row.push(result.responseTime || '-');
        row.push(result.checkedAt);
        rows.push(row.join(','));
    });
    
    downloadFile(rows.join('\n'), 'csv', `web-meta-analysis-${new Date().toISOString().slice(0,19)}.csv`);
    showNotification('CSV exported successfully', 'success');
}

function exportJSON() {
    if (currentResults.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const data = currentResults.map((r, i) => ({ 
        no: i + 1, 
        ...r 
    }));
    
    downloadFile(JSON.stringify(data, null, 2), 'json', `web-meta-analysis-${new Date().toISOString().slice(0,19)}.json`);
    showNotification('JSON exported successfully', 'success');
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
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    const colors = {
        success: '#48bb78',
        error: '#f56565',
        warning: '#ed8936',
        info: '#4299e1'
    };
    
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 10px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 0.9rem;
        font-weight: 500;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
`;
document.head.appendChild(style);

// Event listeners
document.getElementById('singleUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') checkSingle();
});

document.getElementById('showTime').addEventListener('change', updateTable);

console.log('✅ Web Meta Analyzer Pro ready!');
console.log('Features: Title Checker | Canonical Detector | AMP Detector | CORS Proxy | User-Agent Rotation');

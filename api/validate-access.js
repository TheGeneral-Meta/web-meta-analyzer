const axios = require('axios');

// Cache for access validation results
let cache = {
  result: null,
  timestamp: null
};

const CACHE_DURATION = 30000; // 30 seconds

async function getIpGeolocation(ip) {
  try {
    // Using ipapi.co for geolocation (free tier)
    const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MetaAnalyzer/1.0)'
      }
    });
    
    if (response.data && response.data.error) {
      throw new Error(response.data.reason || 'Geolocation failed');
    }
    
    return {
      ip: response.data.ip,
      country: response.data.country_name,
      countryCode: response.data.country_code,
      region: response.data.region,
      city: response.data.city,
      latitude: response.data.latitude,
      longitude: response.data.longitude
    };
  } catch (error) {
    // Fallback to ipapi.co alternative
    try {
      const fallbackResponse = await axios.get(`http://ip-api.com/json/${ip}`, {
        timeout: 5000
      });
      
      if (fallbackResponse.data && fallbackResponse.data.status === 'success') {
        return {
          ip: fallbackResponse.data.query,
          country: fallbackResponse.data.country,
          countryCode: fallbackResponse.data.countryCode,
          region: fallbackResponse.data.regionName,
          city: fallbackResponse.data.city,
          latitude: fallbackResponse.data.lat,
          longitude: fallbackResponse.data.lon
        };
      }
      throw new Error('Fallback geolocation also failed');
    } catch (fallbackError) {
      throw new Error('Unable to determine geolocation');
    }
  }
}

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Get client IP from various headers (for Vercel/proxy environments)
    let clientIp = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress ||
                   req.socket.remoteAddress ||
                   '';

    // Clean IP (remove port if present and handle IPv6 localhost)
    clientIp = clientIp.split(',')[0].trim();
    if (clientIp === '::1' || clientIp === '127.0.0.1') {
      // For local development, use a test IP or skip validation
      // In production, this shouldn't happen as Vercel provides real IP
      clientIp = '103.130.101.54'; // Example Indonesia IP for testing
    }

    // Check cache
    if (cache.result && cache.timestamp && (Date.now() - cache.timestamp) < CACHE_DURATION) {
      const cachedResult = { ...cache.result };
      cachedResult.cached = true;
      res.status(200).json(cachedResult);
      return;
    }

    // Get geolocation data
    const geoData = await getIpGeolocation(clientIp);
    
    // Check if IP is from Indonesia
    const isIndonesia = geoData.countryCode === 'ID';
    
    const response = {
      success: isIndonesia,
      ip: geoData.ip,
      country: geoData.country,
      countryCode: geoData.countryCode,
      region: geoData.region,
      city: geoData.city,
      isIndonesia: isIndonesia,
      isAllowed: isIndonesia,
      status: isIndonesia ? 'ACCESS_GRANTED' : 'ACCESS_DENIED',
      reason: isIndonesia ? null : 'VPN_INDONESIA_REQUIRED',
      message: isIndonesia 
        ? 'Akses Indonesia terdeteksi. Silakan lanjut cek domain.'
        : 'VPN Indonesia wajib aktif sebelum menggunakan tool ini.',
      latitude: geoData.latitude,
      longitude: geoData.longitude,
      timestamp: new Date().toISOString()
    };
    
    // Update cache
    cache = {
      result: response,
      timestamp: Date.now()
    };
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Access validation error:', error);
    
    // Handle different error types
    let status = 'VALIDATION_ERROR';
    let reason = 'GEOLOCATION_FAILED';
    let message = 'Terjadi masalah akses (geolocation gagal). Tool dikunci dan tidak dapat melanjutkan.';
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      status = 'VALIDATION_ERROR';
      reason = 'REQUEST_TIMEOUT';
      message = 'Timeout saat validasi akses. Periksa koneksi internet Anda.';
    } else if (error.response && error.response.status === 403) {
      status = 'VALIDATION_ERROR';
      reason = 'IPOS_OR_PROVIDER_BLOCK';
      message = 'Akses diblokir oleh provider. Aktifkan VPN Indonesia.';
    } else if (error.response && error.response.status === 429) {
      status = 'VALIDATION_ERROR';
      reason = 'RATE_LIMIT_EXCEEDED';
      message = 'Terlalu banyak permintaan. Coba lagi beberapa saat.';
    }
    
    const errorResponse = {
      success: false,
      isAllowed: false,
      status: status,
      reason: reason,
      message: message,
      timestamp: new Date().toISOString(),
      ip: clientIp || 'unknown'
    };
    
    res.status(200).json(errorResponse);
  }
};

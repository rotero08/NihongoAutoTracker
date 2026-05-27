const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

function generateToken(issuer, secret) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
        iss: issuer,
        jti: Math.random().toString(),
        iat: issuedAt,
        exp: issuedAt + 300, // Token valid for 5 minutes
    };
    return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

async function run() {
    const issuer = process.env.AMO_JWT_ISSUER;
    const secret = process.env.AMO_JWT_SECRET;
    const addonId = process.env.AMO_ADDON_ID;

    if (!issuer || !secret || !addonId) {
        console.error("Missing required environment variables.");
        process.exit(1);
    }

    // Path to your README
    const readmePath = path.resolve(__dirname, '../../README.md');
    if (!fs.existsSync(readmePath)) {
        console.error("README.md not found at path: " + readmePath);
        process.exit(1);
    }

    let content = fs.readFileSync(readmePath, 'utf-8');

    // AMO limit is 3000 characters. 
    if (content.length > 3000) {
        console.warn("README is longer than 3000 characters. Truncating for AMO...");
        content = content.substring(0, 2995) + '...';
    }

    const token = generateToken(issuer, secret);

    // Update listing details via AMO API v5
    const response = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${addonId}/`, {
        method: 'PATCH',
        headers: {
            'Authorization': `JWT ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            description: {
                'en-US': content
            }
        })
    });

    if (response.ok) {
        console.log("Successfully updated store description.");
    } else {
        const errData = await response.json();
        console.error("Failed to update store description:", JSON.stringify(errData, null, 2));
        process.exit(1);
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
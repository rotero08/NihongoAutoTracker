const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Generate JWT for authentication with Firefox AMO API
function generateToken(issuer, secret) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
        iss: issuer,
        jti: Math.random().toString(),
        iat: issuedAt,
        exp: issuedAt + 300, // Valid for 5 minutes
    };
    return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

async function run() {
    const issuer = process.env.AMO_JWT_ISSUER;
    const secret = process.env.AMO_JWT_SECRET;
    const addonId = process.env.AMO_ADDON_ID;

    if (!issuer || !secret || !addonId) {
        error("Missing required environment variables.");
        process.exit(1);
    }

    // Read the store-specific description file instead of the main README.md
    // to ensure formatting (like HTML tables or images) remains clean on the store page.
    const descriptionPath = path.resolve(__dirname, '../../STORE_DESCRIPTION.md');

    if (!fs.existsSync(descriptionPath)) {
        error(`Store description file not found at: ${descriptionPath}`);
        process.exit(1);
    }

    let content = fs.readFileSync(descriptionPath, 'utf-8');

    // AMO store page description limit is 3000 characters. 
    if (content.length > 3000) {
        log("Description is longer than 3000 characters. Truncating to fit AMO guidelines...");
        content = content.substring(0, 2995) + '...';
    }

    const token = generateToken(issuer, secret);

    log("Updating store page description on Firefox AMO...");

    // Update listing details on AMO via PATCH request
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
        log("Successfully updated extension store page description.");
    } else {
        const errData = await response.json();
        error("Failed to update store page description:", JSON.stringify(errData, null, 2));
        process.exit(1);
    }
}

run().catch(err => {
    error("Description sync failed with error:", err);
    process.exit(1);
});
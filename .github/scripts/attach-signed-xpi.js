const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const AMO_ADDON_ID = process.env.AMO_ADDON_ID;
const REPO = process.env.GITHUB_REPOSITORY; // e.g., "username/repo"

if (!GITHUB_TOKEN || !AMO_ADDON_ID || !REPO) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

async function fetchGitHub(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'github-actions-xpi-sync',
            ...options.headers,
        }
    });
    if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

async function run() {
    console.log("Checking recent GitHub releases...");

    // 1. Get recent releases from your GitHub repo
    const releases = await fetchGitHub(`https://api.github.com/repos/${REPO}/releases?per_page=5`);

    if (releases.length === 0) {
        console.log("No releases found in the repository.");
        return;
    }

    for (const release of releases) {
        const versionTag = release.tag_name; // e.g., "v4.0.1"
        const cleanedVersion = versionTag.replace(/^v/, ''); // e.g., "4.0.1"

        // Check if this release already has a .xpi file attached
        const hasXpi = release.assets.some(asset => asset.name.endsWith('.xpi'));
        if (hasXpi) {
            console.log(`Release ${versionTag} already has a signed .xpi attached. Skipping.`);
            continue;
        }

        console.log(`Release ${versionTag} is missing a signed .xpi. Checking Firefox AMO...`);

        // 2. Query Firefox AMO for this version
        const amoRes = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${AMO_ADDON_ID}/versions/?page_size=10`);
        if (!amoRes.ok) {
            console.error(`Failed to fetch versions from AMO: ${amoRes.status}`);
            continue;
        }
        const amoData = await amoRes.json();

        // Find the entry matching our GitHub version
        const amoVersionEntry = amoData.results.find(item => item.version === cleanedVersion);

        if (!amoVersionEntry) {
            console.log(`Version ${cleanedVersion} not found on AMO yet.`);
            continue;
        }

        // Find the file block (it must have completed review and be public/approved)
        const file = amoVersionEntry.files.find(f => f.status === 'public' || f.status === 'approved');
        if (!file || !file.url) {
            console.log(`Version ${cleanedVersion} is on AMO but hasn't passed approval/signing yet.`);
            continue;
        }

        console.log(`Found signed .xpi for version ${cleanedVersion} on AMO. Downloading...`);

        // 3. Download the .xpi
        const downloadRes = await fetch(file.url);
        if (!downloadRes.ok) {
            console.error(`Failed to download .xpi from ${file.url}`);
            continue;
        }

        const arrayBuffer = await downloadRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = `nihongo-auto-tracker-${cleanedVersion}.xpi`;
        const tempFilePath = path.join(__dirname, fileName);
        fs.writeFileSync(tempFilePath, buffer);

        console.log(`Downloaded ${fileName}. Uploading to GitHub Release...`);

        // 4. Upload the .xpi to the GitHub Release
        const uploadUrl = `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${fileName}`;
        const fileStats = fs.statSync(tempFilePath);

        try {
            const uploadRes = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': fileStats.size,
                    'User-Agent': 'github-actions-xpi-sync',
                },
                body: buffer
            });

            if (uploadRes.ok) {
                console.log(`Successfully attached ${fileName} to release ${versionTag}.`);
            } else {
                console.error(`Failed to upload asset: ${uploadRes.status} ${await uploadRes.text()}`);
            }
        } catch (err) {
            console.error("Error during asset upload:", err);
        } finally {
            // Clean up the temporary local file
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        }
    }
}

run().catch(err => {
    console.error("Workflow failed with error:", err);
    process.exit(1);
});
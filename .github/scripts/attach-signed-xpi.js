const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const AMO_ADDON_ID = process.env.AMO_ADDON_ID;
const REPO = process.env.GITHUB_REPOSITORY;

if (!GITHUB_TOKEN || !AMO_ADDON_ID || !REPO) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

// Helper to interact with the GitHub API
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
        throw new Error(`GitHub API error: ${res.status} - ${await res.text()}`);
    }
    return res.json();
}

async function run() {
    console.log("Polling Firefox AMO for approved versions...");

    // 1. Fetch recent versions of your extension from Firefox AMO
    const amoRes = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${AMO_ADDON_ID}/versions/?page_size=10`);
    if (!amoRes.ok) {
        console.error(`Failed to fetch versions from AMO: ${amoRes.status}`);
        process.exit(1);
    }
    const amoData = await amoRes.json();

    // 2. Fetch recent releases (including drafts) from GitHub
    const gitHubReleases = await fetchGitHub(`https://api.github.com/repos/${REPO}/releases?per_page=20`);

    for (const amoVersionEntry of amoData.results) {
        const versionNum = amoVersionEntry.version; // e.g., "4.0.2"
        const expectedTag = `v${versionNum}`; // e.g., "v4.0.2"

        // Check if the version has an approved, public file ready for download
        const file = amoVersionEntry.files.find(f => f.status === 'public' || f.status === 'approved');
        if (!file || !file.url) {
            console.log(`Version ${versionNum} on AMO is not signed or approved yet. Skipping.`);
            continue;
        }

        // Search for an existing GitHub release matching this tag
        let release = gitHubReleases.find(r => r.tag_name === expectedTag);

        // If the release doesn't exist on GitHub, create a Draft Release automatically
        if (!release) {
            console.log(`No GitHub release found for tag ${expectedTag}. Creating a Draft Release...`);
            try {
                release = await fetchGitHub(`https://api.github.com/repos/${REPO}/releases`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tag_name: expectedTag,
                        name: expectedTag,
                        draft: true,
                        prerelease: false,
                        body: `Automated draft release for version ${expectedTag}.`
                    })
                });
                console.log(`Created Draft Release: ${expectedTag}`);
            } catch (err) {
                console.error(`Failed to create Draft Release for ${expectedTag}:`, err);
                continue;
            }
        }

        // Check if the release already has the .xpi file attached
        const targetFileName = `NihongoAutoTracker-v${versionNum}.xpi`;
        const hasXpi = release.assets.some(asset => asset.name === targetFileName);
        if (hasXpi) {
            console.log(`Release ${expectedTag} already has ${targetFileName} attached. Skipping.`);
            continue;
        }

        console.log(`Downloading signed .xpi for ${expectedTag} from AMO...`);

        // 3. Download the signed file from Firefox
        const downloadRes = await fetch(file.url);
        if (!downloadRes.ok) {
            console.error(`Failed to download file from ${file.url}`);
            continue;
        }

        const arrayBuffer = await downloadRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const tempFilePath = path.join(__dirname, targetFileName);
        fs.writeFileSync(tempFilePath, buffer);

        console.log(`Uploading ${targetFileName} to GitHub Release ${expectedTag}...`);

        // 4. Upload the downloaded file to the Draft Release
        const uploadUrl = `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${targetFileName}`;
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
                console.log(`Successfully attached ${targetFileName} to release ${expectedTag}.`);
            } else {
                console.error(`Failed to upload asset to GitHub: ${uploadRes.status} - ${await uploadRes.text()}`);
            }
        } catch (err) {
            console.error("Error encountered during asset upload:", err);
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
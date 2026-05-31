import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import readline from 'readline';

// 1. Read current version from wxt.config.ts
const configContent = fs.readFileSync('wxt.config.ts', 'utf8');
const versionMatch = configContent.match(/version:\s*['"`]([^'"`]+)['"`]/);

if (!versionMatch) {
    console.error("❌ Error: Could not find version inside wxt.config.ts.");
    process.exit(1);
}

const currentVersion = versionMatch[1];
const versionParts = currentVersion.split('.');
const major = parseInt(versionParts[0]) || 0;
const minor = parseInt(versionParts[1]) || 0;
const patch = parseInt(versionParts[2]) || 0;

const versionOptions = [
    { name: 'Patch', next: `${major}.${minor}.${patch + 1}` },
    { name: 'Minor', next: `${major}.${minor + 1}.0` },
    { name: 'Major', next: `${major + 1}.0.0` }
];

const releaseTypeOptions = [
    {
        label: 'Public Release  (Immediately visible to users. Requires release notes.)',
        type: 'PUBLIC'
    },
    {
        label: 'Draft Release   (Saved as a draft. Notes are optional.)',
        type: 'DRAFT'
    }
];

// Helper to render interactive selection menus using standard arrow keys
function selectMenu(title, choices) {
    return new Promise((resolve) => {
        let selectedIndex = 0;

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        const height = choices.length + 1; // 1 header line + N choice lines

        function render() {
            if (process.stdout.isTTY) {
                process.stdout.write('\r\x1B[K');
                for (let i = 0; i < height; i++) {
                    process.stdout.write('\x1B[1A\r\x1B[K');
                }
            }

            console.log(title);
            choices.forEach((opt, idx) => {
                if (idx === selectedIndex) {
                    console.log(` \x1b[35m❯\x1b[0m \x1b[1m${opt.label}\x1b[0m`);
                } else {
                    console.log(`   ${opt.label}`);
                }
            });
        }

        // Output initial padding lines
        for (let i = 0; i < height; i++) console.log('');
        render();

        const handleKey = (str, key) => {
            if (key.ctrl && key.name === 'c') {
                process.exit();
            }

            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
                render();
            } else if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % choices.length;
                render();
            } else if (key.name === 'return') {
                // Clean up listeners
                process.stdin.removeListener('keypress', handleKey);
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                resolve(selectedIndex);
            }
        };

        process.stdin.on('keypress', handleKey);
    });
}

// Opens the system default editor (e.g., Vim, Nano, Notepad) with pre-filled instructions
function getEditorInput(nextVersion, releaseType) {
    const tempFileName = `.release-notes-tmp`;
    const tempFilePath = path.resolve(tempFileName);

    const isMandatory = releaseType === 'PUBLIC';

    // Format Git-like instructions
    const instructions = [
        "", // Leave a blank line at the top for the user to start typing directly
        "# --------------------------------------------------",
        `# Release Notes for version v${nextVersion} (${releaseType})`,
        isMandatory
            ? "# ⚠️  RELEASE NOTES ARE MANDATORY for a Public Release."
            : "# ℹ️  Release notes are optional for a Draft Release.",
        "# Please enter your notes above this section.",
        "# Lines starting with '#' will be ignored.",
        "# Save and close the editor to submit.",
        "# --------------------------------------------------"
    ].join('\n');

    fs.writeFileSync(tempFilePath, instructions, 'utf8');

    // Determine user's preferred editor, fallback to Vim (on Unix) or Notepad (on Windows)
    const editor = process.env.VISUAL || process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vim');

    console.log(`\nOpening your default editor (${editor}) to write release notes...`);

    try {
        // stdio: 'inherit' is critical; it redirects terminal keystrokes to Vim/Nano directly
        const result = spawnSync(editor, [tempFilePath], { stdio: 'inherit' });

        if (result.error) {
            throw new Error(`Could not open editor "${editor}". Make sure it is installed or set your EDITOR environment variable.`);
        }
    } catch (err) {
        console.error(`\n❌ Error opening editor: ${err.message}`);
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        process.exit(1);
    }

    // Read saved content
    if (!fs.existsSync(tempFilePath)) {
        console.error("❌ Error: Temporary release notes file was deleted or not found.");
        process.exit(1);
    }

    const content = fs.readFileSync(tempFilePath, 'utf8');
    fs.unlinkSync(tempFilePath); // Clean up temp file

    // Filter out commented lines starting with '#'
    const lines = content.split('\n');
    const cleanNotes = lines
        .filter(line => !line.trim().startsWith('#'))
        .join('\n')
        .trim();

    // Validate mandatory input
    if (isMandatory && !cleanNotes) {
        console.error("\n❌ Error: Release notes are mandatory for a Public Release. Release aborted.");
        process.exit(1);
    }

    return cleanNotes;
}

async function run() {
    // Step 1: Select version bump
    const versionIdx = await selectMenu(
        `Select version bump type (Current: \x1b[36m${currentVersion}\x1b[0m):`,
        versionOptions.map(opt => ({ label: `${opt.name.padEnd(5)} (${currentVersion} ──> \x1b[32m${opt.next}\x1b[0m)` }))
    );
    const nextVersion = versionOptions[versionIdx].next;
    console.log(`Version Selected: \x1b[32m${nextVersion}\x1b[0m\n`);

    // Step 2: Select release type
    const typeIdx = await selectMenu(
        `Select release type for ${nextVersion}:`,
        releaseTypeOptions
    );
    const releaseType = releaseTypeOptions[typeIdx];
    console.log(`Release Type: \x1b[32m${releaseType.type}\x1b[0m\n`);

    // Step 3: Collect release notes via default text editor
    const notes = getEditorInput(nextVersion, releaseType.type);

    proceedWithRelease(nextVersion, releaseType.type, notes);
}

function proceedWithRelease(nextVersion, releaseType, releaseNotes) {
    const tagName = `v${nextVersion}`;

    // 1. Safeguard: Check clean working directory
    try {
        const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
        if (status) {
            console.warn("\n⚠️ Warning: Your git working directory has uncommitted changes.");
            console.warn("Please commit or stash your changes before tagging a release.");
            process.exit(1);
        }
    } catch (err) {
        console.error("❌ Failed to check git status:", err.message);
        process.exit(1);
    }

    // 2. Automatically update version in wxt.config.ts
    let config = fs.readFileSync('wxt.config.ts', 'utf8');
    config = config.replace(/(version:\s*['"`])([^'"`]+)(['"`])/, `$1${nextVersion}$3`);
    fs.writeFileSync('wxt.config.ts', config, 'utf8');
    console.log(`📝 Updated version in wxt.config.ts to: ${nextVersion}`);

    // 3. Automatically update version in package.json
    let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = nextVersion;
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`📝 Updated version in package.json to: ${nextVersion}`);

    // 4. Commit version changes
    try {
        console.log(`Git: Staging and committing updates...`);
        execSync(`git add wxt.config.ts package.json`);
        execSync(`git commit -m "chore: release ${tagName}"`);
    } catch (err) {
        console.error("❌ Git commit failed:", err.message);
        process.exit(1);
    }

    // 5. Build Tag Message with metadata headers
    const tagMessage = `RELEASE_TYPE: ${releaseType}\n${releaseNotes}`;

    // 6. Tag and Push
    try {
        const escapedMessage = tagMessage.replace(/"/g, '\\"');
        execSync(`git tag -a ${tagName} -m "${escapedMessage}"`);

        const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();

        console.log(`Pushing updates to origin ${currentBranch}...`);
        execSync(`git push origin ${currentBranch}`);

        console.log(`Pushing tag ${tagName} to GitHub...`);
        execSync(`git push origin ${tagName}`);

        console.log(`\n✅ Success! Files updated, tag pushed. GitHub Actions will process the ${releaseType} release.`);
    } catch (err) {
        console.error("❌ Git operations failed:", err.message);
        process.exit(1);
    }
}

run().catch(err => {
    console.error("❌ Release failed:", err);
    process.exit(1);
});
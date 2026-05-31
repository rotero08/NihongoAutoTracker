# Release Process & Store Automation

This project uses GitHub Actions to automate building, submitting, and updating the NihongoAutoTracker extension on the Firefox Add-ons Store (AMO).

---

## How to Release a New Version

Follow these steps whenever you want to publish an update:

### Step 1: Update Version and Documentation
1. Open `wxt.config.ts` and update the version number (e.g., change `4.0.1` to `4.0.2` inside the `manifest` block).
2. Open `package.json` and update the version number to match (e.g., set `"version": "4.0.2"`).
3. Update `STORE_DESCRIPTION.md` if needed. (The contents of this file will automatically sync to your Firefox store page listing description).

### Step 2: Commit and Push Your Code
Commit and push your changes to your main branch:
```bash
git add .
git commit -m "chore: release v4.0.2"
git push origin main
```

### Step 3: Trigger the Automation with a Tag
By pushing a git tag starting with `v`, GitHub Actions builds and submits your extension. You can choose whether you want the GitHub Release to be **Public (with Release Notes)** or a **Draft (to be published manually)**:

#### Option A: Create a PUBLIC Release with Release Notes (Recommended)
Use an **Annotated Tag** by adding the `-a` flag. This opens your default command line text editor, allowing you to enter notes:
```bash
# 1. Create an annotated tag (this will open your terminal's editor)
git tag -a v4.0.2

# 2. Type your release notes in the editor, save, and exit.
# 3. Push the tag to GitHub
git push origin v4.0.2
```
*The workflow will extract your notes and immediately create a published, **Public** Release on GitHub with the signed `.xpi` file.*

#### Option B: Create a DRAFT Release (No Notes)
Use a **Lightweight Tag** (without the `-a` flag) to create a release with no notes:
```bash
# 1. Create a tag with no message
git tag v4.0.2

# 2. Push the tag to GitHub
git push origin v4.0.2
```
*The workflow will see that no notes were entered and will create a **Draft** Release instead.*

---

## How the Automation Flows

1. **Submission & Direct Upload:** The action builds the extension and signs it on Firefox AMO [22]. If it gets approved immediately, it downloads the signed `.xpi` file and uploads it to the GitHub Release [22].
2. **If Manual Review is Required:** If Firefox flags the submission for manual review, the initial action finishes without creating a release. It will not fail or break the pipeline.
3. **Automated Fallback:** A silent background job (`poll-and-attach.yml`) runs every 6 hours. It checks AMO to see if the extension version has been approved. Once the reviewers approve it, this script will download the `.xpi` and automatically attach it to the GitHub Release. This background check is designed to skip pending versions gracefully and will not send failure emails.
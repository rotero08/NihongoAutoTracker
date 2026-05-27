# Release Process & Store Automation

This project uses GitHub Actions to automate building, submitting, and updating the NihongoAutoTracker extension on the Firefox Add-ons Store (AMO).

---

## How to Release a New Version

Follow these steps whenever you want to publish an update:

### Step 1: Update Version and Documentation
1. Open `wxt.config.ts` and update the version number (e.g., change `4.0.1` to `4.0.2` inside the `manifest` block).
2. Update `README.md` if needed. (The contents of your README will automatically become your Firefox store page description).

### Step 2: Commit and Push Your Code
Commit and push your changes to your main branch:
```bash
git add .
git commit -m "chore: release v4.0.2"
git push origin main
```

### Step 3: Trigger the Automation (Push the Tag)
By pushing a git tag starting with `v`, GitHub Actions knows to begin building and submitting your extension.
```bash
# Create the version tag (must match the version in wxt.config.ts)
git tag v4.0.2

# Push the tag to GitHub (Triggers the deploy.yml workflow)
git push origin v4.0.2
```
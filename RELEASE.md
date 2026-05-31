# Release Process & Store Automation

This project uses GitHub Actions to automate building, submitting, and updating the NihongoAutoTracker extension on the Firefox Add-ons Store (AMO).

---

## How to Release a New Version

The release workflow is automated. You do not need to manually modify the version strings in your configuration files before running the deployment command.

### Step 1: Push your current updates to the main branch
Before creating a release, verify that all regular code changes are committed and pushed to your branch:
```bash
git add .
git commit -m "feat: add feature updates"
git push origin main
```

### Step 2: Run the Release Script
Run the built-in release helper in your project root:
```bash
pnpm release
```

1. **Select Version Type:** Use the **Up/Down Arrow Keys** to navigate and press **Enter** to choose your semantic version bump (Patch, Minor, or Major). DO NOT MANUALLY CHANGE THE VERSION INSIDE `wxt.config.ts` or `package.json`.
2. **Select Release Type:** Use the **Up/Down Arrow Keys** to choose the publication routing:
   * **Public Release:** Publishes immediately once approved. Requires mandatory release notes.
   * **Draft Release:** Saves as a draft on GitHub. Release notes are optional.
3. **Write Release Notes (Git style):** 
   * The script will automatically launch your terminal's default text editor (such as Vim, Nano, or VS Code) containing template comments starting with `#`.
   * Type your notes above the commented section. Any line starting with `#` will be ignored.
   * **Save and exit** the editor to proceed. If you chose a Public Release and close the editor without typing anything, the script will abort the release process cleanly.

---

## How the Automation Flows

1. **Safety Check:** The workflow starts by reading the pushed tag version and validating it against the version defined in `wxt.config.ts`. If they do not match, the workflow halts immediately to prevent mismatched deployments.
2. **Submission & Direct Upload:** The action builds your extension and signs it on Firefox AMO [22]. If it gets approved immediately, it downloads the signed `.xpi` file and uploads it to your GitHub Release [22].
3. **If Manual Review is Required:** If Firefox flags the submission for manual review, the initial action finishes without creating a release. It will not fail or break your pipeline.
4. **Automated Fallback:** A silent background job (`sync-signed-xpi.yml`) runs every 6 hours. It checks AMO to see if your extension version has been approved. Once approved, this script will download the `.xpi` and automatically attach it to the GitHub Release. This background check is designed to skip pending versions gracefully and will not send you failure emails.
<p align="center">
  <img src="https://img.shields.io/badge/WXT-4B32C3?style=flat&logo=wxt&logoColor=white" alt="WXT" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/pnpm-F69220?style=flat&logo=pnpm&logoColor=white" alt="pnpm" />
  <img src="https://img.shields.io/badge/Svelte-FF3E00?style=flat&logo=svelte&logoColor=white" alt="Svelte" />
</p>

***

<h1 align="center">
<sub>
<img src="https://github.com/rotero08/NihongoAutoTracker/blob/main/public/NihongoAutoTracker.svg" height="38" width="38">
</sub>
NihongoAutoTracker
</h1>

<p align="center">
  An unofficial, customizable browser extension for <b><a href="https://nihongotracker.app/">NihongoTracker</a></b> that automates and streamlines your Japanese immersion logging.
</p>

<p align="center">
  <a href="https://addons.mozilla.org/en-US/firefox/addon/nihongoautotracker/"><img src="https://img.shields.io/badge/Firefox_Add--ons-FF7100?style=for-the-badge&logo=firefox-browser&logoColor=white" height="40" alt="Get it on Firefox Add-ons" /></a>&nbsp;&nbsp;
  <img src="https://img.shields.io/badge/Chrome_Web_Store-Coming_Soon-555555?style=for-the-badge&logo=google-chrome&logoColor=white" height="40" alt="Chrome Web Store - Coming Soon" />
</p>

---

## Table of Contents
* [Features](#-features)
  * [Queue System](#queue-system)
  * [Advanced Video Tracking](#advanced-video-tracking)
  * [Reading & Context Menu Logging](#reading--context-menu-logging)
  * [Configurable & Customizable](#configurable--customizable)
* [Installation](#-installation)
  * [Firefox](#firefox)
  * [Chrome (Manual Installation)](#chrome-manual-installation)
* [Development Setup](#️-development-setup)
* [Building for Production](#-building-for-production)
* [Automatic Deployment & Releases](#-automatic-deployment--releases)
* [Privacy Policy](#-privacy-policy)
* [Attribution & License](#️-attribution--license)

---

## ✨ Features

### Queue System
Logs are stored in a local queue, giving you complete control over your data before it hits the server. There are various options to automate the process.

* **Session Management:** Group multiple short sessions of the same media together.
* **Manual Overrides:** Edit time, character counts, dates, volume, and title before hitting "Send".
* **Smart Matching:** Search and match your reading material (Light Novels) to ensure accurate logging to NihongoTracker. A green checkmark appears when matched.
* **End-of-Day Sync:** Optionally set the extension to automatically flush your queue and send everything right before midnight.
* **Stats Dashboard:** View a quick summary of your Japanese learning stats (the complete set of stats remains in the main NihongoTracker dashboard).
* **Stremio & Trakt Integration:** Sync your anime or movie watched history from Stremio to NihongoTracker automatically using Trakt.

<p align="center">
  <table>
    <tr>
      <td align="center"><b>Quick Popup Menu</b></td>
      <td align="center"><b>Full Dashboard View</b></td>
    </tr>
    <tr>
      <td valign="top"><img width="350" alt="Compact Extension Popup" src="https://github.com/user-attachments/assets/030e0219-9c1c-42ae-8d87-f5525540af23" /></td>
      <td valign="top"><img width="450" alt="Full Settings and Queue Page" src="https://github.com/user-attachments/assets/16b5fce2-ac4a-4616-8e62-07b501bff880" /></td>
    </tr>
  </table>
</p>

### Advanced Video Tracking
Never forget to log a video again. The extension integrates smoothly into your viewing experience without cluttering the screen.

* **In-Player Badge:** Injects a sleek, non-intrusive tracking badge directly into the player to monitor current and total session time.
* **Quick Context Menu:** Right-click any YouTube video or link to log it instantly to NihongoTracker without opening a single menu.
* **Smart Auto-Logging:** Optionally set thresholds (e.g., 95% completion or 30 minutes watched) to log content automatically in the background without sending it to the queue.

<p align="center">
 <img width="800" alt="YouTube Tracking Badge" src="https://github.com/user-attachments/assets/e58e8e0-f7c7-449e-ac5a-f0b197d2ccc9" />
</p>

* **Playlist Logger:** Bulk-log entire playlists or select specific videos directly from the YouTube sidebar or playlist header. Includes smart filters to automatically hide non-Japanese content.

<p align="center">
  <img width="400" alt="Playlist Logger Selector" src="https://github.com/user-attachments/assets/7229d5e0-0114-49d7-a136-e5869f221dab" />
</p>

### Reading & Context Menu Logging
Track your reading progress actively and seamlessly sync with popular web readers. 

* **Reader Integrated Dashboard:** Seamlessly syncs your reading sessions from Ttu Reader, Yatsu Reader, and Yomiyasu Reader in the background.
* **Fully Compatible with Jiten & Whisruns:** Integrates perfectly with Jiten dictionary and ttu/yatsu whispersync tools, maintaining layout styling and dynamic icon positioning.
* **Cohesive Design:** Match the visual appearance of your dashboard and popup directly to your reader's design for a unified workspace.
* **Compact Timer Overlay:** A sleek, draggable overlay tracks your active reading time on non-reader websites (e.g. Wikipedia, Asahi Shinbun). Can be customized.
* **Integrated Matching Logic:** Match your reading material inside the reader before sending it to the queue, ensuring every send is correctly matched.

<p align="center">
  <table>
    <tr>
      <td align="center"><b>Reader Integration</b></td>
      <td align="center"><b>Session History & Tracking</b></td>
    </tr>
    <tr>
      <td><img width="350" alt="Searching and matching a Light Novel" src="https://github.com/user-attachments/assets/3b2147e4-e05d-4a8c-a3eb-e36504b1f99d" /></td>
      <td><img width="350" alt="Active reading session and history" src="https://github.com/user-attachments/assets/9ece1942-5b20-4d24-a465-1e73b5e21b93" /></td>
    </tr>
  </table>
</p>

* **Text Context Menu:** Highlight Japanese text on any webpage, right-click, and log it instantly. The extension calculates character counts and reading time automatically.

<p align="center">
  <img width="600" alt="Context menu logging showing 'Log to NihongoTracker" src="https://github.com/user-attachments/assets/922896fc-2cb3-4599-acae-b1c09ce0ac4c" />
</p>

### Configurable & Customizable
* **Theme Management:** Choose from multiple pre-built themes, or create, import, and share your own custom designs.
* **Site Filters:** Maintain Allow/Skip lists for the reading overlay to control exactly where tracking occurs.
* **Flexible Logic:** Toggle time tracking, switch between auto and manual modes, and set playlist-specific Japanese content filters.
* **Togglable Options:** Various options to personalize your viewing and reading experience.
* **Regex Engine:** Define custom regex rules for control over automatic title and volume detection.

---

## 📦 Installation

### Firefox
Get the official extension directly from the [Firefox Add-ons Store](https://addons.mozilla.org/en-US/firefox/addon/nihongoautotracker/).

### Chrome (Manual Installation)
The Chrome Web Store version is **coming soon**. In the meantime, you can install the production build manually:

1. Download the latest production build from the [Releases](../../releases) page (look for the Chrome `.zip` file).
2. Extract the ZIP file somewhere safe on your computer.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** via the toggle in the top-right corner.
5. Click the **Load unpacked** button in the top-left corner and select the extracted folder.

---

## 🛠️ Development Setup

If you want to contribute or build the project from source, ensure you have [pnpm](https://pnpm.io/) installed.

1. Clone this repository:
   ```bash
   git clone https://github.com/rotero08/NihongoAutoTracker.git
   cd NihongoAutoTracker
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   ```

> **Note:** WXT will automatically open a custom browser instance with the extension pre-loaded for hot-reloading.

---

## 🚀 Building for Production

To compile production-ready bundles for both major web stores simultaneously, run:

```bash
pnpm run zip:all
```

The compiled, ready-to-upload compression files will be located in the `.output/` directory.

---

## 🤖 Automatic Deployment & Releases

This repository is configured with GitHub Actions to automate building, publishing, and updating the extension.

To learn how to trigger a new deployment, automatically sync this description to the Firefox Add-ons Store, and retrieve the signed `.xpi` file, see the [Release Guide](RELEASE.md).

---

## 🔒 Privacy Policy

NihongoAutoTracker is designed with a strict focus on user privacy:

* No analytical tracking, ads, or telemetry software are bundled with this extension.
* Your logging history, preferences, and API keys reside completely locally in your browser storage.

For detailed information on data processing, please view the full [Privacy Policy](PRIVACY.md).

---

## ⚖️ Attribution & License

This extension interacts with [NihongoTracker](https://nihongotracker.com). All data retrieved from the site is licensed under **CC BY-NC-SA 4.0**.

This is an independent project and is not affiliated with or endorsed by NihongoTracker. Consistent with the source license, this extension is strictly **NonCommercial**.

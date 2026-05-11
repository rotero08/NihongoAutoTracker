# NihongoAutoTracker

An unofficial, customizable browser extension for **NihongoTracker** that automates and streamlines your Japanese immersion logging. 

Built with [WXT](https://wxt.dev/) and TypeScript.

## ✨ Features

* **Advanced Video Tracking**
  * Injects a sleek, non-intrusive tracking badge directly into Youtube.
  * **Smart Auto-Logging:** Set a threshold (e.g., 95% completion or 30 minutes watched). Once reached, the extension automatically logs the video to NihongoTracker.
  * **Smart Filters:** Optionally hide the tracker on non-Japanese videos or music videos automatically.
* **Reading & Context Menu Logging**
  * Highlight Japanese text, right-click, and log it. Automatically calculates characters and tracks your active reading time on the tab via a draggable overlay.
  * **TTU/Yatsu Reader Integration:** Seamlessly syncs your reading sessions from TTU Reader, Yatsu Reader, Manabe Reader in the background. Other Ttu forks probably work but you'll probably need to change the regex for automatic title/volume matching.
* **Smart Matching Media**
  * Automatically searches and matches your reading material (only Light Novels for now) with to ensure accurate logging to NihongoTracker.
* **Robust Queue System**
  * Logs don't have to be sent immediately. They are stored in a local Queue (accessible via a compact popup or the full settings page).
  * Group multiple short sessions of the same media together.
  * Edit time, characters, and dates before hitting "Send".
  * **End-of-Day Sync:** Optionally set the extension to automatically flush your queue and send everything right before midnight.
* **Configurable**
  * Custom site Allow/Skip lists for the reading overlay.
  * Toggle time tracking, switch between auto and manual modes, and customize overlay behaviour to keep your browsing clean.
  * Regex configuration available for more control over automatic title and volume detection.

## 🛠️ Installation for Development 

1. Clone this repository.
2. Run `pnpm install`.
3. Run `pnpm dev` to start the development server. WXT will automatically open a custom browser instance with the extension loaded.

## 📦 Building for Production

Run `pnpm build`. 
Your compiled extension will be located in the `.output/` directory, ready to be loaded into your browser manually.

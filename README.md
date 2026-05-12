# NihongoAutoTracker

An unofficial, customizable browser extension for **NihongoTracker** that automates and streamlines your Japanese immersion logging. 

Built with [WXT](https://wxt.dev/) and TypeScript.

---

## ✨ Features

### Advanced Video Tracking
Never forget to log a video again. The extension integrates smoothly into your viewing experience without cluttering the screen.

* Injects a sleek, non-intrusive tracking badge directly into the YouTube player.
* **Smart Auto-Logging:** Set a threshold (e.g., 95% completion or 30 minutes watched). Once reached, the extension automatically logs the video to NihongoTracker.
* **Smart Filters:** Optionally hide the tracker automatically on non-Japanese videos or music videos.

<p align="center">
 <img width="800" alt="YouTube Tracking Badge" src="https://github.com/user-attachments/assets/f395ec3c-23cc-4f19-a653-d4498e474664" />
</p>

### Reading & Context Menu Logging
Track your reading progress actively and seamlessly sync with popular web readers. 

* **Smart Matching:** Automatically searches and matches your reading material (Light Novels) to ensure accurate logging to NihongoTracker.
* **Reader Integration:** Seamlessly syncs your reading sessions from TTU Reader, Yatsu Reader, and Manabe Reader in the background.

<p align="center">
  <table>
    <tr>
      <td align="center"><b>Smart Title Matching</b></td>
      <td align="center"><b>Session History & Tracking</b></td>
    </tr>
    <tr>
      <td><img width="350" alt="Searching and matching a Light Novel" src="https://github.com/user-attachments/assets/f5a017ef-56da-4a0d-8ea7-cce247017211" /></td>
      <td><img width="350" alt="Active reading session and history" src="https://github.com/user-attachments/assets/59a47ad3-3650-4b0b-863f-52f603792253" /></td>
    </tr>
  </table>
</p>

* **Context Menu:** Automatically calculates characters and tracks your active reading time on the tab via a sleek, draggable overlay. Highlight Japanese text, right-click, and log it.

<p align="center">
  <img width="600" alt="Context menu logging showing 'Log to NihongoTracker" src="https://github.com/user-attachments/assets/24ecc674-f234-41be-bf1b-ea9d2f47e89f" />
</p>

### Robust Queue System
Logs don't have to be sent immediately. They are stored in a local queue, giving you complete control over your data before it hits the server.

* Group multiple short sessions of the same media together automatically.
* Edit time, characters, and dates before hitting "Send".
* Accessible via a compact extension popup for quick edits, or a full-page dashboard for deep queue management.
* **End-of-Day Sync:** Optionally set the extension to automatically flush your queue and send everything right before midnight.

<p align="center">
  <table>
    <tr>
      <td align="center"><b>Quick Popup Menu</b></td>
      <td align="center"><b>Full Dashboard View</b></td>
    </tr>
    <tr>
      <td valign="top"><img width="350" alt="Compact Extension Popup" src="https://github.com/user-attachments/assets/d0c7969d-9b8b-4cf8-a18f-ba2132e9ae47" /></td>
      <td valign="top"><img width="450" alt="Full Settings and Queue Page" src="https://github.com/user-attachments/assets/8c8518e3-f571-4fc3-b067-d7bfbf1ecbcb" /></td>
    </tr>
  </table>
</p>

### Configurable
Make it work exactly how you want it to.

* Custom site Allow/Skip lists for the reading overlay.
* Toggle time tracking, switch between auto and manual modes, and customize overlay behavior to keep your browsing clean.
* Regex configuration available for power users who want strict control over automatic title and volume detection.

---

## 🛠️ Installation for Development 

1. Clone this repository.
2. Run `pnpm install`.
3. Run `pnpm dev` to start the development server. (WIP)
4. WXT will automatically open a custom browser instance with the extension loaded. (WIP)

---

## 📦 Building for Production

Run `pnpm run zip:all` to build for both Chrome and Firefox simultaneously.

Your compiled extension files will be located in the `.output/` directory, ready to be loaded into your browser manually via developer mode.

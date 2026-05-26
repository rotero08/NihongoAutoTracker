# NihongoAutoTracker

An unofficial, customizable browser extension for **[NihongoTracker](https://nihongotracker.app/)** that automates and streamlines your Japanese immersion logging. 

Built with [WXT](https://wxt.dev/) and TypeScript.

## ✨ Features

### Queue System
Logs are stored in a local queue, giving you complete control over your data before it hits the server. There are various options to automate the process.

* **Session Management:** Group multiple short sessions of the same media together.
* **Manual Overrides:** Edit time, character counts, dates, volume and title before hitting "Send".
* **Smart Matching:** Search and match your reading material (Light Novels) to ensure accurate logging to NihongoTracker. A green checkmark appears when matched.
* **End-of-Day Sync:** Optionally set the extension to automatically flush your queue and send everything right before midnight.

<p align="center">
  <table>
    <tr>
      <td align="center"><b>Quick Popup Menu</b></td>
      <td align="center"><b>Full Dashboard View</b></td>
    </tr>
    <tr>
      <td valign="top"><img width="350" alt="Compact Extension Popup" src="https://github.com/user-attachments/assets/c1f24f88-7e2c-4849-90a4-eb6a60d4cf99" /></td>
      <td valign="top"><img width="450" alt="Full Settings and Queue Page" src="https://github.com/user-attachments/assets/ca3687e0-023f-4126-9bb0-200552b9361d" /></td>
    </tr>
  </table>
</p>

### Advanced Video Tracking
Never forget to log a video again. The extension integrates smoothly into your viewing experience without cluttering the screen.

* **In-Player Badge:** Injects a sleek, non-intrusive tracking badge directly into the player to monitor current and total session time.
* **Quick Context Menu:** Right-click any YouTube video or link to log it instantly to NihongoTracker without opening a single menu.
* **Smart Auto-Logging:** Optionally set thresholds (e.g., 95% completion or 30 minutes watched) to log content automatically in the background without sending it to the queue.

<p align="center">
 <img width="800" alt="YouTube Tracking Badge" src="https://github.com/user-attachments/assets/e58e8de0-f7c7-449e-ac5a-f0b197d2ccc9" />
</p>

* **Playlist Logger:** Bulk-log entire playlists or select specific videos directly from the YouTube sidebar or playlist header. Includes smart filters to automatically hide non-Japanese content.

<p align="center">
  <img width="400" alt="Playlist Logger Selector" src="https://github.com/user-attachments/assets/7229d5e0-0114-49d7-a136-e5869f221dab" />
</p>

### Reading & Context Menu Logging
Track your reading progress actively and seamlessly sync with popular web readers. 

* **Reader Integrated Dashboard:** Seamlessly syncs your reading sessions from Ttu Reader, Yatsu Reader, and Yomiyasu Reader in the background.
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
      <td><img width="350" alt="Searching and matching a Light Novel" src="https://github.com/user-attachments/assets/f5a017ef-56da-4a0d-8ea7-cce247017211" /></td>
      <td><img width="350" alt="Active reading session and history" src="https://github.com/user-attachments/assets/59a47ad3-3650-4b0b-863f-52f603792253" /></td>
    </tr>
  </table>
</p>

* **Text Context Menu:** Highlight Japanese text on any webpage, right-click, and log it instantly. The extension calculates character counts and reading time automatically.

<p align="center">
  <img width="600" alt="Context menu logging showing 'Log to NihongoTracker" src="https://github.com/user-attachments/assets/229c4c16-6fe4-4b70-8923-edb5da4342ee" />
</p>

### Configurable & Customizable
* **Theme Management:** Choose from multiple pre-built themes, or create, import, and share your own custom designs.
* **Site Filters:** Maintain Allow/Skip lists for the reading overlay to control exactly where tracking occurs.
* **Flexible Logic:** Toggle time tracking, switch between auto and manual modes, and set playlist-specific Japanese content filters.
* **Togglable Options:** Various options to personalize your viewing and reading experience.
* **Regex Engine:** Define custom regex rules for control over automatic title and volume detection.
* And more

## 🛠️ Installation for Development 

1. Clone this repository.
2. Run `pnpm install`.
3. Run `pnpm dev` to start the development server.
4. WXT will automatically open a custom browser instance with the extension loaded.

## 📦 Building for Production

Run `pnpm run zip:all` to build for both Chrome and Firefox simultaneously. Compiled files will be located in the `.output/` directory.

## ⚖️ Attribution

This extension interacts with [NihongoTracker](https://nihongotracker.com). All data retrieved from the site is licensed under **CC BY-NC-SA 4.0**. This is an independent project and is not affiliated with or endorsed by NihongoTracker. Consistent with the source license, this extension is strictly NonCommercial.
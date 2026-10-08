# Privacy Policy

NihongoAutoTracker is an open-source browser extension designed to facilitate manual and semi-automatic logging of Japanese language immersion to the NihongoTracker platform.

---

## 1. Data Collection & Local Storage
NihongoAutoTracker does not collect, store, or transmit any personal data to the extension developer or any unauthorized third parties. 

* **Local Storage:** All configuration settings, temporary immersion queues, and API keys are stored locally on your device using your browser's local storage engine (`storage.local`).
* **No Telemetry:** No analytics trackers, advertisements, or telemetry packages are bundled with this extension.

## 2. Data Transmission
Immersion logging data (such as media titles, reading duration, video watch time, volume numbers, and character counts) is transmitted only to the official NihongoTracker server (`https://nihongotracker.app`). The lookup requests described in section 3 carry media identifiers or titles, never your logs or your NihongoTracker API key.

* **User Intent:** Data transmission only occurs when you manually initiate a sync, use the context-menu logging features, or enable user-configured automatic queues.
* **Authentication:** Your API key is sent only in the secure HTTP headers of these requests to authorize your logs with the platform.

## 3. Third-Party Services
Your logs are sent only to NihongoTracker. For information on how your data is handled on their platform, please refer to the official [NihongoTracker Privacy Policy](https://nihongotracker.app/privacy).

To identify what you watched or read, the extension also makes lookup requests to the services below. None of them receive your NihongoTracker API key or your logs.

* **YouTube** (`youtube.com`): while you are on YouTube, the extension may request the page of the video or channel you are viewing to read its title, channel, and duration.
* **Trakt** (`api.trakt.tv`), only if you enable the Stremio integration: the extension signs in with the Trakt application credentials you provide and reads your watched history. Those credentials and the resulting access tokens are stored locally on your device.
* **AniList** (`graphql.anilist.co`), **arm** (`arm.haglund.dev`), and **ani.zip** (`api.ani.zip`), only if you enable the Stremio integration: the extension sends the public database identifiers (TVDB, TMDB, IMDb, or AniList IDs) of the shows and movies in your Trakt history to match them to the correct entry. No account information is sent.

These services can see your IP address and the identifiers requested, as with any web request, and are governed by their own privacy policies.

## 4. Contact
For questions regarding this policy or to inspect the open-source code, please visit our repository: [GitHub Repository](https://github.com/rotero08/NihongoAutoTracker)
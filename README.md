# NihongoAutoTracker

An unofficial, automated browser extension for **NihongoTracker**, designed to streamline your Japanese immersion logging. 

Built with [WXT](https://wxt.dev/) and TypeScript.

## Features
* **Context Menu Text Logging**: Highlight Japanese text, right-click, and log it. Automatically calculates characters and optionally tracks your active reading time on the tab.
* **Video Integration**: Injects buttons directly into YouTube, Crunchyroll, and HiAnime.
* **Smart Auto-Logging**: Configurable threshold (90-100%). Watch past your threshold, and the extension logs the full video duration for you.
* **Fully Configurable**: Toggle time tracking, switch between auto and manual modes, and hide UI elements to keep your browsing clean.

## Installation for Development (BazziteDX / Firefox)

1. Clone this repository.
2. Run `pnpm install`.
3. Run `pnpm dev` to start the development server. WXT will automatically open a custom Firefox instance with the extension loaded.

## Building for Production

Run `pnpm build`. 
Your compiled extension will be located in the `.output/` directory, ready to be loaded into Firefox via `about:debugging`.

# Intention Setter (Chrome Extension)

An intention setter that floats above your window while you browse. Set an intention, start a timer, keep a to-do list, and when the timer goes off it asks whether you completed your intention.

## Features
- **Floating panel** on every web page - drag it by its header, minimize it, or hide it.
- **Focus timer** (1-600 minutes, default 25) that keeps running across tabs, page reloads, and browser restarts.
- **Check-in when time is up** - the panel and a desktop notification ask *"Did you complete your intention?"*
  - **Yes** -> marks the intention as completed
  - **+5 min / +15 min** -> extends the timer
  - **No, end** -> ends the session
- **To-do list** - add, check off, delete, and clear completed tasks. Shared across all tabs.
- Toolbar button shows/hides the panel everywhere.

## Installation (load unpacked)
1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the repository folder (the one containing `manifest.json`).
5. Reload any tabs that were already open so the panel appears in them.

## Usage
1. Type your intention in the panel, choose the number of minutes, and press **Start** (or Enter).
2. Add tasks to the to-do list as you work.
3. When the timer ends, answer the check-in in the panel or in the notification.
4. Click the extension's toolbar icon to show or hide the panel.

## Permissions
| Permission | Why it is needed |
|---|---|
| `storage` | Saves your intention, timer, to-do list, and panel position locally |
| `alarms` | Fires the timer even when no tab is open |
| `notifications` | Shows the "Time's up" check-in |
| Content script on `<all_urls>` | Displays the floating panel on web pages |

All data stays in `chrome.storage.local` on your computer. Nothing is sent over the network.

## Known limitations
- Chrome does not allow extensions to run on `chrome://` pages, the Chrome Web Store, or the New Tab page, so the panel will not appear there. The notification still appears.
- After installing or updating the extension, reload open tabs to see the panel.

## Project structure
```
manifest.json   Extension manifest (Manifest V3)
background.js   Service worker: timer (chrome.alarms), check-in notification, toolbar toggle
content.js      Floating panel UI (Shadow DOM), to-do list, drag and minimize
LICENSE         MIT License
```

## License
Released under the [MIT License](LICENSE).

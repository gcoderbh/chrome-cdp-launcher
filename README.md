# 🤖 Chrome CDP Isolated Profile Manager

This tool provides a seamless way to launch and manage isolated Google Chrome profiles with an exposed Chrome DevTools Protocol (CDP) port. It allows AI agents (like Antigravity or Playwright) to securely automate the browser without interfering with your primary, day-to-day Chrome data.

---

## 🚀 How to Use (Global CLI)

1. Ensure you have installed the package globally (or use `npm link` for local development):
   ```bash
   npm i -g chrome-cdp-launcher
   ```
2. Run the command from anywhere in your terminal:
   ```bash
   chrome-cdp-launcher
   ```
3. **First-time Setup:** 
   - The CLI will ask for permission to automatically locate your Chrome executable path based on your OS.
   - It will save this path in `~/.chrome-cdp-launcher-config.json` for future use.
4. Select a **Profile** to use (e.g., `cdp-agent1`) or create a new one.
   *(Note: Each profile has completely isolated sessions, cookies, and browsing history. You can reuse the same profile to keep your social media or platform logins intact.)*
5. Confirm the debugging port (default is **`9222`**).
   *(Port 9222 is the standard port that AI systems and agents will automatically look for.)*
6. An isolated Chrome instance will launch. **Keep this window open!** (You can minimize it if you prefer).

---

## 🤖 How to Interact with the AI

Once the isolated Chrome window is open, AI agents running in your IDE (like Antigravity) will detect it instantly.
You can then instruct the AI using natural language, for example:

- *"Go to Facebook and search for 'Apple'."*
- *"Take a screenshot of this webpage."*
- *"Analyze the structure of this page and tell me what buttons are clickable."*
- *"Help me fill out this ad campaign form."*

---

## 🛑 How to Stop

You can simply close the Chrome window manually like a normal browser, or go back to your terminal and press `Ctrl+C` to terminate the launcher process at any time.

---

## ⚙️ Technical Details (For Geeks)
- **Profile Data Storage:** All isolated profiles are stored as black boxes in the following cross-platform directories:
  - **macOS:** `~/Library/Application Support/Chrome_CDP/`
  - **Windows:** `~\AppData\Local\Chrome_CDP\`
  - **Linux:** `~/.config/Chrome_CDP/`
- **MCP Configuration:** Ensure your agent's MCP Playwright configuration is pointing to `http://127.0.0.1:9222`.

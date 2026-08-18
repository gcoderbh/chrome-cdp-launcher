#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { select, input, confirm } from '@inquirer/prompts';
import { getConfig, saveConfig } from './config.js';
import { promptForChromePath } from './chromeLocator.js';
import WebSocket from 'ws';

const execAsync = promisify(exec);

// Determine a cross-platform directory for CDP profiles
let CDP_BASE_DIR;
if (os.platform() === 'darwin') {
    CDP_BASE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Chrome_CDP');
} else if (os.platform() === 'win32') {
    CDP_BASE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'Chrome_CDP');
} else {
    CDP_BASE_DIR = path.join(os.homedir(), '.config', 'Chrome_CDP');
}

function getCdpProfiles() {
    if (!fs.existsSync(CDP_BASE_DIR)) {
        return [];
    }
    const entries = fs.readdirSync(CDP_BASE_DIR, { withFileTypes: true });
    return entries
        .filter(e => e.isDirectory() && e.name.startsWith('cdp-'))
        .map(e => ({ name: e.name, value: e.name }));
}

function showHelp() {
    console.log(`
\x1b[36m===================================================\x1b[0m
\x1b[1m🤖 Chrome CDP Isolated Profile Manager\x1b[0m
\x1b[36m===================================================\x1b[0m

\x1b[33mDescription:\x1b[0m
  A powerful CLI tool to launch completely isolated 
  Google Chrome profiles with an exposed Chrome DevTools 
  Protocol (CDP) debugging port.

  Perfect for AI agents (Antigravity, Playwright, Puppeteer) 
  to automate tasks without interfering with your personal 
  Chrome data!

\x1b[33mUsage:\x1b[0m
  \x1b[32mchrome-cdp-launcher\x1b[0m [options]

\x1b[33mOptions:\x1b[0m
  \x1b[32m-h, --help\x1b[0m     Show this beautiful help message

\x1b[33mStorage Locations:\x1b[0m
  \x1b[34mmacOS:\x1b[0m   ~/Library/Application Support/Chrome_CDP
  \x1b[34mWindows:\x1b[0m ~\\AppData\\Local\\Chrome_CDP
  \x1b[34mLinux:\x1b[0m   ~/.config/Chrome_CDP

\x1b[36m===================================================\x1b[0m
`);
    process.exit(0);
}

function setupProfilePreferences(profilePath, downloadPath) {
    try {
        const defaultDir = path.join(profilePath, 'Default');
        if (!fs.existsSync(defaultDir)) {
            fs.mkdirSync(defaultDir, { recursive: true });
        }
        const prefFile = path.join(defaultDir, 'Preferences');
        let prefs = {};
        if (fs.existsSync(prefFile)) {
            try {
                prefs = JSON.parse(fs.readFileSync(prefFile, 'utf-8'));
            } catch (e) {
                prefs = {};
            }
        }

        prefs.download = prefs.download || {};
        prefs.download.default_directory = downloadPath;
        prefs.download.prompt_for_download = false;
        prefs.download.directory_upgrade = true;
        prefs.download.extensions_to_open = prefs.download.extensions_to_open || '';

        prefs.savefile = prefs.savefile || {};
        prefs.savefile.default_directory = downloadPath;

        prefs.profile = prefs.profile || {};
        prefs.profile.default_content_setting_values = prefs.profile.default_content_setting_values || {};
        prefs.profile.default_content_setting_values.automatic_downloads = 1;

        prefs.profile.content_settings = prefs.profile.content_settings || {};
        prefs.profile.content_settings.exceptions = prefs.profile.content_settings.exceptions || {};
        prefs.profile.content_settings.exceptions.automatic_downloads = {
            "*,*": { "setting": 1 }
        };

        fs.writeFileSync(prefFile, JSON.stringify(prefs, null, 2), 'utf-8');
    } catch (e) {
        console.error('⚠️  Failed to preconfigure profile preferences:', e.message);
    }
}

async function enableCdpDownloads(port, downloadPath) {
    const startTime = Date.now();
    const timeoutMs = 8000;

    while (Date.now() - startTime < timeoutMs) {
        try {
            let configured = false;

            // 1. Browser-level download behavior
            try {
                const versionRes = await fetch(`http://127.0.0.1:${port}/json/version`);
                if (versionRes.ok) {
                    const versionData = await versionRes.json();
                    if (versionData.webSocketDebuggerUrl) {
                        await new Promise((resolve) => {
                            const ws = new WebSocket(versionData.webSocketDebuggerUrl);
                            let resolved = false;
                            const finish = () => {
                                if (!resolved) {
                                    resolved = true;
                                    try { ws.close(); } catch (_) {}
                                    resolve();
                                }
                            };
                            ws.on('open', () => {
                                ws.send(JSON.stringify({
                                    id: 101,
                                    method: "Browser.setDownloadBehavior",
                                    params: {
                                        behavior: "allow",
                                        downloadPath: downloadPath,
                                        eventsEnabled: true
                                    }
                                }));
                            });
                            ws.on('message', (data) => {
                                try {
                                    const msg = JSON.parse(data.toString());
                                    if (msg.id === 101) {
                                        configured = true;
                                        finish();
                                    }
                                } catch (_) {
                                    finish();
                                }
                            });
                            ws.on('error', finish);
                            setTimeout(finish, 1500);
                        });
                    }
                }
            } catch (_) {}

            // 2. Page-level download behavior for all existing pages
            try {
                const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
                if (listRes.ok) {
                    const targets = await listRes.json();
                    const pages = targets.filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
                    for (const page of pages) {
                        await new Promise((resolve) => {
                            const ws = new WebSocket(page.webSocketDebuggerUrl);
                            let resolved = false;
                            const finish = () => {
                                if (!resolved) {
                                    resolved = true;
                                    try { ws.close(); } catch (_) {}
                                    resolve();
                                }
                            };
                            ws.on('open', () => {
                                ws.send(JSON.stringify({
                                    id: 102,
                                    method: "Page.setDownloadBehavior",
                                    params: {
                                        behavior: "allow",
                                        downloadPath: downloadPath
                                    }
                                }));
                            });
                            ws.on('message', (data) => {
                                try {
                                    const msg = JSON.parse(data.toString());
                                    if (msg.id === 102) {
                                        configured = true;
                                        finish();
                                    }
                                } catch (_) {
                                    finish();
                                }
                            });
                            ws.on('error', finish);
                            setTimeout(finish, 1000);
                        });
                    }
                }
            } catch (_) {}

            if (configured) {
                return true;
            }
        } catch (_) {}

        await new Promise(r => setTimeout(r, 400));
    }
    return false;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    showHelp();
}

async function run() {
    console.log("🤖 Chrome CDP Isolated Profile Manager\n");
    
    // 1. Configuration check and setup wizard
    let config = getConfig();
    if (!config.chromeExecutablePath || !fs.existsSync(config.chromeExecutablePath)) {
        if (config.chromeExecutablePath) {
            console.log(`⚠️  Configured Chrome path not found: ${config.chromeExecutablePath}`);
        }
        const newPath = await promptForChromePath();
        config.chromeExecutablePath = newPath;
        saveConfig(config);
        console.log(`✅ Saved Chrome path to config.\n`);
    }

    if (!fs.existsSync(CDP_BASE_DIR)) {
        fs.mkdirSync(CDP_BASE_DIR, { recursive: true });
    }

    const profiles = getCdpProfiles();
    
    // Add create new option
    const choices = [
        { name: "✨ [Create New CDP Profile]", value: "CREATE_NEW" },
        ...profiles
    ];

    let selectedProfile = await select({
        message: 'Select a CDP Profile to launch:',
        choices: choices,
        pageSize: 15
    });

    if (selectedProfile === "CREATE_NEW") {
        let newName = await input({
            message: 'Enter a name for the new profile (e.g. agent1):',
            validate: val => val.trim().length > 0 || 'Name cannot be empty'
        });
        
        // Clean the name and ensure prefix
        newName = newName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (!newName.startsWith('cdp-')) {
            selectedProfile = `cdp-${newName}`;
        } else {
            selectedProfile = newName;
        }
    }

    const port = await input({
        message: 'Enter the debugging port:',
        default: '9222',
        validate: value => !isNaN(parseInt(value)) || 'Please enter a valid port number'
    });

    console.log(`\n🚀 Launching Isolated Chrome on Port ${port} for Profile '${selectedProfile}'...`);
    
    const profilePath = path.join(CDP_BASE_DIR, selectedProfile);
    const downloadPath = config.downloadPath || path.join(os.homedir(), 'Downloads');

    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    // Preconfigure Chrome profile preferences for downloads
    setupProfilePreferences(profilePath, downloadPath);
    
    // Launch Chrome using the configured executable path
    let cmd;
    if (os.platform() === 'win32') {
        cmd = `start "" "${config.chromeExecutablePath}" --remote-debugging-port=${port} --user-data-dir="${profilePath}" --no-first-run --no-default-browser-check --lang=en-US`;
    } else {
        cmd = `"${config.chromeExecutablePath}" --remote-debugging-port=${port} --user-data-dir="${profilePath}" --no-first-run --no-default-browser-check --lang=en-US > /dev/null 2>&1 &`;
    }
    
    await execAsync(cmd);
    
    // Configure CDP browser-level & page-level download behavior
    await enableCdpDownloads(port, downloadPath);
    
    console.log(`\n✅ Isolated Chrome CDP started successfully!`);
    console.log(`📂 Profile Data Stored at: ${profilePath}`);
    console.log(`📥 Download Folder: ${downloadPath}\n`);
}

run().catch(console.error);

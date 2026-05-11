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
    
    // Launch Chrome using the configured executable path
    let cmd;
    if (os.platform() === 'win32') {
        cmd = `start "" "${config.chromeExecutablePath}" --remote-debugging-port=${port} --user-data-dir="${profilePath}" --no-first-run --no-default-browser-check --lang=en-US`;
    } else {
        cmd = `"${config.chromeExecutablePath}" --remote-debugging-port=${port} --user-data-dir="${profilePath}" --no-first-run --no-default-browser-check --lang=en-US > /dev/null 2>&1 &`;
    }
    
    await execAsync(cmd);
    
    // Optional delay to ensure port binds
    await new Promise(r => setTimeout(r, 1500));
    
    // Automatically enable downloads for the default page
    try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) {
            const targets = await res.json();
            const page = targets.find(t => t.type === 'page');
            if (page && page.webSocketDebuggerUrl) {
                const ws = new WebSocket(page.webSocketDebuggerUrl);
                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        id: 1,
                        method: "Page.setDownloadBehavior",
                        params: {
                            behavior: "allow",
                            downloadPath: path.join(os.homedir(), 'Downloads')
                        }
                    }));
                });
                ws.on('message', (data) => {
                    const response = JSON.parse(data.toString());
                    if (response.id === 1) {
                        console.log(`📥 Downloads explicitly allowed to: ${path.join(os.homedir(), 'Downloads')}`);
                        ws.close();
                    }
                });
                ws.on('error', () => {
                    ws.close();
                });
            }
        }
    } catch (e) {
        // Silently fail if we can't connect, let the user proceed
    }
    
    console.log(`\n✅ Isolated Chrome CDP started successfully!`);
    console.log(`📂 Profile Data Stored at: ${profilePath}\n`);
}

run().catch(console.error);

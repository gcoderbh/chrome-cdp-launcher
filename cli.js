#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { select, input, confirm } from '@inquirer/prompts';
import { getConfig, saveConfig } from './config.js';
import { promptForChromePath } from './chromeLocator.js';

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
    
    console.log(`\n✅ Isolated Chrome CDP started successfully!`);
    console.log(`📂 Profile Data Stored at: ${profilePath}\n`);
}

run().catch(console.error);

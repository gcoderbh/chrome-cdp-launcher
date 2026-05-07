import os from 'os';
import fs from 'fs';
import { confirm, input } from '@inquirer/prompts';

const commonPaths = {
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
    ],
    win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ],
    linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
    ]
};

export function findChrome() {
    const platform = os.platform();
    const paths = commonPaths[platform] || [];
    
    for (const p of paths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

export async function promptForChromePath() {
    const autoDetect = await confirm({
        message: 'Chrome executable path is not configured. Would you like me to detect it automatically based on your OS?',
        default: true
    });

    if (autoDetect) {
        const foundPath = findChrome();
        if (foundPath) {
            const useFound = await confirm({
                message: `Found Chrome at:\n  ${foundPath}\nUse this path?`,
                default: true
            });
            if (useFound) {
                return foundPath;
            }
        } else {
            console.log('❌ Could not automatically find Chrome.');
        }
    }

    const manualPath = await input({
        message: 'Please enter the absolute path to your Chrome executable:',
        validate: (val) => {
            const trimmed = val.trim();
            if (!trimmed) return 'Path cannot be empty.';
            if (fs.existsSync(trimmed)) return true;
            return 'File does not exist. Please enter a valid path.';
        }
    });

    return manualPath.trim();
}

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.chrome-cdp-launcher-config.json');

export function getConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        return {};
    }
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading config file:', e.message);
        return {};
    }
}

export function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error saving config file:', e.message);
    }
}

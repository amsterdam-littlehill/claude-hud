import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getHudPluginDir } from '../claude-config-dir.js';
const BUDDY_NAMES = [
    'Bubbles', 'Noodle', 'Pip', 'Zephyr', 'Mochi', 'Fizz', 'Tofu',
    'Waffle', 'Nimbus', 'Pebble', 'Sprout', 'Cubby', 'Ditto', 'Jelly',
    'Scout', 'Wisp', 'Twitch', 'Bop', 'Pip', 'Mochi',
];
const BUDDY_PERSONALITIES = [
    'curious', 'chill', 'mischievous', 'loyal', 'sleepy',
    'bouncy', 'wise', 'snarky', 'gentle', 'hyper',
];
function getStatePath() {
    return path.join(getHudPluginDir(os.homedir()), 'buddy-state.json');
}
function randomName() {
    return BUDDY_NAMES[Math.floor(Math.random() * BUDDY_NAMES.length)];
}
function randomPersonality() {
    return BUDDY_PERSONALITIES[Math.floor(Math.random() * BUDDY_PERSONALITIES.length)];
}
export function loadBuddyState() {
    const statePath = getStatePath();
    try {
        if (!fs.existsSync(statePath))
            return null;
        const content = fs.readFileSync(statePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export function saveBuddyState(state) {
    const statePath = getStatePath();
    try {
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    }
    catch {
        // Silently ignore write errors
    }
}
export function generateBuddyState() {
    return {
        companion: {
            name: randomName(),
            personality: randomPersonality(),
            hatchedAt: Date.now(),
        },
        seed: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
        createdAt: Date.now(),
    };
}
export function ensureBuddyState() {
    const existing = loadBuddyState();
    if (existing)
        return existing;
    const fresh = generateBuddyState();
    saveBuddyState(fresh);
    return fresh;
}
//# sourceMappingURL=state.js.map
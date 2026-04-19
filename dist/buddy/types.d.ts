export declare const RARITIES: readonly ["common", "uncommon", "rare", "epic", "legendary"];
export type Rarity = (typeof RARITIES)[number];
export declare const duck: "duck";
export declare const goose: "goose";
export declare const blob: "blob";
export declare const cat: "cat";
export declare const dragon: "dragon";
export declare const octopus: "octopus";
export declare const owl: "owl";
export declare const penguin: "penguin";
export declare const turtle: "turtle";
export declare const snail: "snail";
export declare const ghost: "ghost";
export declare const axolotl: "axolotl";
export declare const capybara: "capybara";
export declare const cactus: "cactus";
export declare const robot: "robot";
export declare const rabbit: "rabbit";
export declare const mushroom: "mushroom";
export declare const chonk: "chonk";
export declare const SPECIES: readonly ["duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin", "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot", "rabbit", "mushroom", "chonk"];
export type Species = (typeof SPECIES)[number];
export declare const EYES: readonly ["·", "✦", "×", "◉", "@", "°"];
export type Eye = (typeof EYES)[number];
export declare const HATS: readonly ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"];
export type Hat = (typeof HATS)[number];
export declare const STAT_NAMES: readonly ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];
export type StatName = (typeof STAT_NAMES)[number];
export type CompanionBones = {
    rarity: Rarity;
    species: Species;
    eye: Eye;
    hat: Hat;
    shiny: boolean;
    stats: Record<StatName, number>;
};
export type CompanionSoul = {
    name: string;
    personality: string;
};
export type Companion = CompanionBones & CompanionSoul & {
    hatchedAt: number;
};
export type StoredCompanion = CompanionSoul & {
    hatchedAt: number;
};
export declare const RARITY_WEIGHTS: {
    readonly common: 60;
    readonly uncommon: 25;
    readonly rare: 10;
    readonly epic: 4;
    readonly legendary: 1;
};
export declare const RARITY_STARS: {
    readonly common: "★";
    readonly uncommon: "★★";
    readonly rare: "★★★";
    readonly epic: "★★★★";
    readonly legendary: "★★★★★";
};
export declare const RARITY_COLORS: {
    readonly common: "dim";
    readonly uncommon: "green";
    readonly rare: "cyan";
    readonly epic: "brightBlue";
    readonly legendary: "yellow";
};
//# sourceMappingURL=types.d.ts.map
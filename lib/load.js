"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEmbedChannel = exports.loadBans = exports.loadEmojis = exports.loadAFK = exports.loadChannels = exports.loadRoles = exports.loadConfig = void 0;
const discord_js_1 = require("discord.js");
const util_1 = require("./util");
const path_1 = require('path');
const fs_1 = require('fs');
/**
 * Restores the guild configuration
 */
const loadConfig = (guild, backupData) => {
    const configPromises = [];
    if (backupData.name) {
        configPromises.push(guild.setName(backupData.name));
    }
    if (backupData.iconBase64) {
        configPromises.push(guild.setIcon(Buffer.from(backupData.iconBase64, 'base64')));
    }
    else if (backupData.iconURL) {
        configPromises.push(guild.setIcon(backupData.iconURL));
    }
    if (backupData.splashBase64) {
        configPromises.push(guild.setSplash(Buffer.from(backupData.splashBase64, 'base64')));
    }
    else if (backupData.splashURL) {
        configPromises.push(guild.setSplash(backupData.splashURL));
    }
    if (backupData.bannerBase64) {
        configPromises.push(guild.setBanner(Buffer.from(backupData.bannerBase64, 'base64')));
    }
    else if (backupData.bannerURL) {
        configPromises.push(guild.setBanner(backupData.bannerURL));
    }
    if (backupData.verificationLevel) {
        configPromises.push(guild.setVerificationLevel(backupData.verificationLevel));
    }
    if (backupData.defaultMessageNotifications) {
        configPromises.push(guild.setDefaultMessageNotifications(backupData.defaultMessageNotifications));
    }
    const changeableExplicitLevel = guild.features.includes(discord_js_1.GuildFeature.Community);
    if (backupData.explicitContentFilter && changeableExplicitLevel) {
        configPromises.push(guild.setExplicitContentFilter(backupData.explicitContentFilter));
    }
    return Promise.all(configPromises);
};
exports.loadConfig = loadConfig;

async function loadMessagesFromBatches(channelId, guildId) {
    const dir = path_1.join(__dirname, 'backups', `messages-${guildId}`);
    console.log('Directory:', dir);  // Add this log for debugging
    
    if (!fs_1.existsSync(dir)) {
        console.warn(`Directory does not exist: ${dir}`);
        return [];
    }

    const files = fs_1.readdirSync(dir)
        .filter(file => file.startsWith(channelId))
        .sort((a, b) => {
            const aIndex = parseInt(a.split('-batch-')[1]);
            const bIndex = parseInt(b.split('-batch-')[1]);
            return aIndex - bIndex;
        });

    console.log('Files found for channelId:', files);  // Add this log for debugging

    const allMessages = [];

    for (const file of files) {
        const filePath = path_1.join(dir, file);
        console.log('Loading file:', filePath);  // Add this log for debugging
        
        const content = await fs_1.promises.readFile(filePath, 'utf8');
        const batch = JSON.parse(content);
        allMessages.push(...batch);
    }

    return allMessages;
}


/**
 * Restore the guild roles
 */
const loadRoles = (guild, backupData) => {
    const rolePromises = [];
    backupData.roles.forEach((roleData) => {
        if (roleData.isEveryone) {
            rolePromises.push(guild.roles.cache.get(guild.id).edit({
                name: roleData.name,
                color: roleData.color,
                permissions: BigInt(roleData.permissions),
                mentionable: roleData.mentionable
            }));
        }
        else {
            rolePromises.push(guild.roles.create({
                name: roleData.name,
                color: roleData.color,
                hoist: roleData.hoist,
                permissions: BigInt(roleData.permissions),
                mentionable: roleData.mentionable
            }));
        }
    });
    return Promise.all(rolePromises);
};
exports.loadRoles = loadRoles;
/**
 * Restore the guild channels
 */


const loadChannels = async (guild, backupData, options) => {
    const loadChannelPromises = [];

    // Handle categories and their children
    for (const categoryData of backupData.channels.categories) {
        const createdCategory = await util_1.loadCategory(categoryData, guild);
        
        for (const channelData of categoryData.children) {
            // Ensure channelData.messages is always an array
            if (!channelData.messages || channelData.messages.length === 0) {
                try {
                    // If messages are not defined or empty, try to load them from batches
                    channelData.messages = channelData.messages || [];  // Ensure it's an array
                    console.log('Channel Data:', channelData);  // Add this log to check if channelData is correct
                    console.log('Channel ID:', channelData.ID); // Ensure that `id` is being accessed properly
                    channelData.messages = await loadMessagesFromBatches(channelData.ID, backupData.guildID);
                } catch (e) {
                    console.warn(`Failed to load message batches for ${channelData.name}: ${e.message}`);
                }
            }

            // Proceed with loading the channel
            loadChannelPromises.push(util_1.loadChannel(channelData, guild, createdCategory, options));
        }
    }

    // Handle non-categorized channels
    for (const channelData of backupData.channels.others) {
        // Ensure channelData.messages is always an array
        if (!channelData.messages || channelData.messages.length === 0) {
            try {
                // If messages are not defined or empty, try to load them from batches
                channelData.messages = channelData.messages || [];  // Ensure it's an array
                channelData.messages = await loadMessagesFromBatches(channelData.id, guild.id);
            } catch (e) {
                console.warn(`Failed to load message batches for ${channelData.name}: ${e.message}`);
            }
        }

        // Proceed with loading the channel
        loadChannelPromises.push(util_1.loadChannel(channelData, guild, null, options));
    }

    // Wait for all channels to be loaded
    return Promise.all(loadChannelPromises);
};
exports.loadChannels = loadChannels;
/**
 * Restore the afk configuration
 */
const loadAFK = (guild, backupData) => {
    const afkPromises = [];
    if (backupData.afk) {
        afkPromises.push(guild.setAFKChannel(guild.channels.cache.find((ch) => ch.name === backupData.afk.name && ch.type === discord_js_1.ChannelType.GuildVoice)));
        afkPromises.push(guild.setAFKTimeout(backupData.afk.timeout));
    }
    return Promise.all(afkPromises);
};
exports.loadAFK = loadAFK;
/**
 * Restore guild emojis
 */
const loadEmojis = (guild, backupData) => {
    const emojiPromises = [];
    backupData.emojis.forEach((emoji) => {
        if (emoji.url) {
            emojiPromises.push(guild.emojis.create({
                name: emoji.name,
                attachment: emoji.url
            }));
        }
        else if (emoji.base64) {
            emojiPromises.push(guild.emojis.create({
                name: emoji.name,
                attachment: Buffer.from(emoji.base64, 'base64')
            }));
        }
    });
    return Promise.all(emojiPromises);
};
exports.loadEmojis = loadEmojis;
/**
 * Restore guild bans
 */
const loadBans = (guild, backupData) => {
    const banPromises = [];
    backupData.bans.forEach((ban) => {
        banPromises.push(guild.members.ban(ban.id, {
            reason: ban.reason
        }));
    });
    return Promise.all(banPromises);
};
exports.loadBans = loadBans;
/**
 * Restore embedChannel configuration
 */
const loadEmbedChannel = (guild, backupData) => {
    const embedChannelPromises = [];
    if (backupData.widget.channel) {
        embedChannelPromises.push(guild.setWidgetSettings({
            enabled: backupData.widget.enabled,
            channel: guild.channels.cache.find((ch) => ch.name === backupData.widget.channel)
        }));
    }
    return Promise.all(embedChannelPromises);
};
exports.loadEmbedChannel = loadEmbedChannel;

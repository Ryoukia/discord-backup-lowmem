"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChannels = exports.getEmojis = exports.getRoles = exports.getMembers = exports.getBans = void 0;
const discord_js_1 = require("discord.js");
const node_fetch_1 = require("node-fetch");
const {
    fetchTextChannelData,
    fetchVoiceChannelData,
    fetchChannelPermissions,
    // any other functions you use from util.js
  } = require("./util");
const fs = require('fs');
const path = require('path');
/**
 * Returns an array with the banned members of the guild
 * @param {Guild} guild The Discord guild
 * @returns {Promise<BanData[]>} The banned members
 */
async function getBans(guild) {
    const bans = [];
    const cases = await guild.bans.fetch(); // Gets the list of the banned members
    cases.forEach((ban) => {
        bans.push({
            id: ban.user.id,
            reason: ban.reason // Ban reason
        });
    });
    return bans;
}
exports.getBans = getBans;
/**
 * Returns an array with the members of the guild
 * @param {Guild} guild The Discord guild
 * @returns {Promise<MemberData>}
 */
async function getMembers(guild) {
    const members = [];
    guild.members.cache.forEach((member) => {
        members.push({
            userId: member.user.id,
            username: member.user.username,
            discriminator: member.user.discriminator,
            avatarUrl: member.user.avatarURL(),
            joinedTimestamp: member.joinedTimestamp,
            roles: member.roles.cache.map((role) => role.id),
            bot: member.user.bot // Member bot
        });
    });
    return members;
}
exports.getMembers = getMembers;
/**
 * Returns an array with the roles of the guild
 * @param {Guild} guild The discord guild
 * @returns {Promise<RoleData[]>} The roles of the guild
 */
async function getRoles(guild) {
    const roles = [];
    guild.roles.cache
        .filter((role) => !role.managed)
        .sort((a, b) => b.position - a.position)
        .forEach((role) => {
        const roleData = {
            name: role.name,
            color: role.hexColor,
            hoist: role.hoist,
            permissions: role.permissions.bitfield.toString(),
            mentionable: role.mentionable,
            position: role.position,
            isEveryone: guild.id === role.id
        };
        roles.push(roleData);
    });
    return roles;
}
exports.getRoles = getRoles;
/**
 * Returns an array with the emojis of the guild
 * @param {Guild} guild The discord guild
 * @param {CreateOptions} options The backup options
 * @returns {Promise<EmojiData[]>} The emojis of the guild
 */
async function getEmojis(guild, options) {
    const emojis = [];
    guild.emojis.cache.forEach(async (emoji) => {
        const eData = {
            name: emoji.name
        };
        if (options.saveImages && options.saveImages === 'base64') {
            eData.base64 = (await (0, node_fetch_1.default)(emoji.url).then((res) => res.buffer())).toString('base64');
        }
        else {
            eData.url = emoji.url;
        }
        emojis.push(eData);
    });
    return emojis;
}
exports.getEmojis = getEmojis;
/**
 * Returns an array with the channels of the guild
 * @param {Guild} guild The discord guild
 * @param {CreateOptions} options The backup options
 * @returns {ChannelData[]} The channels of the guild
 */
async function getChannels(guild, options) {
    return new Promise(async (resolve) => {
        const channels = {
            categories: [],
            others: []
        };

        const messageDir = path.join(__dirname, 'backups', `messages-${guild.id}`);
        if (!fs.existsSync(messageDir)) {
            fs.mkdirSync(messageDir, { recursive: true });
        }

        const customOptions = {
            ...options,
            onBatch: async (batch, index, channelId) => {
                const filePath = path.join(messageDir, `${channelId}-batch-${index}.json`);
                await fs.promises.writeFile(filePath, JSON.stringify(batch, null, 2));
            }
        };

        // === CATEGORIES ===
        const categories = guild.channels.cache
            .filter((ch) => ch.type === discord_js_1.ChannelType.GuildCategory)
            .sort((a, b) => a.position - b.position)
            .toJSON();

        for (const category of categories) {
            const categoryData = {
                name: category.name,
                permissions: fetchChannelPermissions(category),
                children: []
            };

            const children = category.children.cache.sort((a, b) => a.position - b.position).toJSON();

            for (const child of children) {
                if (child.type === discord_js_1.ChannelType.GuildText || child.type === discord_js_1.ChannelType.GuildNews) {
                    const channelData = await fetchTextChannelData(child, {
                        ...customOptions,
                        onBatch: async (batch, index) => {
                            const filePath = path.join(messageDir, `${child.id}-batch-${index}.json`);
                            await fs.promises.writeFile(filePath, JSON.stringify(batch, null, 2));
                        }
                    }, guild.id);
                    delete channelData.messages; // avoid loading all messages in memory
                    categoryData.children.push(channelData);
                } else {
                    const channelData = await fetchVoiceChannelData(child);
                    categoryData.children.push(channelData);
                }
            }

            channels.categories.push(categoryData);
        }

        // === OTHER CHANNELS ===
        const others = guild.channels.cache
            .filter((ch) => {
                return !ch.parent && ch.type !== discord_js_1.ChannelType.GuildCategory &&
                    ch.type !== discord_js_1.ChannelType.GuildNewsThread &&
                    ch.type !== discord_js_1.ChannelType.GuildPrivateThread &&
                    ch.type !== discord_js_1.ChannelType.GuildPublicThread;
            })
            .sort((a, b) => a.position - b.position)
            .toJSON();

        for (const channel of others) {
            if (channel.type === discord_js_1.ChannelType.GuildText || channel.type === discord_js_1.ChannelType.GuildNews) {
                const channelData = await fetchTextChannelData(channel, {
                    ...customOptions,
                    onBatch: async (batch, index) => {
                        const filePath = path.join(messageDir, `${channel.id}-batch-${index}.json`);
                        await fs.promises.writeFile(filePath, JSON.stringify(batch, null, 2));
                    }
                },guild.id);
                delete channelData.messages;
                channels.others.push(channelData);
            } else {
                const channelData = await fetchVoiceChannelData(channel);
                channels.others.push(channelData);
            }
        }

        resolve(channels);
    });
}
exports.getChannels = getChannels;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearGuild = exports.loadChannel = exports.loadCategory = exports.fetchTextChannelData = exports.fetchChannelMessages = exports.fetchVoiceChannelData = exports.fetchChannelPermissions = void 0;
const discord_js_1 = require("discord.js");
const node_fetch_1 = require("node-fetch");
const path = require('path');
const fs_1 = require('fs');
const { AttachmentBuilder } = require('discord.js');
const MaxBitratePerTier = {
    [discord_js_1.GuildPremiumTier.None]: 64000,
    [discord_js_1.GuildPremiumTier.Tier1]: 128000,
    [discord_js_1.GuildPremiumTier.Tier2]: 256000,
    [discord_js_1.GuildPremiumTier.Tier3]: 384000
};
/**
 * Gets the permissions for a channel
 */
function fetchChannelPermissions(channel) {
    const permissions = [];
    channel.permissionOverwrites.cache
        .filter((p) => p.type === discord_js_1.OverwriteType.Role)
        .forEach((perm) => {
        // For each overwrites permission
        const role = channel.guild.roles.cache.get(perm.id);
        if (role) {
            permissions.push({
                roleName: role.name,
                allow: perm.allow.bitfield.toString(),
                deny: perm.deny.bitfield.toString()
            });
        }
    });
    return permissions;
}
exports.fetchChannelPermissions = fetchChannelPermissions;
/**
 * Fetches the voice channel data that is necessary for the backup
 */
async function fetchVoiceChannelData(channel) {
    return new Promise(async (resolve) => {
        const channelData = {
            type: discord_js_1.ChannelType.GuildVoice,
            name: channel.name,
            bitrate: channel.bitrate,
            userLimit: channel.userLimit,
            parent: channel.parent ? channel.parent.name : null,
            permissions: fetchChannelPermissions(channel)
        };
        /* Return channel data */
        resolve(channelData);
    });
}
exports.fetchVoiceChannelData = fetchVoiceChannelData;

/*async function fetchChannelMessages(channel, options) {
    let messages = [];
    const messageCount = isNaN(options.maxMessagesPerChannel) ? 10 : options.maxMessagesPerChannel;
    const fetchOptions = { limit: 100 };
    let lastMessageId;
    let fetchComplete = false;
    while (!fetchComplete) {
        if (lastMessageId) {
            fetchOptions.before = lastMessageId;
        }
        const fetched = await channel.messages.fetch(fetchOptions);
        if (fetched.size === 0) {
            break;
        }
        lastMessageId = fetched.last().id;
        await Promise.all(fetched.map(async (msg) => {
            if (!msg.author || messages.length >= messageCount) {
                fetchComplete = true;
                return;
            }
            const files = await Promise.all(msg.attachments.map(async (a) => {
                let attach = a.url;
                if (a.url && ['png', 'jpg', 'jpeg', 'jpe', 'jif', 'jfif', 'jfi'].includes(a.url)) {
                    if (options.saveImages && options.saveImages === 'base64') {
                        attach = (await ((0, node_fetch_1.default)(a.url).then((res) => res.buffer()))).toString('base64');
                    }
                }
                return {
                    name: a.name,
                    attachment: attach
                };
            }));
            messages.push({
                username: msg.author.username,
                avatar: msg.author.displayAvatarURL(),
                content: msg.cleanContent,
                embeds: msg.embeds,
                files,
                pinned: msg.pinned,
                sentAt: msg.createdAt.toISOString(),
            });
        }));
    }
    return messages;
}*/

async function fetchChannelMessages(channel, options = {}) {
    const {
        maxMessagesPerChannel = 1000,
        batchSize = 100,
        delayMs = 500,
        saveImages = false,
        onBatch = null // Optional: function to handle each batch
    } = options;

    const messages = [];
    let lastMessageId;
    let fetchedCount = 0;
    let done = false;

    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    while (!done) {
        const fetchOptions = { limit: batchSize };
        if (lastMessageId) {
            fetchOptions.before = lastMessageId;
        }

        const fetched = await channel.messages.fetch(fetchOptions);
        if (fetched.size === 0) break;

        lastMessageId = fetched.last().id;

        const batch = [];

        for (const msg of fetched.values()) {
            if (!msg.author) continue;
            if (fetchedCount >= maxMessagesPerChannel) {
                done = true;
                break;
            }

            const files = await Promise.all(msg.attachments.map(async (a) => {
                let attachment = a.url;
                if (
                    saveImages === 'base64' &&
                    /\.(png|jpe?g|gif|webp)$/i.test(a.name || '')
                ) {
                    const res = await fetch(a.url);
                    const buffer = await res.buffer();
                    attachment = buffer.toString('base64');
                }

                return {
                    name: a.name,
                    attachment
                };
            }));

            batch.push({
                username: msg.author.username,
                avatar: msg.author.displayAvatarURL(),
                content: msg.cleanContent,
                embeds: msg.embeds,
                files,
                pinned: msg.pinned,
                sentAt: msg.createdAt.toISOString()
            });

            fetchedCount++;
        }

        // Optionally process or save each batch as it's fetched
        if (onBatch && typeof onBatch === 'function') {
            await onBatch(batch, messages.length); // (batch, currentTotal)
        } else {
            messages.push(...batch);
        }

        // Wait between fetches to avoid rate limits
        await delay(delayMs);

        if (fetchedCount >= maxMessagesPerChannel) break;
    }

    return onBatch ? null : messages; // If streamed, don't return all
}

exports.fetchChannelMessages = fetchChannelMessages;
/**
 * Fetches the text channel data that is necessary for the backup
 */
async function fetchTextChannelData(channel, options, guildId) {
    return new Promise(async (resolve) => {
        const channelData = {
            type: channel.type,
            name: channel.name,
            nsfw: channel.nsfw,
            ID: channel.id,
            rateLimitPerUser: channel.type === discord_js_1.ChannelType.GuildText ? channel.rateLimitPerUser : undefined,
            parent: channel.parent ? channel.parent.name : null,
            topic: channel.topic,
            permissions: fetchChannelPermissions(channel),
            messages: [],
            isNews: channel.type === discord_js_1.ChannelType.GuildNews,
            threads: []
        };

        // Directory to save batches
        const dir = path.join(__dirname, 'backups', `messages-${guildId}`);
        if (!fs_1.existsSync(dir)) fs_1.mkdirSync(dir, { recursive: true });

        // Save main channel messages in batches
        let batchIndex = 0;
        await fetchChannelMessages(channel, {
            ...options,
            onBatch: async (batch) => {
                const fileName = `${channel.id}-batch-${batchIndex}.json`;
                const filePath = path.join(dir, fileName);
                await fs_1.promises.writeFile(filePath, JSON.stringify(batch, null, 2));
                batchIndex++;
            }
        });

        // Fetch threads
        if (channel.threads.cache.size > 0) {
            await Promise.all(channel.threads.cache.map(async (thread) => {
                const threadData = {
                    type: thread.type,
                    name: thread.name,
                    archived: thread.archived,
                    autoArchiveDuration: thread.autoArchiveDuration,
                    locked: thread.locked,
                    rateLimitPerUser: thread.rateLimitPerUser,
                    messages: []
                };

                // Save thread messages in batches too
                let threadBatchIndex = 0;
                await fetchChannelMessages(thread, {
                    ...options,
                    onBatch: async (batch) => {
                        const fileName = `${thread.id}-batch-${threadBatchIndex}.json`;
                        const filePath = path.join(dir, fileName);
                        await fs_1.promises.writeFile(filePath, JSON.stringify(batch, null, 2));
                        threadBatchIndex++;
                    }
                });

                channelData.threads.push(threadData);
            }));
        }

        // Don't keep messages in memory
        channelData.messages = [];
        resolve(channelData);
    });
}
exports.fetchTextChannelData = fetchTextChannelData;
/**
 * Creates a category for the guild
 */
async function loadCategory(categoryData, guild) {
    return new Promise((resolve) => {
        guild.channels.create({
            name: categoryData.name,
            type: discord_js_1.ChannelType.GuildCategory
        }).then(async (category) => {
            // When the category is created
            const finalPermissions = [];
            categoryData.permissions.forEach((perm) => {
                const role = guild.roles.cache.find((r) => r.name === perm.roleName);
                if (role) {
                    finalPermissions.push({
                        id: role.id,
                        allow: BigInt(perm.allow),
                        deny: BigInt(perm.deny)
                    });
                }
            });
            await category.permissionOverwrites.set(finalPermissions);
            resolve(category); // Return the category
        });
    });
}
exports.loadCategory = loadCategory;

async function loadMessages(channel, messages, options = {}, previousWebhook = null) {
    const {
        delayMs = 500,
        maxMessagesPerBatch = 1, // Can be increased for optimization
        allowedMentions = { parse: [] },
        onProgress = null // Optional: (index, total) => {}
    } = options;

    // Create webhook if not provided
    const webhook = previousWebhook || await channel.createWebhook({
        name: 'MessagesBackup',
        avatar: channel.client.user.displayAvatarURL()
    }).catch(() => null);

    if (!webhook) {
        console.warn(`Failed to create webhook in ${channel.name}`);
        return null;
    }

    // Clean and reverse the message list
    const filteredMessages = messages
        .filter(m => m.content || m.embeds?.length || m.files?.length)
        .reverse(); // To send oldest to newest

    // Rate-limited loop
    for (let i = 0; i < filteredMessages.length; i += maxMessagesPerBatch) {
        const batch = filteredMessages.slice(i, i + maxMessagesPerBatch);

        for (const msg of batch) {
            try {
                const sent = await webhook.send({
                    content: msg.content || undefined,
                    username: msg.username,
                    avatarURL: msg.avatar,
                    embeds: msg.embeds,
                    files: msg.files
                        .filter(f => f.attachment && f.name)  // Ensure the file has both attachment and name
                        .map(f => {
                        // Clean the URL to remove any query parameters (if needed)
                        const cleanedUrl = f.attachment.split('?')[0];
                      
                        // Create an AttachmentBuilder with the cleaned URL and file name
                        return new AttachmentBuilder(cleanedUrl, { name: f.name });
                    }),
                    allowedMentions,
                    threadId: channel.isThread() ? channel.id : undefined
                });

                if (msg.pinned && sent) {
                    await sent.pin().catch(() => {});
                }

                if (onProgress) onProgress(i + 1, filteredMessages.length);

                await delay(delayMs); // Wait between messages
            } catch (err) {
                console.warn(`Failed to send message ${i + 1}: ${err.message}`);
            }
        }
    }

    return webhook;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a channel and returns it
 */
async function loadChannel(channelData, guild, category, options) {
    return new Promise(async (resolve) => {
        /*const loadMessages = (channel, messages, previousWebhook) => {
            return new Promise(async (resolve) => {
                const webhook = previousWebhook || await channel.createWebhook({
                    name: 'MessagesBackup',
                    avatar: channel.client.user.displayAvatarURL()
                }).catch(() => { });
                if (!webhook)
                    return resolve();
                messages = messages
                    .filter((m) => m.content.length > 0 || m.embeds.length > 0 || m.files.length > 0)
                    .reverse();
                messages = messages.slice(messages.length - options.maxMessagesPerChannel);
                for (const msg of messages) {
                    const sentMsg = await webhook
                        .send({
                        content: msg.content.length ? msg.content : undefined,
                        username: msg.username,
                        avatarURL: msg.avatar,
                        embeds: msg.embeds,
                        files: msg.files.map((f) => new discord_js_1.AttachmentBuilder(f.attachment, {
                            name: f.name
                        })),
                        allowedMentions: options.allowedMentions,
                        threadId: channel.isThread() ? channel.id : undefined
                    })
                        .catch((err) => {
                        console.log(err.message);
                    });
                    if (msg.pinned && sentMsg)
                        await sentMsg.pin();
                }
                resolve(webhook);
            });
        };*/
        const createOptions = {
            name: channelData.name,
            type: null,
            parent: category
        };
        if (channelData.type === discord_js_1.ChannelType.GuildText || channelData.type === discord_js_1.ChannelType.GuildNews) {
            createOptions.topic = channelData.topic;
            createOptions.nsfw = channelData.nsfw;
            createOptions.rateLimitPerUser = channelData.rateLimitPerUser;
            createOptions.type =
                channelData.isNews && guild.features.includes(discord_js_1.GuildFeature.News) ? discord_js_1.ChannelType.GuildNews : discord_js_1.ChannelType.GuildText;
        }
        else if (channelData.type === discord_js_1.ChannelType.GuildVoice) {
            // Downgrade bitrate
            let bitrate = channelData.bitrate;
            const bitrates = Object.values(MaxBitratePerTier);
            while (bitrate > MaxBitratePerTier[guild.premiumTier]) {
                bitrate = bitrates[guild.premiumTier];
            }
            createOptions.bitrate = bitrate;
            createOptions.userLimit = channelData.userLimit;
            createOptions.type = discord_js_1.ChannelType.GuildVoice;
        }
        guild.channels.create(createOptions).then(async (channel) => {
            /* Update channel permissions */
            const finalPermissions = [];
            channelData.permissions.forEach((perm) => {
                const role = guild.roles.cache.find((r) => r.name === perm.roleName);
                if (role) {
                    finalPermissions.push({
                        id: role.id,
                        allow: BigInt(perm.allow),
                        deny: BigInt(perm.deny)
                    });
                }
            });
            await channel.permissionOverwrites.set(finalPermissions);
            if (channelData.type === discord_js_1.ChannelType.GuildText) {
                /* Load messages */
                let webhook;
                if (channelData.messages.length > 0) {
                    webhook = await loadMessages(channel, channelData.messages).catch(() => { });
                }
                /* Load threads */
                if (channelData.threads.length > 0) { //&& guild.features.includes('THREADS_ENABLED')) {
                    await Promise.all(channelData.threads.map(async (threadData) => {
                        let autoArchiveDuration = threadData.autoArchiveDuration;
                        //if (!guild.features.includes('SEVEN_DAY_THREAD_ARCHIVE') && autoArchiveDuration === 10080) autoArchiveDuration = 4320;
                        //if (!guild.features.includes('THREE_DAY_THREAD_ARCHIVE') && autoArchiveDuration === 4320) autoArchiveDuration = 1440;
                        return channel.threads.create({
                            name: threadData.name,
                            autoArchiveDuration
                        }).then((thread) => {
                            if (!webhook)
                                return;
                            return loadMessages(thread, threadData.messages, webhook);
                        });
                    }));
                }
                return channel;
            }
            else {
                resolve(channel); // Return the channel
            }
        });
    });
}
exports.loadChannel = loadChannel;
/**
 * Delete all roles, all channels, all emojis, etc... of a guild
 */
async function clearGuild(guild) {
    guild.roles.cache
        .filter((role) => !role.managed && role.editable && role.id !== guild.id)
        .forEach((role) => {
        role.delete().catch(() => { });
    });
    guild.channels.cache.forEach((channel) => {
        channel.delete().catch(() => { });
    });
    guild.emojis.cache.forEach((emoji) => {
        emoji.delete().catch(() => { });
    });
    const webhooks = await guild.fetchWebhooks();
    webhooks.forEach((webhook) => {
        webhook.delete().catch(() => { });
    });
    const bans = await guild.bans.fetch();
    bans.forEach((ban) => {
        guild.members.unban(ban.user).catch(() => { });
    });
    guild.setAFKChannel(null);
    guild.setAFKTimeout(60 * 5);
    guild.setIcon(null);
    guild.setBanner(null).catch(() => { });
    guild.setSplash(null).catch(() => { });
    guild.setDefaultMessageNotifications(discord_js_1.GuildDefaultMessageNotifications.OnlyMentions);
    guild.setWidgetSettings({
        enabled: false,
        channel: null
    });
    if (!guild.features.includes(discord_js_1.GuildFeature.Community)) {
        guild.setExplicitContentFilter(discord_js_1.GuildExplicitContentFilter.Disabled);
        guild.setVerificationLevel(discord_js_1.GuildVerificationLevel.None);
    }
    guild.setSystemChannel(null);
    guild.setSystemChannelFlags([discord_js_1.GuildSystemChannelFlags.SuppressGuildReminderNotifications, discord_js_1.GuildSystemChannelFlags.SuppressJoinNotifications, discord_js_1.GuildSystemChannelFlags.SuppressPremiumSubscriptions]);
    return;
}
exports.clearGuild = clearGuild;

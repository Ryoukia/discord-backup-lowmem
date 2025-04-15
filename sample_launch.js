// Load modules
const { Client, GatewayIntentBits, Partials, EmbedBuilder, Events } = require('discord.js');
const backup = require('discord-backup');

const settings = {
    prefix: 'b!',
    token: 'yourTokenHere' // ⚠️ Replace with your token
};

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel] // Required to send DMs
});

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.content.startsWith(settings.prefix) || message.author.bot || !message.guild) return;

    const args = message.content.slice(settings.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'create') {
        if (!message.member.permissions.has('Administrator')) {
            return message.channel.send(':x: | You must be an administrator of this server to request a backup!');
        }
        message.channel.send(':happybee: | starting backup!!! glorty to memme temme!!!');
        backup.create(message.guild, {
            maxMessagesPerChannel: 180000,
            jsonBeautify: true,
        }).then((backupData) => {
            message.author.send(`The backup has been created! To load it, type this command on the server of your choice: \`${settings.prefix}load ${backupData.id}\``);
            message.channel.send(':white_check_mark: Backup successfully created. The backup ID was sent in DM!');
        });
    }

    if (command === 'load') {
        if (!message.member.permissions.has('Administrator')) {
            return message.channel.send(':x: | You must be an administrator of this server to load a backup!');
        }

        const backupID = args[0];
        if (!backupID) {
            return message.channel.send(':x: | You must specify a valid backup ID!');
        }

        backup.fetch(backupID).then(async () => {
            message.channel.send(':warning: | When the backup is loaded, all channels, roles, etc. will be replaced! Type `-confirm` to confirm!');

            const filter = m => m.author.id === message.author.id && m.content === '-confirm';
            try {
                await message.channel.awaitMessages({ filter, max: 1, time: 20000, errors: ['time'] });
                message.author.send(':white_check_mark: | Start loading the backup!');
                backup.load(backupID, message.guild).then(() => {
                    backup.remove(backupID);
                }).catch(err => {
                    console.error(err);
                    message.author.send(':x: | Sorry, an error occurred... Please check that I have administrator permissions!');
                });
            } catch (err) {
                return message.channel.send(':x: | Time\'s up! Cancelled backup loading!');
            }
        }).catch(err => {
            console.error(err);
            return message.channel.send(`:x: | No backup found for \`${backupID}\`!`);
        });
    }

    if (command === 'infos') {
        const backupID = args[0];
        if (!backupID) {
            return message.channel.send(':x: | You must specify a valid backup ID!');
        }

        backup.fetch(backupID).then((backupInfos) => {
            const date = new Date(backupInfos.data.createdTimestamp);
            const formattedDate = `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;

            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Backup Information' })
                .addFields(
                    { name: 'Backup ID', value: backupInfos.id },
                    { name: 'Server ID', value: backupInfos.data.guildID },
                    { name: 'Size', value: `${backupInfos.size} kb` },
                    { name: 'Created at', value: formattedDate }
                )
                .setColor(0xFF0000);

            message.channel.send({ embeds: [embed] });
        }).catch(err => {
            return message.channel.send(`:x: | No backup found for \`${backupID}\`!`);
        });
    }
});

client.login(settings.token);

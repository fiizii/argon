const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const JSONdb = require('simple-json-db');
const db = new JSONdb('./dbs/tickets.json');
const { v4: uuidv4 } = require('uuid');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a ticket for age verification.'),
    async execute(interaction, client) {
        if (interaction.channel.type === 'DM') { return; }
        if (interaction.channel.id !== '1276992473910083654') { return; }
        const guild = interaction.guild;
        const user = interaction.user;
        await interaction.deferReply({ ephemeral: true });

        const hasOpenTicket = Object.values(db.JSON()).some(ticket => ticket.userId === user.id && ticket.status === 'waiting_for_mod');
        if (hasOpenTicket) {
            await interaction.followUp({ content: 'You already have an open ticket.', ephemeral: true });
            return;
        }

        if (!guild) {
            await interaction.followUp({ content: 'This command can only be used in the server.', ephemeral: true });
            return;
        }

        const category = guild.channels.cache.get('1276960875403673683');

        const ticketChannel = await guild.channels.create({
            name: `ticket-${user.id}`,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: client.user.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                },
            ],
        });

        const ticketId = uuidv4();

        db.set(ticketId, {
            userId: user.id,
            channelId: ticketChannel.id,
            status: 'waiting_for_mod',
            createdAt: Date.now()
        });

        await sendModeratorSelectionMessage(ticketChannel, user, ticketId);

        await interaction.followUp({ content: `Ticket created in ${ticketChannel}`, ephemeral: true });
    }
};

async function sendModeratorSelectionMessage(channel, user, ticketId) {
    const onlineModerators = channel.guild.members.cache.filter(member =>
        member.roles.cache.some(role => role.id == "1236285478039326730") &&
        member.presence?.status === "online" &&
        member.id !== user.id
    );
    const offlineModerators = channel.guild.members.cache.filter(member =>
        member.roles.cache.some(role => role.id == "1236285478039326730") &&
        member.presence?.status !== "online" &&
        member.id !== user.id
    );

    let components = [];

    const anyModButton = new ButtonBuilder()
        .setCustomId(`any_mod_${ticketId}`)
        .setLabel('Any available moderator')
        .setStyle(ButtonStyle.Primary);

    if (onlineModerators.size > 0) {
        const onlineModButtons = onlineModerators.first(4).map(mod =>
            new ButtonBuilder()
                .setCustomId(`select_mod_${mod.id}_${ticketId}`)
                .setLabel(mod.user.username)
                .setStyle(ButtonStyle.Primary)
        );

        const onlineButtonRow = new ActionRowBuilder().addComponents([anyModButton, ...onlineModButtons]);
        components.push(onlineButtonRow);
    } else {
        const anyModRow = new ActionRowBuilder().addComponents([anyModButton]);
        components.push(anyModRow);
    }

    if (offlineModerators.size > 0) {
        const offlineModOptions = offlineModerators.first(25).map(mod =>
            new StringSelectMenuOptionBuilder()
                .setLabel(mod.user.username)
                .setValue(`select_mod_${mod.id}_${ticketId}`)
        );

        const offlineModMenu = new StringSelectMenuBuilder()
            .setCustomId(`offline_mods_${ticketId}`)
            .setPlaceholder('Select an offline moderator')
            .addOptions(offlineModOptions);

        const offlineMenuRow = new ActionRowBuilder().addComponents(offlineModMenu);
        components.push(offlineMenuRow);
    }

    const embed = new EmbedBuilder()
        .setTitle('Age Verification Ticket')
        .setDescription('Please select a moderator to handle your ticket.')
        .setColor('#0099ff');

    await channel.send({ embeds: [embed], components });
}
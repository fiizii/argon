const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const JSONdb = require('simple-json-db');
const db = new JSONdb('./dbs/tickets.json');
const { v4: uuidv4 } = require('uuid');

const TICKET_CHANNEL_ID = '1276992473910083654';
const TICKET_CATEGORY_ID = '1276960875403673683';
const MOD_ROLE_ID = '1236285478039326730';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a ticket for age verification.'),
    async execute(interaction, client) {
        if (interaction.channel.type === 'DM' || interaction.channel.id !== TICKET_CHANNEL_ID) {
            return interaction.reply({ content: 'This command can only be used in the designated ticket channel.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const { guild, user } = interaction;

        if (hasOpenTicket(user.id)) {
            return interaction.followUp({ content: 'You already have an open ticket.', ephemeral: true });
        }

        if (alreadyVerified(user.id)) {
            return interaction.followUp({ content: 'You are already verified puppy! No need to check you for fleas again..', ephemeral: true });
        }

        const ticketChannel = await createTicketChannel(guild, user, client.user);
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

function hasOpenTicket(userId) {
    return Object.values(db.JSON()).some(ticket => ticket.userId === userId && ticket.status === 'waiting_for_mod');
}
function alreadyVerified(userId) {
    return Object.values(db.JSON()).some(ticket => ticket.userId === userId && ticket.status === 'verified');
}
async function createTicketChannel(guild, user, clientUser) {
    const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
    return guild.channels.create({
        name: `ticket-${user.id}`,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: user.id, allow: [PermissionFlagsBits.ViewChannel] },
            { id: clientUser.id, allow: [PermissionFlagsBits.ViewChannel] },
        ],
    });
}

async function sendModeratorSelectionMessage(channel, user, ticketId) {
    const moderators = getModerators(channel.guild, user.id);
    const components = createModeratorComponents(moderators, ticketId);

    const embed = new EmbedBuilder()
        .setTitle('Age Verification Ticket')
        .setDescription('Please select a moderator to handle your ticket.')
        .setColor('#0099ff');

    await channel.send({ embeds: [embed], components });
}

function getModerators(guild, userId) {
    return guild.members.cache.filter(member =>
        member.roles.cache.has(MOD_ROLE_ID) && member.id !== userId
    ).partition(member => member.presence?.status === "online");
}

function createModeratorComponents([onlineMods, offlineMods], ticketId) {
    const components = [];

    const anyModButton = new ButtonBuilder()
        .setCustomId(`any_mod_${ticketId}`)
        .setLabel('Any available moderator')
        .setStyle(ButtonStyle.Primary);

    if (onlineMods.size > 0) {
        const onlineModButtons = onlineMods.first(4).map(mod =>
            new ButtonBuilder()
                .setCustomId(`select_mod_${mod.id}_${ticketId}`)
                .setLabel(mod.user.username)
                .setStyle(ButtonStyle.Primary)
        );
        components.push(new ActionRowBuilder().addComponents([anyModButton, ...onlineModButtons]));
    } else {
        components.push(new ActionRowBuilder().addComponents([anyModButton]));
    }

    if (offlineMods.size > 0) {
        const offlineModOptions = offlineMods.first(25).map(mod =>
            new StringSelectMenuOptionBuilder()
                .setLabel(mod.user.username)
                .setValue(`select_mod_${mod.id}_${ticketId}`)
        );
        const offlineModMenu = new StringSelectMenuBuilder()
            .setCustomId(`offline_mods_${ticketId}`)
            .setPlaceholder('Select an offline moderator')
            .addOptions(offlineModOptions);
        components.push(new ActionRowBuilder().addComponents(offlineModMenu));
    }

    return components;
}
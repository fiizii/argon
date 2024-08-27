const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const JSONdb = require('simple-json-db');

const MOD_ROLE_ID = '1236285478039326730';
const VERIFIED_ROLE_ID = '1276960602362871938';

async function handleMod(interaction, log = console) {
    const db = new JSONdb('./dbs/tickets.json');

    const [action, _, modId, ticketId] = interaction.isStringSelectMenu() 
        ? interaction.values[0].split('_') 
        : interaction.customId.split('_');

    log.info(`Action: ${action}, Mod ID: ${modId}, Ticket ID: ${ticketId}`);

    const ticketData = action === 'any' ? db.get(modId) : db.get(ticketId);
    const _ticketId = action === 'any' ? modId : ticketId;
    if (!ticketData) {
        await interaction.reply({ content: 'This ticket no longer exists.', ephemeral: true });
        return;
    }

    const channel = await interaction.guild.channels.fetch(ticketData.channelId);
    const user = await interaction.client.users.fetch(ticketData.userId);
    const modRole = interaction.guild.roles.cache.get(MOD_ROLE_ID);

    if (action === 'select') {
        const mod = await interaction.guild.members.fetch(modId);
        await channel.permissionOverwrites.edit(mod.id, { ViewChannel: true });
        await channel.send(`${mod}, you have been selected to handle this ticket.`);
        log.info(`${mod.user.tag} has been selected to handle ticket ${_ticketId}`);
    } else if (action === 'any') {
        await channel.permissionOverwrites.edit(modRole.id, { ViewChannel: true });
        await channel.send('No specific moderator was selected. Any available moderator can handle this ticket. @here');
        log.info(`Any available moderator has been selected to handle ticket ${_ticketId}`);
    }

    ticketData.status = 'mod_selected';
    db.set(_ticketId, ticketData);

    await sendVerificationInstructions(channel, user, _ticketId);
    await interaction.update({ components: [] });
}

async function sendVerificationInstructions(channel, user, ticketId) {
    const verificationEmbed = new EmbedBuilder()
        .setTitle('Age Verification Instructions')
        .setDescription('Hey pup, follow these steps to verify your age:')
        .addFields(
            { name: 'Step 1', value: 'Take a clear photo of your ID on a piece of paper with the server name and your username written.' },
            { name: 'Step 2', value: 'Censor everything but your birthday and upload the photo to this channel' },
            { name: 'Step 3', value: 'Wait for a moderator to review your submission' }
        )
        .setColor('#00ff00');

    const modTools = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`verify_success_${ticketId}`)
            .setLabel('Verify User')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`verify_failure_${ticketId}`)
            .setLabel('Reject Verification')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`ban_user_${ticketId}`)
            .setLabel('Super Reject (Ban)')
            .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [verificationEmbed], components: [modTools] });
}

async function handleVerif(interaction, log = console) {
    const db = new JSONdb('./dbs/tickets.json');

    const [action, result, ticketId] = interaction.customId.split('_');
    log.info(`Action: ${action}, Result: ${result}, Ticket ID: ${ticketId}`);

    const ticketData = db.get(ticketId);
    
    if (!ticketData) {
        await interaction.reply({ content: 'This ticket no longer exists.', ephemeral: true });
        return;
    }

    const channel = await interaction.guild.channels.fetch(ticketData.channelId);
    const member = await interaction.guild.members.fetch(ticketData.userId);

    switch (result) {
        case 'success':
            await verifyUser(channel, member, log);
            break;
        case 'failure':
            await rejectUser(channel, member, log);
            break;
        case 'ban':
            await banUser(channel, member, log);
            break;
        default:
            log.error(`Unknown verification result: ${result}`);
            return;
    }

    ticketData.status = result === 'success' ? 'verified' : result === 'ban' ? 'banned' : 'rejected';
    db.set(ticketId, ticketData);
    await interaction.update({ components: [] });
}

async function verifyUser(channel, member, log) {
    
    const verifiedRole = channel.guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (verifiedRole) {
        await member.roles.add(verifiedRole);
    }
    await channel.send(`${member}, your age verification was successful. Welcome puppy!`);
    log.info(`${member.user.tag} has been verified as an adult\`\`\`\n> ${member.user.tag}\n> ${member.user.id}\n\`\`\`${Date.now()}`);
    setTimeout(() => channel.delete(), 5000);
}

async function rejectUser(channel, member, log) {
    await member.timeout(7 * 24 * 60 * 60 * 1000, 'Failed age verification');
    await channel.send(`${member}, your age verification was unsuccessful. You can try again in a week.`);
    log.info(`${member.user.tag} has failed age verification`);
    setTimeout(() => channel.delete(), 5000);
}

async function banUser(channel, member, log) {
    await member.ban({ reason: 'Underage user' });
    await channel.send(`${member} has been banned for being underage.`);
    log.info(`${member.user.tag} has been banned for being underage`);
    setTimeout(() => channel.delete(), 5000);
}

async function handleInteraction(interaction, log = console) {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const [action] = interaction.customId.split('_');

        switch (action) {
            case 'any':
            case 'select':
            case 'offline':
                await handleMod(interaction, log);
                break;
            case 'verify':
            case 'ban':
                if (interaction.member.roles.cache.has(MOD_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.ADMINISTRATOR)) {
                    await handleVerif(interaction, log);
                } else {
                    await interaction.reply({ content: 'Bad dog! You aren\'t allowed to verify people.', ephemeral: true });
                }
                break;
            default:
                log.warn(`Unknown interaction: ${interaction.customId}`);
        }
    }
}

module.exports = { handleInteraction };
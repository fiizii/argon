const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const JSONdb = require('simple-json-db');
const db = new JSONdb('./dbs/tickets.json');


async function selMod(interaction, Log=console) {
    let action, modId, ticketId;
    console.log(interaction);
    if (interaction.isStringSelectMenu()) {
        [action, _, modId, ticketId] = interaction.values[0].split('_');
    } else {
        [action, _, modId, ticketId] = interaction.customId.split('_');
    }
    Log.info(`Action: ${action}, Mod ID: ${modId}, Ticket ID: ${ticketId}`);
    let ticketData = db.get((ticketId || modId));
 
    
    if (!ticketData) {
        await interaction.reply({ content: 'This ticket no longer exists.', ephemeral: true });
        return;
    }

    const channel = await interaction.guild.channels.fetch(ticketData.channelId);
    const user = await interaction.client.users.fetch(ticketData.userId);
    const modRole = interaction.guild.roles.cache.find(role => role.id === '1236285478039326730');
    if (action === 'select') {
        const mod = await interaction.guild.members.fetch(modId);
        await channel.permissionOverwrites.edit(mod.id, { ViewChannel: true });
        await channel.send(`${mod}, you have been selected to handle this ticket.`);
        Log.info(`${mod.user.tag} has been selected to handle ticket ${ticketId}`);
    } else if (action === 'any') {
        await channel.permissionOverwrites.edit(modRole.id, { ViewChannel: true });
        await channel.send('No specific moderator was selected. Any available moderator can handle this ticket. @here');
        Log.info(`Any available moderator has been selected to handle ticket ${ticketId}`);
    }

    ticketData.status = 'mod_selected';
    db.set(ticketId, ticketData);

    await sendVerificationInstructions(channel, user, ticketId);
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

async function handleVerif(interaction, Log=console) {
    const [action, result, ticketId] = interaction.customId.split('_');
    const ticketData = db.get(ticketId);

    if (!ticketData) {
        await interaction.reply({ content: 'This ticket no longer exists.', ephemeral: true });
        return;
    }

    const channel = await interaction.guild.channels.fetch(ticketData.channelId);
    const user = await interaction.client.users.fetch(ticketData.userId);
    const member = await interaction.guild.members.fetch(user.id);

    if (result === 'success') {
        Log.info(`${member.user.tag} has been verified as an adult`);
        await handleVerificationSuccess(channel, member);
    } else if (result === 'failure') {
        Log.info(`${member.user.tag} has failed age verification`);
        await handleVerificationFailure(channel, member);
    } else if (action === 'ban') {
        Log.info(`${member.user.tag} has been banned for being underage`);
        await handleBanUser(channel, member);
    }

    db.delete(ticketId);
    await interaction.update({ components: [] });
}

async function handleVerificationSuccess(channel, member) {
    const verifiedRole = channel.guild.roles.cache.find(role => role.id === "1276960602362871938");
    if (verifiedRole) {
        await member.roles.add(verifiedRole);
    }
    await channel.send(`${member}, your age verification was successful. Welcome puppy!`);

    setTimeout(() => channel.delete(), 5000);
}

async function handleVerificationFailure(channel, member) {
    await member.timeout(7 * 24 * 60 * 60 * 1000, 'Failed age verification');
    await channel.send(`${member}, your age verification was unsuccessful. You can try again in a week.`);
    setTimeout(() => channel.delete(), 5000);
}

async function handleBanUser(channel, member) {
    await member.ban({ reason: 'Underage user' });
    await channel.send(`${member} has been banned for being underage.`);
    setTimeout(() => channel.delete(), 5000);
}
async function handleInteraction(interaction, Log=console) {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('any_mod_') || interaction.customId.startsWith('select_mod_') || interaction.customId.startsWith('offline_mods_')) {
            await selMod(interaction, Log);
        } else if (interaction.customId.startsWith('verify_') || interaction.customId.startsWith('ban_user_')) {
            // check if the user is a moderator
            if (interaction.member.roles.cache.some(role => role.id === '1236285478039326730') || interaction.member.permissions.has(PermissionFlagsBits.ADMINISTRATOR)) {
        
                await handleVerif(interaction, Log);
            } else {
                await interaction.reply({ content: 'Bad dog! You arent allowed to verify people.', ephemeral: true });
            }
        }
    }
}
module.exports = {
    handleInteraction
};
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const JSONdb = require('simple-json-db');

// Config constants
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1236285478039326730';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || '1276960602362871938';
const BAN_LOG_ID = process.env.BAN_LOG_ID || '1236307562941644880';

/**
 * Main interaction handler for ticket system
 */
async function handleInteraction(interaction, log = console) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    try {
        const [action] = interaction.customId.split('_');

        // Authentication for verification actions
        const isModAction = ['verify', 'ban', 'confirm'].includes(action);
        const hasPerm = interaction.member.roles.cache.has(MOD_ROLE_ID) ||
            interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (isModAction && !hasPerm) {
            return interaction.reply({
                content: '🐾 Bad dog! You don\'t have permission to verify members.',
                ephemeral: true
            });
        }

        // Handle different action types
        switch (action) {
            case 'any':
            case 'select':
            case 'offline':
                await handleModSelection(interaction, log);
                break;
            case 'verify':
            case 'ban':
                await handleVerification(interaction, log);
                break;
            case 'confirm':
                await handleConfirmation(interaction, log);
                break;
            case 'cancel':
                await handleCancellation(interaction, log);
                break;
            default:
                log.warn(`Unknown interaction action: ${action}`);
                await interaction.reply({
                    content: 'Something went wrong. Please try again!',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.log(error)
        log.error('Error handling ticket interaction:', error);
        await interaction.reply({
            content: 'Oops! Something broke. Please try again later.',
            ephemeral: true
        }).catch(() => { });
    }
}

/**
 * Handle moderator selection interactions
 */
async function handleModSelection(interaction, log) {
    const db = new JSONdb('./dbs/tickets.json');
    let ticketId, ticketData;

    // Parse the interaction data
    if (interaction.isStringSelectMenu()) {
        const [action, _, modId, id] = interaction.values[0].split('_');
        ticketId = id;
    } else {
        const parts = interaction.customId.split('_');
        if (parts[0] === 'any') {
            ticketId = parts[2];
        } else {
            ticketId = parts[3];
        }
    }

    // Get ticket data
    ticketData = db.get(ticketId);
    if (!ticketData) {
        return await interaction.reply({
            content: 'This ticket no longer exists.',
            ephemeral: true
        });
    }

    try {
        const channel = await interaction.guild.channels.fetch(ticketData.channelId);
        const user = await interaction.client.users.fetch(ticketData.userId);

        // Handle different selection types
        if (interaction.customId.startsWith('any_mod')) {
            // Any mod selected
            const modRole = interaction.guild.roles.cache.get(MOD_ROLE_ID);
            await channel.permissionOverwrites.edit(modRole.id, { ViewChannel: true });
            await channel.send({
                content: '🔔 No specific moderator was selected. Any available moderator can handle this ticket.',
                allowedMentions: { parse: ['everyone'] }
            });
            ticketData.anyModSelected = true;
            log.info(`Ticket ${ticketId} opened for any moderator`);

        } else if (interaction.customId.startsWith('select_mod') || interaction.isStringSelectMenu()) {
            // Specific mod selected
            const modId = interaction.isStringSelectMenu() 
                ? interaction.values[0].split('_')[2] 
                : interaction.customId.split('_')[2];
                
            const mod = await interaction.guild.members.fetch(modId);

            await channel.permissionOverwrites.edit(mod.id, { ViewChannel: true });
            await channel.send(`🔔 <@${mod.id}>, you've been selected to handle this verification ticket!`);
            ticketData.anyModSelected = false;
            ticketData.selectedModId = mod.id;
            log.info(`Moderator ${mod.user.tag} selected for ticket ${ticketId}`);
        }

        // Update ticket status and send verification instructions
        ticketData.status = 'mod_selected';
        db.set(ticketId, ticketData);

        await sendVerificationInstructions(channel, user, ticketId);
        await interaction.update({ components: [] });

    } catch (error) {
        console.log(error)
        log.error('Error in moderator selection:', error);
        await interaction.reply({
            content: 'Error processing your selection. Please try again.',
            ephemeral: true
        });
    }
}

/**
 * Send verification instructions to the user
 */
async function sendVerificationInstructions(channel, user, ticketId) {
    const verificationEmbed = new EmbedBuilder()
        .setTitle('🐾 Age Verification Instructions')
        .setDescription(`Hey <@${user.id}>! Follow these steps to verify your age:`)
        .addFields(
            {
                name: '🐶 Step 1',
                value: 'Take a clear photo of your ID on a piece of paper with the server name and your username written.'
            },
            {
                name: '📝 Step 2',
                value: 'Censor everything except your date of birth and upload the photo here'
            },
            {
                name: '🦴 Step 3',
                value: 'Wait for a moderator to review your submission'
            }
        )
        .setColor('#00c09a')
        .setFooter({ text: 'Your privacy is important to us. We only need to verify you are 18+. Please censor everything but birthdate on your ID.' });

    const modTools = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`verify_success_${ticketId}`)
            .setLabel('✅ Verify User')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`verify_failure_${ticketId}`)
            .setLabel('❌ Reject')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`ban_user_${ticketId}`)
            .setLabel('🚫 Ban (Underage)')
            .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [verificationEmbed], components: [modTools] });
}

/**
 * Handle verification result interactions
 */
async function handleVerification(interaction, log) {
    const db = new JSONdb('./dbs/tickets.json');
    const [action, result, ticketId] = interaction.customId.split('_');

    const ticketData = db.get(ticketId);
    if (!ticketData) {
        return await interaction.reply({
            content: 'This ticket no longer exists.',
            ephemeral: true
        });
    }

    try {
        const channel = await interaction.guild.channels.fetch(ticketData.channelId);
        const member = await interaction.guild.members.fetch(ticketData.userId);

        // Check if this mod is allowed to handle this ticket
        const canHandle = await checkModPermission(interaction, ticketData, log);
        if (!canHandle) {
            return await interaction.reply({
                content: '🐾 Hey, this isn\'t your ticket to handle! Only the selected moderator can verify this user.',
                ephemeral: true
            });
        }

        // Confirm action
        await interaction.reply({
            content: `Are you sure you want to ${getActionDescription(result)}?`,
            ephemeral: true,
            components: [createConfirmationButtons(result, ticketId)]
        });

    } catch (error) {
        log.error('Error in verification handler:', error);
        await interaction.reply({
            content: 'Error processing verification. Please try again.',
            ephemeral: true
        });
    }
}

/**
 * Handle confirmation button clicks
 */
async function handleConfirmation(interaction, log) {
    const [action, result, ticketId] = interaction.customId.split('_');
    
    if (action !== 'confirm') {
        return;
    }
    
    await processVerification(interaction, result, ticketId, log);
}

/**
 * Handle cancellation button clicks
 */
async function handleCancellation(interaction, log) {
    await interaction.update({
        content: 'Action cancelled.',
        components: []
    });
}

async function checkModPermission(interaction, ticketData, log) {
    // Allow administrators to handle any ticket
    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    
    // Check if any mod is allowed to handle the ticket
    if (ticketData.anyModSelected === true) {
        return interaction.member.roles.cache.has(MOD_ROLE_ID);
    }

    // Check if this is the specifically selected mod
    if (ticketData.selectedModId) {
        return interaction.user.id === ticketData.selectedModId;
    }

    // Fallback: check channel permissions
    const modId = interaction.user.id;
    try {
        const channel = await interaction.guild.channels.fetch(ticketData.channelId);
        const modPermissions = channel.permissionOverwrites.cache.get(modId);

        return modPermissions && modPermissions.allow.has(PermissionFlagsBits.ViewChannel);
    } catch (error) {
        log.error('Error checking mod permissions:', error);
        return interaction.member.roles.cache.has(MOD_ROLE_ID);
    }
}

/**
 * Create confirmation buttons for verification actions
 */
function createConfirmationButtons(result, ticketId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_${result}_${ticketId}`)
            .setLabel('Yes, I\'m sure')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_action`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Get human-readable description of verification actions
 */
function getActionDescription(result) {
    switch (result) {
        case 'success': return 'approve this verification';
        case 'failure': return 'reject this verification (timeout)';
        case 'user': return 'ban this user for being underage';
        default: return 'process this action';
    }
}

/**
 * Process verification confirmation
 */
async function processVerification(interaction, result, ticketId, log) {
    const db = new JSONdb('./dbs/tickets.json');
    const ticketData = db.get(ticketId);

    if (!ticketData) {
        return await interaction.editReply({
            content: 'This ticket no longer exists.',
            components: []
        });
    }

    try {
        const channel = await interaction.guild.channels.fetch(ticketData.channelId);
        const member = await interaction.guild.members.fetch(ticketData.userId);

        switch (result) {
            case 'success':
                await verifyUser(channel, member, log);
                ticketData.status = 'verified';
                break;
            case 'failure':
                await rejectUser(channel, member, log);
                ticketData.status = 'rejected';
                break;
            case 'user':
                await banUser(channel, member, interaction.guild, log);
                ticketData.status = 'banned';
                break;
            default:
                log.error(`Unknown verification result: ${result}`);
                return;
        }

        db.set(ticketId, ticketData);

        await interaction.update({
            content: `Action completed: ${getActionDescription(result)}`,
            components: []
        });

        try {
            const message = await channel.messages.fetch(interaction.message.id);
            await message.edit({ components: [] });
        } catch (err) {
            log.warn('Could not update original message:', err);
        }

    } catch (error) {
        log.error('Error processing verification confirmation:', error);
        await interaction.update({
            content: 'Error completing action. Please try again.',
            components: []
        });
    }
}

/**
 * Verify a user
 */
async function verifyUser(channel, member, log) {
    try {
        // Add verified role
        const verifiedRole = channel.guild.roles.cache.get(VERIFIED_ROLE_ID);
        if (verifiedRole) {
            await member.roles.add(verifiedRole);
        }

        // Send success message
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Verification Successful')
            .setDescription(`<@${member.id}>, your age verification was successful!`)
            .setColor('#00ff00')
            .setFooter({ text: 'This channel will be deleted in 30 seconds' });

        await channel.send({ embeds: [successEmbed] });

        // Log the verification
        log.info(`User verified: ${member.user.tag} (${member.user.id}) at ${new Date().toISOString()}`);

        // Delete channel after delay
        setTimeout(() => channel.delete().catch(() => { }), 30000);
    } catch (error) {
        log.error('Error verifying user:', error);
        await channel.send('Error completing verification. Please contact an administrator.');
    }
}

/**
 * Reject a user (timeout)
 */
async function rejectUser(channel, member, log) {
    try {
        // Timeout user for 7 days
        await member.timeout(7 * 24 * 60 * 60 * 1000, 'Failed age verification')
            .catch(err => log.error('Error timing out user:', err));

        // Send rejection message
        const rejectEmbed = new EmbedBuilder()
            .setTitle('❌ Verification Rejected')
            .setDescription(`<@${member.id}>, your age verification was unsuccessful. You can try again in a week.`)
            .setColor('#ff0000')
            .setFooter({ text: 'This channel will be deleted in 30 seconds' });

        await channel.send({ embeds: [rejectEmbed] });

        // Log the rejection
        log.info(`User rejected: ${member.user.tag} (${member.user.id}) at ${new Date().toISOString()}`);

        // Delete channel after delay
        setTimeout(() => channel.delete().catch(() => { }), 30000);
    } catch (error) {
        log.error('Error rejecting user:', error);
        await channel.send('Error completing rejection. Please contact an administrator.');
    }
}

/**
 * Ban a user for being underage
 */
async function banUser(channel, member, guild, log) {
    try {
        // Send ban message in channel
        const banEmbed = new EmbedBuilder()
            .setTitle('🚫 User Banned')
            .setDescription(`<@${member.id}> has been banned for being underage.`)
            .setColor('#000000')
            .setFooter({ text: 'This channel will be deleted in 30 seconds' });

        await channel.send({ embeds: [banEmbed] });

        // Log the ban in the ban log channel
        try {
            if (BAN_LOG_ID) {
                const banLog = await guild.channels.fetch(BAN_LOG_ID);

                const banLogEmbed = new EmbedBuilder()
                    .setTitle('🚫 Underage User Banned')
                    .setDescription(`User banned for being underage`)
                    .addFields(
                        { name: 'User', value: `${member.user.tag} (<@${member.user.id}>)` },
                        { name: 'User ID', value: member.user.id },
                        { name: 'Time', value: new Date().toISOString() }
                    )
                    .setColor('#ff0000');

                await banLog.send({ embeds: [banLogEmbed] });
            }
        } catch (logError) {
            log.error('Error logging ban:', logError);
        }

        // Ban the user
        await member.ban({ reason: 'Underage user' })
            .catch(err => log.error('Error banning user:', err));

        // Log the ban
        log.info(`User banned (underage): ${member.user.tag} (${member.user.id}) at ${new Date().toISOString()}`);

        // Delete channel after delay
        setTimeout(() => channel.delete().catch(() => { }), 30000);
    } catch (error) {
        log.error('Error banning user:', error);
        await channel.send('Error completing ban. Please contact an administrator.');
    }
}

// Export the handler
module.exports = {
    handleInteraction
};
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ChannelType, 
    PermissionFlagsBits 
  } = require('discord.js');
  const JSONdb = require('simple-json-db');
  const { v4: uuidv4 } = require('uuid');
  
  // Config values - could be moved to a separate config file later
  const TICKET_CHANNEL_ID = process.env.TICKET_CHANNEL_ID || '1276992473910083654';
  const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || '1276960875403673683';
  const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1236285478039326730';
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Create a ticket for age verification.'),
      
    async execute(interaction, client) {
      // Quick validation checks
      if (interaction.channel.isDMBased() || interaction.channel.id !== TICKET_CHANNEL_ID) {
        return interaction.reply({ 
          content: 'Woops! This command only works in the ticket channel.', 
          ephemeral: true 
        });
      }
      
      await interaction.deferReply({ ephemeral: true });
      const { guild, user } = interaction;
      const db = new JSONdb('./dbs/tickets.json');
      
      // Clean up old verified/rejected tickets
      const oldTicket = Object.values(db.JSON()).find(t => 
        t.userId === user.id && ['verified', 'rejected'].includes(t.status)
      );
      
      if (oldTicket) {
        db.delete(oldTicket.id);
      }
      
      // Check if already has open ticket
      if (hasOpenTicket(db, user.id, guild)) {
        return interaction.followUp({ 
          content: 'You already have an open ticket! Check your channels list.', 
          ephemeral: true 
        });
      }
      
      // Check if already verified
      if (isVerified(db, user.id)) {
        return interaction.followUp({ 
          content: 'You\'re already verified, pup! No need to check you for fleas again.', 
          ephemeral: true 
        });
      }
      
      try {
        // Create the ticket channel
        const ticketChannel = await createTicketChannel(guild, user, client.user);
        const ticketId = uuidv4();
        
        // Store ticket in database
        db.set(ticketId, {
          userId: user.id,
          channelId: ticketChannel.id,
          status: 'waiting_for_mod',
          createdAt: Date.now(),
          id: ticketId,
        });
        
        // Send mod selection UI
        await sendModSelectionMessage(ticketChannel, user, ticketId, guild);
        
        await interaction.followUp({ 
          content: `🎫 Ticket created! Check out ${ticketChannel} to continue.`, 
          ephemeral: true 
        });
      } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.followUp({ 
          content: 'Something went wrong creating your ticket. Please try again later!', 
          ephemeral: true 
        });
      }
    }
  };
  
  // Helper functions
  function hasOpenTicket(db, userId, guild) {
    const openTickets = Object.values(db.JSON()).filter(ticket => 
      ticket.userId === userId && 
      ['waiting_for_mod', 'mod_selected'].includes(ticket.status)
    );
    
    // Make sure channel still exists
    if (openTickets.length > 0) {
      const ticketChannel = guild.channels.cache.get(openTickets[0].channelId);
      if (!ticketChannel) {
        db.delete(openTickets[0].id);
        return false;
      }
      return true;
    }
    
    return false;
  }
  
  function isVerified(db, userId) {
    return Object.values(db.JSON()).some(ticket => 
      ticket.userId === userId && ticket.status === 'verified'
    );
  }
  
  async function createTicketChannel(guild, user, botUser) {
    const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
    
    return guild.channels.create({
      name: `ticket-${user.username}`,
      type: ChannelType.GuildText,
      parent: category,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: botUser.id, allow: [PermissionFlagsBits.ViewChannel] },
      ],
    });
  }
  
  async function sendModSelectionMessage(channel, user, ticketId, guild) {
    // Get online and offline moderators
    const [onlineMods, offlineMods] = getModerators(guild, user.id);
    
    // Create the selection UI
    const embed = new EmbedBuilder()
      .setTitle('🐾 Age Verification Ticket')
      .setDescription('Hey there! Please pick a moderator to handle your verification.')
      .setColor('#ff9900')
      .setFooter({ text: 'Your privacy is important to us!' });
    
    const components = [];
    
    // "Any moderator" button
    const anyModButton = new ButtonBuilder()
      .setCustomId(`any_mod_${ticketId}`)
      .setLabel('Any available moderator')
      .setStyle(ButtonStyle.Primary);
    
    // Online moderator buttons
    const row1 = new ActionRowBuilder();
    row1.addComponents(anyModButton);
    
    if (onlineMods.size > 0) {
      // Add up to 4 online mod buttons
      const onlineModButtons = onlineMods.first(4).map(mod =>
        new ButtonBuilder()
          .setCustomId(`select_mod_${mod.id}_${ticketId}`)
          .setLabel(mod.user.username)
          .setStyle(ButtonStyle.Success)
      );
      
      row1.addComponents(onlineModButtons);
      components.push(row1);
    } else {
      components.push(row1);
    }
    
    // Offline moderator selection menu
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
    
    await channel.send({ 
      content: `Hey <@${user.id}>! Welcome to your verification ticket.`,
      embeds: [embed], 
      components 
    });
  }
  
  function getModerators(guild, userId) {
    return guild.members.cache
      .filter(member => 
        member.roles.cache.has(MOD_ROLE_ID) && 
        member.id !== userId
      )
      .partition(member => 
        member.presence?.status === "online" || 
        member.presence?.status === "idle"
      );
  }
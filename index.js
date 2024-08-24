const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { registerSlash, Log } = require('./utils');
const { handleInteraction } = require('./tickethandler');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

client.commands = new Collection();

function loadCommands(dir) {
    const commandFolders = fs.readdirSync(dir);

    for (const folder of commandFolders) {
        const commandFiles = fs.readdirSync(`${dir}/${folder}`).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const command = require(`${dir}/${folder}/${file}`);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                Log.warn(`[WARNING] The command at ${dir}/${folder}/${file} is missing a required "data" or "execute" property.`);
            }
        }
    }
}

client.once('ready', () => {
    Log.setClient(client, true);
    Log.info(`Logged in as ${client.user.tag}!`);
    
    loadCommands(path.join(__dirname, 'commands'));
    registerSlash();
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, client);
        } catch (error) {
            Log.error(error);
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
       try { await handleInteraction(interaction, Log);
       } catch (error) {
              Log.error("Error while trying to fulfill the interaction: " + interaction.customId);
              await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
       }
    }
});

client.login(process.env.discordToken);
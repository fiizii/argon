
require("dotenv").config()
//utils.js
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');



class Log {

    static log(message) {
        const formattedMessage = `\x1b[36m[${new Date().toLocaleString()}]\x1b[0m ${message}`;
        console.log(formattedMessage);
        if (this.client && this.shouldPush) this.sendLongMessage(formattedMessage, process.env.logChannelID);
    }

    static error(message) {
        const formattedMessage = `\x1b[31m[${new Date().toLocaleString()}]\x1b[0m ${message}`;
        console.error(formattedMessage);
        if (this.client && this.shouldPush) this.sendLongMessage(formattedMessage, process.env.logChannelID);
    }

    static warn(message) {
        const formattedMessage = `\x1b[33m[${new Date().toLocaleString()}]\x1b[0m ${message}`;
        console.warn(formattedMessage);
        if (this.client && this.shouldPush) this.sendLongMessage(formattedMessage, process.env.logChannelID);
    }

    static info(message) {
        const formattedMessage = `\x1b[32m[${new Date().toLocaleString()}]\x1b[0m ${message}`;
        console.info(formattedMessage);
        if (this.client && this.shouldPush) this.sendLongMessage(formattedMessage, process.env.logChannelID);
    }

    static debug(message) {
        const formattedMessage = `\x1b[34m[${new Date().toLocaleString()}]\x1b[0m ${message}`;
        console.debug(formattedMessage);
        if (this.client && this.shouldPush) this.sendLongMessage(formattedMessage, process.env.logChannelID);
    }

    static setClient(client, shouldPush = true) {
        this.client = client;
        this.shouldPush = shouldPush; // Push logs to Discord
    }

    static async sendLongMessage(message, channelId) {
        const messageParts = Log.splitMessage(message, 1600);
        for (const part of messageParts) {
            await this.client.channels.cache.get(channelId).send(`\`\`\`ansi\n${part}\`\`\``);
        }
    }

    static splitMessage(message, maxLength) {
        if (message.length <= maxLength) return [message];

        const parts = [];
        let startIndex = 0;
        while (startIndex < message.length) {
            let endIndex = Math.min(startIndex + maxLength, message.length);
            const part = message.slice(startIndex, endIndex);
            parts.push(part);
            startIndex = endIndex;
        }

        return parts;
    }
}
async function registerSlash() {
    const commands = [];
    const cmds = path.join(__dirname, 'commands');
    const cmdfs = fs.readdirSync(cmds);

    for (const folder of cmdfs) {
        const cc = path.join(cmds, folder);
        const cf = fs.readdirSync(cc).filter(file => file.endsWith('.js'));
        for (const fe of cf) {
            const fp = path.join(cc, fe);
            const command = require(fp);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                Log.warn(`[WARNING] The command at ${fp} is missing: "data" or "execute".`);
            }
        }
    }

    const rest = new REST({ version: '10' }).setToken(process.env.discordToken);

    try {
        Log.info(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.clientID),
            { body: commands }
        );

        Log.info(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
}




module.exports = { registerSlash, Log };
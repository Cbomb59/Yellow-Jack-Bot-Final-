// 1️⃣ Imports & config
require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// 2️⃣ Client setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// 3️⃣ Load env variables
const logChannelId = process.env.LOG_CHANNEL_ID;
const staffRoleName = process.env.STAFF_ROLE_NAME;

// 4️⃣ Load loyalty points
const loyaltyFile = path.join(__dirname, "loyalty.json");
let loyalty = {};
if (fs.existsSync(loyaltyFile)) {
  loyalty = JSON.parse(fs.readFileSync(loyaltyFile));
} else {
  fs.writeFileSync(loyaltyFile, JSON.stringify({}, null, 2));
}

// 5️⃣ Load inventory
const inventoryFile = path.join(__dirname, "inventory.json");
let inventory = {};
if (fs.existsSync(inventoryFile)) {
  inventory = JSON.parse(fs.readFileSync(inventoryFile));
} else {
  fs.writeFileSync(inventoryFile, JSON.stringify({}, null, 2));
}

// 6️⃣ Save functions
function saveLoyalty() {
  fs.writeFileSync(loyaltyFile, JSON.stringify(loyalty, null, 2));
}
function saveInventory() {
  fs.writeFileSync(inventoryFile, JSON.stringify(inventory, null, 2));
}

// 7️⃣ Shop items
const shopItems = [
  { name: "La Calle Taco", cost: 25 },
  { name: "Fiesta Nachos", cost: 20 },
  { name: "Chipotle Clucker", cost: 15 },
  { name: "Double Queso Supreme", cost: 16 },
  { name: "Side", cost: 10 },
  { name: "Jarritos", cost: 8 }
];

// 8️⃣ Ready event
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// 9️⃣ Message listener
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(/ +/);
  const command = args[0].toLowerCase();

  // --- !profile
  if (command === "!profile") {
    const user = message.mentions.users.first() || message.author;
    if (!loyalty[user.id]) loyalty[user.id] = { points: 0 };

    const points = loyalty[user.id].points;
    let tier = "Taco Mate";
    if (points >= 10000) tier = "Fiesta Legend";
    else if (points >= 5000) tier = "Salsa Supremo";
    else if (points >= 2500) tier = "Guac Star";
    else if (points >= 500) tier = "Burrito Buddy";

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "Points", value: `${points}`, inline: true },
        { name: "Tier", value: tier, inline: true }
      )
      .setColor(0xffd700)
      .setFooter({ text: "Yellow Jack Bot" });

    return message.channel.send({ embeds: [embed] });
  }

  // --- !points system
  if (command === "!points") {
    const sub = args[1];
    const user = message.mentions.users.first();
    const amount = parseInt(args[3]);

    if (sub === "add") {
      if (!message.member.roles.cache.some(r => r.name === staffRoleName)) return message.reply("⛔ You don’t have permission to add points.");
      if (!user || isNaN(amount)) return message.reply("Usage: !points add @user amount");
      if (!loyalty[user.id]) loyalty[user.id] = { points: 0 };
      loyalty[user.id].points += amount;
      saveLoyalty();

      message.channel.send(`✅ Added **${amount}** points to ${user.username}. They now have **${loyalty[user.id].points}** points.`)
        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));

      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel) logChannel.send(`📜 ${message.author.tag} added **${amount}** points to ${user.tag}.`);
      return;
    }

    if (sub === "remove") {
      if (!message.member.roles.cache.some(r => r.name === staffRoleName)) return message.reply("⛔ You don’t have permission to remove points.");
      if (!user || isNaN(amount)) return message.reply("Usage: !points remove @user amount");
      if (!loyalty[user.id]) loyalty[user.id] = { points: 0 };

      loyalty[user.id].points -= amount;
      if (loyalty[user.id].points < 0) loyalty[user.id].points = 0;
      saveLoyalty();

      message.channel.send(`🛑 Removed **${amount}** points from ${user.username}. They now have **${loyalty[user.id].points}** points.`)
        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));

      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel) logChannel.send(`📜 ${message.author.tag} removed **${amount}** points from ${user.tag}.`);
      return;
    }

    if (sub === "check") {
      const target = user || message.author;
      if (!loyalty[target.id]) loyalty[target.id] = { points: 0 };
      return message.channel.send(`💰 ${target.username} has **${loyalty[target.id].points}** points.`);
    }

    if (sub === "leaderboard") {
      const sorted = Object.entries(loyalty).sort(([, a], [, b]) => b.points - a.points).slice(0, 10);
      if (!sorted.length) return message.channel.send("No points have been added yet.");
      const lines = await Promise.all(sorted.map(async ([id, data], i) => {
        const u = await client.users.fetch(id).catch(() => ({ username: "Unknown" }));
        return `**${i + 1}. ${u.username}** — ${data.points} points`;
      }));
      const embed = new EmbedBuilder()
        .setTitle("🏆 Yellow Jack Points Leaderboard")
        .setDescription(lines.join("\n"))
        .setColor(0xffd700)
        .setFooter({ text: "Yellow Jack Bot" });
      return message.channel.send({ embeds: [embed] });
    }
  }

  // --- !daily command
  if (command === "!daily") {
    const userId = message.author.id;
    if (!loyalty[userId]) loyalty[userId] = { points: 0, lastDaily: 0 };
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (loyalty[userId].lastDaily && now - loyalty[userId].lastDaily < cooldown) {
      const remaining = cooldown - (now - loyalty[userId].lastDaily);
      const hours = Math.floor(remaining / 1000 / 60 / 60);
      const minutes = Math.floor((remaining / 1000 / 60) % 60);
      return message.reply(`⏳ You’ve already claimed your daily points! Try again in ${hours}h ${minutes}m.`);
    }

    const dailyPoints = 10;
    loyalty[userId].points += dailyPoints;
    loyalty[userId].lastDaily = now;
    saveLoyalty();

    const embed = new EmbedBuilder()
      .setTitle("🎉 Daily Bonus Claimed!")
      .setDescription(`You received **${dailyPoints} points**!`)
      .addFields({ name: "Total Points", value: `${loyalty[userId].points}`, inline: true })
      .setColor(0xffd700)
      .setFooter({ text: "Yellow Jack Bot" });

    return message.channel.send({ embeds: [embed] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 10000));
  }

  // --- !redeem command
  if (command === "!redeem") {
    const userId = message.author.id;
    if (!loyalty[userId]) loyalty[userId] = { points: 0, tier: "Taco Mate" };

    if (!args[1]) {
      const embed = new EmbedBuilder()
        .setTitle("🛒 Yellow Jack Shop")
        .setDescription(shopItems.map(i => `**${i.name}** — ${i.cost} points`).join("\n"))
        .setColor(0xffd700)
        .setFooter({ text: "Use !redeem <item name> to buy!" });
      return message.channel.send({ embeds: [embed] });
    }

    const itemName = args.slice(1).join(" ").toLowerCase();
    const item = shopItems.find(i => i.name.toLowerCase() === itemName);
    if (!item) return message.reply("❌ Item not found in the shop.");
    if (loyalty[userId].points < item.cost) return message.reply("❌ You don’t have enough points to redeem this item.");

    loyalty[userId].points -= item.cost;
    saveLoyalty();

    if (!inventory[userId]) inventory[userId] = { items: [] };
    inventory[userId].items.push(item.name);
    saveInventory();

    const embed = new EmbedBuilder()
      .setTitle("✅ Item Redeemed!")
      .setDescription(`You successfully redeemed **${item.name}** for **${item.cost} points**.`)
      .addFields({ name: "Remaining Points", value: `${loyalty[userId].points}`, inline: true })
      .setColor(0xffd700)
      .setFooter({ text: "Yellow Jack Bot" });

    return message.channel.send({ embeds: [embed] });
  }

  // --- !inventory command
  if (command === "!inventory") {
    const userId = message.author.id;

    if (!inventory[userId] || inventory[userId].items.length === 0) {
      return message.author.send("👜 You have no items in your inventory yet!").catch(() => {
        message.channel.send(`${message.author}, I couldn’t DM you, but you have no items in your inventory yet!`);
      });
    }

    const itemsList = inventory[userId].items.join("\n");
    const embed = new EmbedBuilder()
      .setTitle(`${message.author.username}'s Inventory`)
      .setDescription(itemsList)
      .setColor(0xffd700)
      .setFooter({ text: "Yellow Jack Bot" });

    return message.author.send({ embeds: [embed] }).catch(() => {
      message.channel.send(`${message.author}, I couldn’t DM you your inventory.`);
    });
  }
});

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Simple keep-alive route
app.get('/', (req, res) => {
  res.send('Bot is alive!');
});

// Start server
app.listen(PORT, () => {
  console.log(`Keep-alive server running on port ${PORT}`);
});


//  🔟 Login
client.login(process.env.TOKEN);

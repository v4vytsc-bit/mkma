const mineflayer = require('mineflayer')
const pvp = require('mineflayer-pvp').plugin
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalFollow } = goals
const armorManager = require('mineflayer-armor-manager')
const cmd = require('mineflayer-cmd').plugin
const express = require('express')
const fs = require('fs');

// 1. CONFIG LOAD
let config = JSON.parse(fs.readFileSync('config.json'));
const host = config["ip"];
const username = config["name"];
const webPort = process.env.PORT || 3000;

let death = 0, pvpc = 0;
let bot;
let reconnectTimer = 0; 
const startTime = Date.now();

function createBotInstance() {
    if (bot) {
        bot.removeAllListeners();
    }

    bot = mineflayer.createBot({
        host: host,
        port: config["port"],
        username: username,
        version: config["version"] || false,
        viewDistance: "tiny"
    });

    bot.loadPlugin(cmd);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(pathfinder);

    bot.on('spawn', () => {
        reconnectTimer = 0; 
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        defaultMove.canDig = false; 
        defaultMove.allowParkour = true;
        bot.pathfinder.setMovements(defaultMove);
        console.log(`[${new Date().toLocaleTimeString()}] Bot spawned!`);
    });

    bot.on('chat', (sender, message) => {
        if (sender === bot.username) return;
        const target = bot.players[sender]?.entity;
        
        if (message === `follow ${bot.username}`) {
            if (!target) return;
            bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
        }
        
        if (message === `stop`) {
            bot.pvp.stop();
            bot.pathfinder.setGoal(null);
        }
    });

    bot.on('death', () => { death++; });

    bot.on('kicked', (reason) => console.log(`Kicked: ${reason}`));
    bot.on('error', (err) => console.log(`Error: ${err.code || err.message}`));
    
    bot.on('end', (reason) => {
        console.log(`Disconnected (${reason}). Reconnecting in 23s...`);
        reconnectTimer = 23;

        const countdown = setInterval(() => {
            reconnectTimer--;
            if (reconnectTimer <= 0) clearInterval(countdown);
        }, 1000);

        setTimeout(() => {
            createBotInstance();
        }, 23000); 
    });
}

const app = express();

app.get('/health', (req, res) => {
    res.json({
        status: (bot && bot.entity) ? 'connected' : 'reconnecting',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        coords: (bot && bot.entity) ? bot.entity.position : null,
        reconnectIn: reconnectTimer > 0 ? reconnectTimer : 0,
        stats: { fights: pvpc, deaths: death }
    });
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Bot Status</title>
        <style>
            body { font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { background: #1e293b; padding: 30px; border-radius: 15px; box-shadow: 0 0 30px rgba(45, 212, 191, 0.2); width: 350px; text-align: center; border: 1px solid #334155; }
            .stat-card { background: #0f172a; padding: 15px; margin: 10px 0; border-radius: 10px; border-left: 4px solid #2dd4bf; text-align: left; }
            .label { font-size: 10px; color: #94a3b8; text-transform: uppercase; }
            .value { font-size: 16px; font-weight: bold; color: #2dd4bf; margin-top: 5px; }
            .pulse { animation: pulse 2s infinite; height: 10px; width: 10px; border-radius: 50%; display: inline-block; background: #4ade80; }
            @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
        </style>
    </head>
    <body>
        <div class="container">
            <h2><span class="pulse" id="dot"></span> ${username}</h2>
            <div class="stat-card">
                <div class="label">Status</div>
                <div id="stat" class="value">Loading...</div>
            </div>
            <div class="stat-card">
                <div class="label">Uptime</div>
                <div id="upt" class="value">0s</div>
            </div>
            <div class="stat-card">
                <div class="label">Location</div>
                <div id="loc" class="value">Scanning...</div>
            </div>
        </div>
        <script>
            async function update() {
                try {
                    const r = await fetch('/health');
                    const d = await r.json();
                    const statEl = document.getElementById('stat');
                    const dotEl = document.getElementById('dot');
                    
                    if (d.status === 'connected') {
                        statEl.innerText = 'CONNECTED';
                        dotEl.style.background = '#4ade80';
                    } else {
                        statEl.innerText = 'OFFLINE: RETRY IN ' + d.reconnectIn + 's';
                        dotEl.style.background = '#f87171';
                    }
                    
                    document.getElementById('upt').innerText = d.uptime + 's';
                    if(d.coords) {
                        document.getElementById('loc').innerText = Math.floor(d.coords.x) + ', ' + Math.floor(d.coords.y) + ', ' + Math.floor(d.coords.z);
                    } else {
                        document.getElementById('loc').innerText = "---";
                    }
                } catch(e) {}
            }
            setInterval(update, 1000);
            update();
        </script>
    </body>
    </html>
    `);
});

app.listen(webPort, () => {
    console.log("Web server online on port " + webPort);
    createBotInstance();
});

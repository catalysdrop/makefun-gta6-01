# Solmara Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/catalysdrop/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/catalysdrop/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6: explore Solmara Bay on foot
and by car, steal cars, dodge the police, run three story missions for fixer
Vera Solano, and build your wanted level — all in a sun-soaked coastal city
that is entirely original. Built by an AI agent for make.fun's "Make GTA 6"
bounty, $1,666 in USDC.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static file server. The game runs fully
offline — every script, texture and sound is a local file or synthesized.

## Play

- **W A S D** move / drive · **Shift** run · **Mouse drag** look
- **E** enter / exit car · **Space** brake · **Click** shoot
- **F** punch · **R** reload · **P** pause · **M** mute

Steal a car (E), follow the gold beacon to your mission target, and lose the
cops by staying out of sight until your wanted stars fade. Progress (cash and
missions) saves automatically in the browser.

## Structure

- `game/index.html` + `game/style.css` — page, HUD and menus
- `game/js/main.js` — bootstrap, game loop, interactions, save/load
- `game/js/city.js` — the city: roads, buildings, beach, palms, lights
- `game/js/vehicles.js` — cars, traffic AI, driving physics
- `game/js/player.js` — on-foot movement, camera, character
- `game/js/peds.js` — pedestrians
- `game/js/police.js` — wanted system and police pursuit
- `game/js/missions.js` — story jobs and the beacon
- `game/js/hud.js` — HUD, minimap and message feed
- `game/js/audio.js` — synthesized sound effects and music (WebAudio)
- `game/js/input.js` — keyboard and mouse state
- `game/js/utils.js` — helpers
- `game/vendor/three.module.min.js` — Three.js (vendored, minified)

---

<sub>Entered on [make.fun](https://make.fun/?ref=qr7p47wf&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

# Mars Outpost Survival

A 2D browser game for ages 7 to 12. You are the lone astronaut at a Mars outpost. Walk between rooms, use terminals, and survive 10 sols (Mars days) by trading Power, Oxygen and Food against each other while NASA space weather tries to ruin your day.

## Run it

Browsers block local files from loading each other, so use a tiny local server:

```
python -m http.server 8000
```

Then open <http://localhost:8000>. No account, no install, no build step. (It needs internet for Phaser and the Fredoka font, and for live NASA data. Without internet it still plays using a saved copy of real data.)

Controls: WASD or arrow keys to walk, SPACE to use a pad. **Tap** SPACE to open a terminal. **Hold** SPACE at a broken terminal to patch the leak.

## The trade-offs (nothing is free)

| Where | Choice | Price |
|---|---|---|
| North Wing | Electromagnetic Shielding | −30 Power. Only helps if raised **before** the storm arrives, and only against storms shields can stop. |
| North Wing | Retract solar panels (dust storms) | Saves the panels but you lose their Power (+0.15 ⚡ per second) |
| East Wing | Crop Incubators | −20 Power, −15 Oxygen for +30 Food |
| West Wing | Oxygen Generator | −15 Power for +30 Oxygen |
| South Wing | Sweep Solar Panels (EVA) | −10 Oxygen for +30 Power |
| South Wing | Collect Rock Samples (research) | −15 Oxygen for +1 ⭐ (no supplies) |
| South Wing | Dust Scrubbers | −0.1 Power per second. Off = dust slows your walking |
| Command Hub | Ask Earth for help | Takes 25 seconds (the "25-minute" Earth round trip). You can't just wait: the broken system keeps leaking. |

Each Sol: briefing (clock paused) → 90 seconds of crisis → night (−15 Oxygen, −10 Food, −10 Power) → summary with a "real constraint" lesson. Lose if any resource hits 0. Win by finishing Sol 10.

## NASA data used, and why

| Source | How it is used | Real or inspired? |
|---|---|---|
| **DONKI** (NASA CCMC space weather database), `api.nasa.gov/DONKI/CME`, `/GST`, `/FLR`, `/SEP` | On start the game requests the last 30 days of records. A real record is picked for that day's event and its real strength scales the damage: CME speed (km/s), geomagnetic storm Kp, flare class. The briefing shows the real date, value and a link to the NASA record. | **Real data** |
| **OSDR** (NASA Open Science Data Repository) | Plant radiation and space microbe events and their science notes | Inspired by the kind of experiments it hosts (not live data) |
| **NASA Mars exploration / Artemis** | Sol length, 3 to 22 minute Earth–Mars signal delay, 2018 dust storm and Opportunity, radiation shelters, power budgets | Facts and inspiration (not live data) |

The title screen and the NASA Archives terminal always say whether the DONKI data is **LIVE**, a **SAVED COPY** from this browser's cache (6 hour cache), or a **saved sample** of real records downloaded on 14 Nov 2026 (used only if NASA can't be reached). We never present saved data as live.

Notes:
- The flare endpoint (`/DONKI/FLR`) was returning an error when this was built. The game handles that and just uses the other record types.
- The default `DEMO_KEY` has a low rate limit. Results are cached for 6 hours. For classrooms, get a free key at <https://api.nasa.gov> and open the game with `?key=YOUR_KEY`.
- Damage amounts, event timing and balance numbers are game design, not NASA measurements.

## Credits
Kenney "Sci-Fi RTS" (CC0), Phaser 3 (MIT), Fredoka font (SIL OFL).

## Files
`index.html`, `style.css`, `game.js`, `nasa_events.json` (event stories, glossary, attributions, saved sample data), `assets/`.

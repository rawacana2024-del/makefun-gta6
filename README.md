[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rawacana2024-del/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rawacana2024-del/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR HEAT (3D)

An original 3D open-world crime game in the spirit of GTA 6, built for
[make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01). It runs as
plain static files in a desktop browser — no build step, no network request
at runtime. Keyboard and mouse only. The city, cars, player and police are
rendered in 3D with three.js, vendored locally under `game/vendor/` (the
minified build, no CDN, no network at runtime).

## Story

Rex Marlowe is back in the invented coastal city of Solmar with a dead car
and a $5,000 debt to Lena Cruz. He must work his way out: nine story
missions, stealing cars, dodging the Solmar PD under a five-star wanted
level — helicopters, roadblocks and all — and buying his way out. Every
street, person, car, name and story beat is original — nothing from any
commercial game.

## The 3D city

A seeded, deterministic 3D city: a ground plane with a street grid,
buildings as boxes of varying heights (with lit windows), parks with trees,
parking lots, and a beach with a water plane along the south edge. Traffic
cars and pedestrians live in it. Two safehouses (home bases, each a save
point), a Spray Shop (a garage that clears wanted stars), a gun shop and a
garage are fixed landmarks. The same seed always builds the same city; a URL
query picks the seed (`?seed=7`). The camera is a third-person chase camera
behind the player on foot and behind the car while driving. The sun is low
and warm (golden-hour light) with soft haze.

## Controls

- **WASD or arrow keys** — move on foot, drive a car
- **E** — steal a car / get out of a car / use a shop when near one
- **F** — punch
- **G or mouse click** — shoot (aims at the mouse position)
- **Q or number keys 1–4** — switch weapon (fists, pistol, shotgun, SMG)
- **Shift** — run
- **Space** — handbrake while driving
- **R** — change radio station while driving
- **M** — mute / unmute sound
- **V** — save the game
- **Esc or P** — pause

## Cars

Traffic cars, taxis, trucks, sports cars and parked cars, all as 3D models
built from boxes, cylinders and simple shapes (body, cabin, wheels,
headlights). Walk up to any car and press E to steal it — getting in a car
you do not own earns a wanted star. Driving uses WASD or the arrow keys,
with a handbrake on Space and a speedometer on the HUD. Parked cars sit in
parking lots and along streets. Your own car can be upgraded at the garage
(engine speed, armor, handling) with earned money.

## Wanted level and police

0 to 5 stars. Stealing a car, hitting a pedestrian and shooting raise the
heat. Solmar PD patrol cars chase and ram you; foot cops chase on foot and
bust you if they catch you. At 3 stars and above the police set roadblocks
(parked police cars blocking streets) and a helicopter joins the chase (it
follows you from above and shines a spotlight). The wanted level falls when
you hide (break line of sight for a while) or visit the Spray Shop, which
clears all stars. At 0 stars the police ignore you.

## Missions (nine, in order)

1. **First Wheels** — steal a car and bring it to the marker. ($400)
2. **The Package** — pick up a package and deliver it before the timer runs out. ($500)
3. **Heat Check** — reach 3 stars, then lose the cops. ($600)
4. **Three Debts** — collect money from three debtors around the city. ($700)
5. **Street Race** — win a checkpoint race around the city against three rival drivers. ($800)
6. **The Big Score** — steal the gold Comet and drop it off while the police chase. ($900)
7. **Air Support** — survive a helicopter and roadblock chase and reach the safehouse. ($600)
8. **Garage Upgrade** — buy a garage upgrade for your car, then complete a getaway drive using the upgraded car. ($400)
9. **The Final Debt** — steal the black Phoenix, escape the city under a full five-star chase, pay off the debt, and the story ends. ($1,100)

The nine rewards add up to $6,000 — the $5,000 debt, with a little left over
for the garage and the gun shop. Each mission has a marker on the map and in
the world (a glowing 3D beacon), objective text and a distance readout on
the HUD. Completing missions earns respect; higher respect ranks unlock
better cars and weapons. After the ninth mission a story-complete screen
appears and you can keep playing in free roam.

## Combat

Fists (F, short range), pistol, shotgun and SMG (switch with Q or number
keys, each with its own ammo). Health and ammo pickups are scattered around
town, and a gun shop sells weapons and ammo. At zero health the "wasted"
screen appears; being caught by foot cops shows the "busted" screen. Both
offer a retry — you respawn at the safehouse, keep your money, and lose a
little.

## Progression and extras

- **Respect ranks:** Nobody → Hustler (50) → Operator (150) → King of Solmar (300). Higher ranks unlock shotguns, SMGs and better cars.
- **Garage upgrades:** spend money at the garage to upgrade your car (engine speed, armor, handling).
- **Radio:** while driving, R switches between four in-car radio stations (synthesized music loops via WebAudio, no audio files).
- **Shops:** a gun shop (buy weapons and ammo) and the Spray Shop (clear wanted stars).
- **Safehouses:** two safehouses where you can save.

## HUD

Health bar, money, the remaining debt, wanted stars, respect rank, the
in-game clock, a speedometer while driving, the current mission objective
with distance to the marker, the radio station while driving, the weapon
wheel with the current weapon and ammo, and a live minimap (a 2D top-down
overlay) showing roads, you, traffic cars, police, the helicopter,
safehouses and the mission marker. A start screen (title, story intro,
controls), a pause menu (resume, restart, mute, save), save and load via
localStorage (V to save, loaded automatically on start), busted and wasted
screens, and a story-complete ending screen.

## Sound

All sound is synthesized with WebAudio — no audio files. Engine hum (pitch
follows speed), police sirens, helicopter rotors, gunshots, crashes, short
mission stingers for success and failure, plus the radio music loops. M
mutes everything.

## How to play

Serve the `game/` folder with any static file server and open it in a
desktop browser:

```
node serve.ts
```

Then open http://localhost:8080. Or serve `game/` with any other static
server — the game needs nothing but its own files.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game running
in a headless browser, staged with the scene query (`?scene=chase`,
`?scene=driving`, `?scene=mission`, `?scene=title`, each with `&seed=7`).
The police chase (with helicopter and roadblock) is the cover shot.

## License

MIT. See LICENSE. three.js (vendored under `game/vendor/`) is MIT-licensed
by the Three.js Authors.

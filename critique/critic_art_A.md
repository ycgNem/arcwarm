# Arcwarm art critique A: Pinehollow autumn pass

## 1. Verdict

**After is better.** The biggest gain is for aiming, not looks. Before, the lime bot often sat in front of lime/yellow-green birch and maple crowns of the same hue (ridge, treehouse, cannon). Now the pines are a deep blue-green (HSL 0.36-0.41, L 0.20-0.27) and the maples are crimson/orange, so the bot is set against either a darker cool backdrop or its complementary colour. The pass also adds new red and gold noise near ground level and in the air, and that's what to fix next.

| | Before | After |
|---|---|---|
| (a) Bot readability | 6 | 7.5 |
| (b) Low-poly cohesion | 6 | 7.5 |
| (c) Mood / appeal | 5 | 8 |
| (d) Noise/clutter (10 = clean) | 8 | 6 |

## 2. Per-view notes

- **menu**: Warmer and richer. A pure-red speck (a mushroom) at lower left still reads as a red dot through the blur.
- **hollow**: Orange and red crowns behind the dark pines frame the bot lane well. Grass went olive and muddy. The orange litter drift at lower left is the most saturated thing on screen apart from the HUD.
- **treehouse**: The best improvement. Before, the bot sat on a green crown with poor separation. Now it sits on a red-brown maple, the complementary colour, and pops. Orange falling-leaf specks on the right-hand trunks look like embers or sparks.
- **shrine**: The bot reads fine against the stone and maple. Gold falling leaves (about a dozen 4.5u quads) scatter across the frame, several next to the incoming green beam and the crosshair. That's moving clutter right where the eye tracks. The birch crown overhead renders dull khaki-olive, not gold.
- **ridge**: Clear win. The pale lime birch wall behind the bot is replaced by darker trunks and warm crowns. Two red mushroom clusters (left trunk, birch base) read as blood droplets at a glance. A god-ray shaft runs right behind the bot.
- **close**: Neutral to good. The bot is against dark pines. Litter at the lower left is busy but outside the aim zone. Sunlit grass is now yellow-olive, nearer the bot's lime than the old green was.
- **edge**: Regressed for peripheral read. The big red-orange litter decal in the foreground (around 80u wide, crimson tones) plus two red mushrooms at the tree base look like a blood splatter in peripheral vision. Bot readability is unchanged (dark trunks).
- **cannon**: Good. Maple and orange crowns plus deep pines behind the bot. Foreground sunlit grass is yellow-olive "baby food" and looks flat.

## 3. Fixes (ranked, readability first)

1. **Remove red mushroom caps.** `capCols = [0xd23a2a, 0xc2602e, 0xb08a5a]`: drop `0xd23a2a` and use `[0xa8784a, 0x8c6a48, 0xd8ccb0]` (tan, brown, cream). Pure red at ground level reads as blood, and it's the only saturated red that's small and point-like.
2. **Calm the falling leaves.** `NL` 200 → 90. Change the glint from `0.55 + 0.6*|n·sun|` to `0.5 + 0.3*…` so they stop flashing. Swap birch gold `0xe0b23a, 0xd09a2a` for `0xb88a3a, 0xa07a34`. The bright moving specks are the same size as LG hit sparks and sit right in the tracking zone (shrine, treehouse).
3. **Push birch crowns away from lime.** Hue `0.115 + v*0.03` → `0.085 + v*0.025`, L `0.56` → `0.52`. They currently shade to khaki-olive (around 55°), the scene colour closest to the bot's lime. Amber also reads as "gold" better.
4. **Desaturate and deredden the maple litter decals.** Change `leafCols.maple` to `[0xa8743e, 0x946238, 0xb4844a]` and clamp size `w = 40 + rng()*40` → `30 + rng()*30`. Close up they look like a red splat (edge, hollow). Browner and smaller still reads as autumn.
5. **Take the yellow out of the grass.** `grassA 0x748a3a` → `0x66763e`, `grassB 0x4c6428` → `0x46562e`. Sunlit ground is drifting toward the bot's lime and goes muddy olive. Less saturated, slightly cooler ground separates the bot's feet and legs (the darkest, greenest part of the bot) better.
6. **Keep god rays off the lanes.** Either cut the shafts from 14 → 8 or skip any shaft whose axis passes within about 150u of a lane centreline. An additive pale band behind the bot (ridge) lowers contrast exactly where you aim. Fewer full-height additive planes also means less overdraw.

Cost note: everything new is instanced or merged (leaves, pebbles, mushrooms, clouds = one draw each; falling leaves and motes are GPU-driven), so the pass looks cheap. The only fill-rate risk is the 14 × 1100u additive shafts. The dark pebbles (L 0.07-0.14) are fine: small, low contrast, not a problem.

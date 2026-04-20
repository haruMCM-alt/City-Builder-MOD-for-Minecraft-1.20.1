# City-Builder-MOD-for-Minecraft-1.20.1
With this mod, you can generate beautiful buildings simply by typing commands. Cities can also be built.
A Forge MOD that automatically constructs skyscrapers, bases, and Japanese-style roads by specifying coordinates using commands.

> If other versions are needed, adjust the `mappings` and `forge` dependencies in `build.gradle`, and the `versionRange` in `mods.toml`.

## Build

```
./gradlew build
```
The output is `build/libs/citybuilder-1.0.0.jar`. Place it in the `mods/` directory of your Forge 1.21.1 server/client.

## Commands

All commands require OP privileges (level 2).

### `/skyscraper <pos> <width> <depth> <floors> <floorHeight>`
Constructs a skyscraper. Specify the southwest corner as `pos`.

Example: `/skyscraper 100 64 200 16 16 30 5`
→ A skyscraper with a width of 16x16 blocks, 30 floors, and a height of 5 blocks per floor, starting from (100, 64, 200).

### `/base <type> <pos> <size>`
Build a base. `type` is one of the following.

- `house` — Residential building (gable roof/door/windows)
- `farm` — Wheat field with fence + irrigation channel
- `warehouse` — Iron block warehouse (shutter opening, shelves)
- `tower` — Stone watchtower (parapet, ladder)
- `shrine` — Japanese-style shrine and torii gate

Example: `/base shrine 50 65 50 11`

### `/road <pos> <length> <axis>`
Construct a Japanese-style two-lane road. `axis` is `x` or `z`.

**A 15-block wide** layout (symmetrical from the center):
- Median strip (grass + shrubs every 3 blocks)
- 2 lanes + dashed white line + 2 lanes
- Yellow shoulder line
- Curb
- Sidewalk + street trees (every 6 blocks) + streetlights (every 10 blocks)

Example: `/road -64 64 -64 200 x`
→ A road 200 blocks long in the X direction starting from (-64,64,-64).

## Directory Structure
```
citybuilder-mod/
├─ build.gradle
├─ settings.gradle
├─ gradle.properties
├─ src/main/
│ ├─ java/com/example/citybuilder/
│ │ ├─ CityBuilderMod.java # Entry & Command Registration
│ │ ├─ commands/
│ │ │ ├─ SkyscraperCommand.java
│ │ │ ├─ BaseCommand.java
│ │ │ └─ RoadCommand.java
│ │ └─ builders/
│ │ ├─ BuildUtil.java # Common Processing such as fill / hollowBox
│ │ ├─ SkyscraperBuilderBuilder.java
│ │ ├─ BaseBuilder.java
│ │ └─ RoadBuilder.java
│ └─ resources/
│ ├─ META-INF/mods.toml
│ └─ pack.mcmeta
```
## Expansion Points

- You can increase the number of building types by adding an enum to `BaseBuilder.Type` and adding branches to `switch`.
- The street trees in `RoadBuilder` can be replaced with cherry blossoms (`Blocks.CHERRY_LEAVES`/`CHERRY_LOG`) by changing `placeTree`.
- Intersection generation is easiest to expand by adding `/road cross <pos> <size>` to `RoadCommand`.

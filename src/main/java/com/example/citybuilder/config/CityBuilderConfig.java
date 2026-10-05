package com.example.citybuilder.config;

import net.minecraftforge.common.ForgeConfigSpec;

/** Server-side settings, stored per world in {@code serverconfig/citybuilder-server.toml}. */
public final class CityBuilderConfig {
    public static final ForgeConfigSpec SPEC;

    private static final ForgeConfigSpec.IntValue MS_PER_TICK;
    private static final ForgeConfigSpec.IntValue MAX_UNDO;
    private static final ForgeConfigSpec.IntValue MAX_BLOCKS;
    private static final ForgeConfigSpec.BooleanValue PROGRESS_BAR;
    private static final ForgeConfigSpec.IntValue FOUNDATION_DEPTH;
    private static final ForgeConfigSpec.IntValue LASER_RANGE;

    static {
        ForgeConfigSpec.Builder b = new ForgeConfigSpec.Builder();
        b.push("building");
        MS_PER_TICK = b.comment("Milliseconds per server tick spent placing blocks. Higher builds faster but can cause lag (a tick is 50 ms).")
                .defineInRange("msPerTick", 20, 1, 45);
        MAX_BLOCKS = b.comment("Largest number of blocks a single command may plan. Protects the server from runaway sizes.")
                .defineInRange("maxBlocksPerJob", 30_000_000, 10_000, 200_000_000);
        MAX_UNDO = b.comment("How many builds per player can be undone with /cb undo.")
                .defineInRange("maxUndo", 5, 0, 50);
        FOUNDATION_DEPTH = b.comment("How far down foundations are extended when building over uneven ground (0 disables).")
                .defineInRange("foundationDepth", 24, 0, 128);
        PROGRESS_BAR = b.comment("Show a boss bar with build progress to the player who started the build.")
                .define("showProgressBar", true);
        b.pop();
        b.push("items");
        LASER_RANGE = b.comment("Maximum distance of the Teleporter Laser in blocks.")
                .defineInRange("laserRange", 128, 8, 512);
        b.pop();
        SPEC = b.build();
    }

    private CityBuilderConfig() {
    }

    private static <T> T get(ForgeConfigSpec.ConfigValue<T> v, T fallback) {
        // Values are only readable once the server config has loaded; fall back to defaults before that.
        return SPEC.isLoaded() ? v.get() : fallback;
    }

    public static int msPerTick() {
        return get(MS_PER_TICK, 20);
    }

    public static int maxUndo() {
        return get(MAX_UNDO, 5);
    }

    public static int maxBlocks() {
        return get(MAX_BLOCKS, 30_000_000);
    }

    public static boolean showProgressBar() {
        return get(PROGRESS_BAR, true);
    }

    public static int foundationDepth() {
        return get(FOUNDATION_DEPTH, 24);
    }

    public static int laserRange() {
        return get(LASER_RANGE, 128);
    }
}

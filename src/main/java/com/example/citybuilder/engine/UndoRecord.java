package com.example.citybuilder.engine;

import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.SectionPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;

/** Everything needed to put the world back the way it was before a build. */
public final class UndoRecord {
    final ResourceKey<Level> dimension;
    final Component label;
    final Long2ObjectOpenHashMap<BlockCanvas.Section> sections = new Long2ObjectOpenHashMap<>();
    /** Block entity data keyed by {@link net.minecraft.core.BlockPos#asLong()}. */
    final Long2ObjectOpenHashMap<CompoundTag> blockEntities = new Long2ObjectOpenHashMap<>();
    final List<UUID> spawnedEntities = new ArrayList<>();
    long blocks;

    UndoRecord(ResourceKey<Level> dimension, Component label) {
        this.dimension = dimension;
        this.label = label;
    }

    public Component label() {
        return label;
    }

    public long blocks() {
        return blocks;
    }

    void remember(int x, int y, int z, BlockState old) {
        long key = SectionPos.asLong(x >> 4, y >> 4, z >> 4);
        BlockCanvas.Section s = sections.get(key);
        if (s == null) {
            s = new BlockCanvas.Section();
            sections.put(key, s);
        }
        if (s.set(BlockCanvas.index(x, y, z), old)) {
            blocks++;
        }
    }

    Long2ObjectMap<BlockCanvas.Section> sections() {
        return sections;
    }
}

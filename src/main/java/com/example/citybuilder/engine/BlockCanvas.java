package com.example.citybuilder.engine;

import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import it.unimi.dsi.fastutil.objects.Reference2IntOpenHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.SectionPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.RedstoneLampBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

/**
 * An off-world buffer that builders draw into. Nothing touches the world until a
 * {@link BuildJob} places the buffer a slice at a time, so a whole city can be planned
 * without freezing the server, previewed as a block count, and undone afterwards.
 *
 * <p>Reads fall through to the real world for positions the canvas has not set, so
 * builders that inspect their surroundings (roof ornaments, foundations) still work.
 */
public final class BlockCanvas {
    private final ServerLevel level;
    private final Long2ObjectOpenHashMap<Section> sections = new Long2ObjectOpenHashMap<>();
    private final List<Function<ServerLevel, Entity>> entities = new ArrayList<>();
    private final List<SignText> signs = new ArrayList<>();
    private long count;

    public BlockCanvas(ServerLevel level) {
        this.level = level;
    }

    public ServerLevel level() {
        return level;
    }

    /** Number of positions written so far (including air). */
    public long size() {
        return count;
    }

    public boolean setBlock(BlockPos pos, BlockState state, int ignoredFlags) {
        set(pos.getX(), pos.getY(), pos.getZ(), state);
        return true;
    }

    public BlockState getBlockState(BlockPos pos) {
        return get(pos.getX(), pos.getY(), pos.getZ());
    }

    /** Queues an entity to be spawned once all blocks are in place. */
    public void addFreshEntity(Entity entity) {
        entities.add(l -> entity);
    }

    public void spawnLater(Function<ServerLevel, Entity> factory) {
        entities.add(factory);
    }

    /** Writes text on the front of a sign once it has been placed. */
    public void signText(int x, int y, int z, Component... lines) {
        signs.add(new SignText(new BlockPos(x, y, z), lines));
    }

    public void set(int x, int y, int z, BlockState state) {
        if (level.isOutsideBuildHeight(y)) {
            return;
        }
        state = normalize(state);
        put(x, y, z, state);

        // Two-block structures are completed here so that no builder can leave half a door or bed behind.
        if (state.getBlock() instanceof DoorBlock && state.getValue(DoorBlock.HALF) == DoubleBlockHalf.LOWER) {
            if (!level.isOutsideBuildHeight(y + 1)) {
                put(x, y + 1, z, state.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER));
            }
        } else if (state.getBlock() instanceof BedBlock && state.getValue(BedBlock.PART) == BedPart.FOOT) {
            Direction f = state.getValue(BedBlock.FACING);
            put(x + f.getStepX(), y, z + f.getStepZ(), state.setValue(BedBlock.PART, BedPart.HEAD));
        }
    }

    public BlockState get(int x, int y, int z) {
        Section s = sections.get(SectionPos.asLong(x >> 4, y >> 4, z >> 4));
        if (s != null) {
            BlockState st = s.get(index(x, y, z));
            if (st != null) {
                return st;
            }
        }
        return level.getBlockState(new BlockPos(x, y, z));
    }

    /** True if this canvas has written the position (as opposed to it coming from the world). */
    public boolean isSet(int x, int y, int z) {
        Section s = sections.get(SectionPos.asLong(x >> 4, y >> 4, z >> 4));
        return s != null && s.get(index(x, y, z)) != null;
    }

    private void put(int x, int y, int z, BlockState state) {
        long key = SectionPos.asLong(x >> 4, y >> 4, z >> 4);
        Section s = sections.get(key);
        if (s == null) {
            s = new Section();
            sections.put(key, s);
        }
        if (s.set(index(x, y, z), state)) {
            count++;
        }
    }

    private static BlockState normalize(BlockState state) {
        // Leaves placed by hand would otherwise decay within minutes.
        if (state.getBlock() instanceof LeavesBlock && state.hasProperty(LeavesBlock.PERSISTENT)) {
            return state.setValue(LeavesBlock.PERSISTENT, true);
        }
        // Decorative lamps have no redstone feeding them; show them lit.
        if (state.is(Blocks.REDSTONE_LAMP)) {
            return state.setValue(RedstoneLampBlock.LIT, true);
        }
        return state;
    }

    static int index(int x, int y, int z) {
        return (y & 15) << 8 | (z & 15) << 4 | (x & 15);
    }

    /** Section keys ordered column by column, bottom to top, so chunks are visited once. */
    LongArrayList orderedSections() {
        LongArrayList keys = new LongArrayList(sections.keySet());
        keys.sort((a, b) -> {
            int c = Integer.compare(SectionPos.x(a), SectionPos.x(b));
            if (c != 0) return c;
            c = Integer.compare(SectionPos.z(a), SectionPos.z(b));
            if (c != 0) return c;
            return Integer.compare(SectionPos.y(a), SectionPos.y(b));
        });
        return keys;
    }

    Long2ObjectMap<Section> sections() {
        return sections;
    }

    List<Function<ServerLevel, Entity>> entities() {
        return entities;
    }

    List<SignText> signs() {
        return signs;
    }

    record SignText(BlockPos pos, Component[] lines) {
    }

    /** 16x16x16 palette-compressed storage; index 0 means "not set". */
    static final class Section {
        private final short[] data = new short[4096];
        private final List<BlockState> palette = new ArrayList<>();
        private final Reference2IntOpenHashMap<BlockState> ids = new Reference2IntOpenHashMap<>();

        /** @return true if the slot was previously empty */
        boolean set(int idx, BlockState state) {
            int id = ids.getOrDefault(state, 0);
            if (id == 0) {
                palette.add(state);
                id = palette.size();
                ids.put(state, id);
            }
            boolean fresh = data[idx] == 0;
            data[idx] = (short) id;
            return fresh;
        }

        BlockState get(int idx) {
            int id = data[idx];
            return id == 0 ? null : palette.get(id - 1);
        }
    }
}

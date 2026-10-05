package com.example.citybuilder.engine;

import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.UUID;
import java.util.function.Consumer;
import javax.annotation.Nullable;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.TicketType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.level.block.entity.SignText;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;

/**
 * One queued unit of work. A job first runs its planning steps into a {@link BlockCanvas}
 * (a few per tick), then places the canvas a section at a time within the tick budget,
 * then re-evaluates block shapes so fences, panes and stairs connect, and finally spawns
 * entities. A job can also replay an {@link UndoRecord}.
 */
public final class BuildJob {
    private static final TicketType<ChunkPos> TICKET =
            TicketType.create("citybuilder", Comparator.comparingLong(ChunkPos::toLong), 1200);

    /** Send to clients, skip neighbour shape updates (done in our own pass), never drop items. */
    private static final int FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS;

    enum Phase { LOAD, PLAN, PLACE, SHAPE, FINISH, DONE }

    final long id;
    final Component label;
    @Nullable final UUID owner;
    final ServerLevel level;

    private final Deque<Consumer<BlockCanvas>> steps;
    private final int totalSteps;
    private final BlockCanvas canvas;
    @Nullable private final UndoRecord restoreFrom;
    @Nullable final UndoRecord undo;

    Phase phase;
    /** Chunks to load (asynchronously, via tickets) before planning reads the world. */
    private final LongArrayList preload = new LongArrayList();
    private int preloadIdx;
    private int preloadTotal;
    private Long2ObjectMap<BlockCanvas.Section> source;
    private LongArrayList order;
    private int sectionIdx;
    private int slot;
    private long lastTicketChunk = Long.MIN_VALUE;
    long visited;
    long changed;
    long total;
    long startedAt;

    private BuildJob(long id, Component label, @Nullable UUID owner, ServerLevel level,
                     Deque<Consumer<BlockCanvas>> steps, @Nullable UndoRecord restoreFrom) {
        this.id = id;
        this.label = label;
        this.owner = owner;
        this.level = level;
        this.steps = steps;
        this.totalSteps = Math.max(1, steps.size());
        this.canvas = new BlockCanvas(level);
        this.restoreFrom = restoreFrom;
        this.undo = restoreFrom == null ? new UndoRecord(level.dimension(), label) : null;
        this.phase = restoreFrom == null ? Phase.PLAN : Phase.PLACE;
        if (restoreFrom != null) {
            beginPlacement(restoreFrom.sections());
        }
    }

    static BuildJob build(long id, Component label, @Nullable UUID owner, ServerLevel level, Deque<Consumer<BlockCanvas>> steps,
                          @Nullable int[] bounds) {
        BuildJob job = new BuildJob(id, label, owner, level, new ArrayDeque<>(steps), null);
        if (bounds != null) {
            for (int cx = bounds[0] >> 4; cx <= bounds[2] >> 4; cx++) {
                for (int cz = bounds[1] >> 4; cz <= bounds[3] >> 4; cz++) {
                    job.preload.add(ChunkPos.asLong(cx, cz));
                }
            }
            job.preloadTotal = job.preload.size();
            job.phase = Phase.LOAD;
        }
        return job;
    }

    static BuildJob restore(long id, @Nullable UUID owner, ServerLevel level, UndoRecord record) {
        Component label = Component.translatable("citybuilder.job.undo_label", record.label());
        return new BuildJob(id, label, owner, level, new ArrayDeque<>(), record);
    }

    boolean isRestore() {
        return restoreFrom != null;
    }

    float progress() {
        return switch (phase) {
            case LOAD -> 0.05f * preloadIdx / Math.max(1, preloadTotal);
            case PLAN -> 0.1f * (totalSteps - steps.size()) / totalSteps;
            case PLACE -> 0.1f + 0.75f * fraction();
            case SHAPE -> 0.85f + 0.15f * fraction();
            case FINISH, DONE -> 1f;
        };
    }

    private float fraction() {
        return total == 0 ? 1f : Math.min(1f, (float) visited / total);
    }

    /** Works until the deadline; returns true once the job is complete. */
    boolean tick(long deadline) {
        if (startedAt == 0) {
            startedAt = System.currentTimeMillis();
        }
        int ops = 0;
        while (phase != Phase.DONE) {
            if ((++ops & 63) == 0 && System.nanoTime() > deadline) {
                return false;
            }
            switch (phase) {
                case LOAD -> {
                    if (!preloadMore()) {
                        return false;
                    }
                    phase = Phase.PLAN;
                }
                case PLAN -> {
                    Consumer<BlockCanvas> step = steps.poll();
                    if (step == null) {
                        beginPlacement(canvas.sections());
                        phase = Phase.PLACE;
                    } else {
                        step.accept(canvas);
                        if (canvas.size() > com.example.citybuilder.config.CityBuilderConfig.maxBlocks()) {
                            throw new TooLargeException(canvas.size());
                        }
                        // Planning steps can be heavy; always re-check the clock after one.
                        if (System.nanoTime() > deadline) {
                            return false;
                        }
                    }
                }
                case PLACE -> {
                    if (!advance(deadline, true)) {
                        return false;
                    }
                    rewind();
                    phase = Phase.SHAPE;
                }
                case SHAPE -> {
                    if (!advance(deadline, false)) {
                        return false;
                    }
                    phase = Phase.FINISH;
                }
                case FINISH -> {
                    finish();
                    phase = Phase.DONE;
                }
                default -> {
                }
            }
        }
        return true;
    }

    /**
     * Requests chunks a batch at a time and waits (without blocking the tick) until the server has
     * generated them, so planning never has to generate terrain synchronously.
     */
    private boolean preloadMore() {
        int window = 48;
        while (preloadIdx < preload.size()) {
            int end = Math.min(preload.size(), preloadIdx + window);
            for (int i = preloadIdx; i < end; i++) {
                ChunkPos cp = new ChunkPos(preload.getLong(i));
                level.getChunkSource().addRegionTicket(TICKET, cp, 1, cp);
            }
            ChunkPos first = new ChunkPos(preload.getLong(preloadIdx));
            if (!level.getChunkSource().hasChunk(first.x, first.z)) {
                return false;
            }
            preloadIdx++;
        }
        return true;
    }

    private void beginPlacement(Long2ObjectMap<BlockCanvas.Section> sections) {
        this.source = sections;
        LongArrayList keys = new LongArrayList(sections.keySet());
        keys.sort((a, b) -> {
            int c = Integer.compare(SectionPos.x(a), SectionPos.x(b));
            if (c != 0) return c;
            c = Integer.compare(SectionPos.z(a), SectionPos.z(b));
            if (c != 0) return c;
            return Integer.compare(SectionPos.y(a), SectionPos.y(b));
        });
        this.order = keys;
        long n = 0;
        for (BlockCanvas.Section s : sections.values()) {
            for (int i = 0; i < 4096; i++) {
                if (s.get(i) != null) n++;
            }
        }
        this.total = n;
        rewind();
    }

    private void rewind() {
        sectionIdx = 0;
        slot = 0;
        visited = 0;
    }

    /** Walks every stored position once; returns true when the walk is complete. */
    private boolean advance(long deadline, boolean placing) {
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        int ops = 0;
        while (sectionIdx < order.size()) {
            long key = order.getLong(sectionIdx);
            BlockCanvas.Section section = source.get(key);
            int bx = SectionPos.x(key) << 4, by = SectionPos.y(key) << 4, bz = SectionPos.z(key) << 4;
            keepLoaded(SectionPos.x(key), SectionPos.z(key));
            while (slot < 4096) {
                int i = slot++;
                BlockState target = section.get(i);
                if (target == null) {
                    continue;
                }
                visited++;
                pos.set(bx + (i & 15), by + (i >> 8), bz + (i >> 4 & 15));
                if (placing) {
                    place(pos, target);
                } else {
                    reshape(pos);
                }
                if ((++ops & 31) == 0 && System.nanoTime() > deadline) {
                    return false;
                }
            }
            sectionIdx++;
            slot = 0;
        }
        return true;
    }

    private void keepLoaded(int chunkX, int chunkZ) {
        long chunk = ChunkPos.asLong(chunkX, chunkZ);
        if (chunk != lastTicketChunk) {
            lastTicketChunk = chunk;
            ChunkPos cp = new ChunkPos(chunkX, chunkZ);
            level.getChunkSource().addRegionTicket(TICKET, cp, 1, cp);
        }
    }

    private void place(BlockPos pos, BlockState target) {
        BlockState old = level.getBlockState(pos);
        CompoundTag restoreTag = restoreFrom != null ? restoreFrom.blockEntities.get(pos.asLong()) : null;
        if (old == target && restoreTag == null) {
            return;
        }
        if (undo != null) {
            undo.remember(pos.getX(), pos.getY(), pos.getZ(), old);
            if (old.hasBlockEntity()) {
                BlockEntity be = level.getBlockEntity(pos);
                if (be != null) {
                    undo.blockEntities.put(pos.asLong(), be.saveWithFullMetadata());
                }
            }
        }
        if (old.hasBlockEntity()) {
            // Empty containers first so replacing them never spills their contents.
            level.removeBlockEntity(pos);
        }
        level.setBlock(pos, target, FLAGS);
        changed++;
        if (restoreTag != null) {
            BlockEntity be = level.getBlockEntity(pos);
            if (be != null) {
                be.load(restoreTag);
                be.setChanged();
            }
        }
    }

    private void reshape(BlockPos pos) {
        BlockState cur = level.getBlockState(pos);
        if (cur.isAir() || cur.getBlock() instanceof LiquidBlock) {
            return;
        }
        FluidState fluid = cur.getFluidState();
        BlockState updated = Block.updateFromNeighbourShapes(cur, level, pos);
        if (updated != cur) {
            if (updated.isAir() && !fluid.isEmpty()) {
                updated = fluid.createLegacyBlock();
            }
            level.setBlock(pos, updated, FLAGS);
            cur = updated;
        }
        if (cur.getBlock() instanceof PoweredRailBlock) {
            // Re-read the redstone that feeds the rail now that everything around it exists.
            cur.neighborChanged(level, pos, cur.getBlock(), pos, false);
        }
    }

    private void finish() {
        if (restoreFrom != null) {
            for (UUID uuid : restoreFrom.spawnedEntities) {
                Entity e = level.getEntity(uuid);
                if (e != null) {
                    e.discard();
                }
            }
            return;
        }
        for (BlockCanvas.SignText sign : canvas.signs()) {
            if (level.getBlockEntity(sign.pos()) instanceof SignBlockEntity be) {
                SignText text = be.getFrontText();
                Component[] lines = sign.lines();
                for (int i = 0; i < Math.min(4, lines.length); i++) {
                    text = text.setMessage(i, lines[i]);
                }
                be.setText(text, true);
                be.setText(text, false);
                be.setChanged();
                level.sendBlockUpdated(sign.pos(), be.getBlockState(), be.getBlockState(), Block.UPDATE_CLIENTS);
            }
        }
        for (var factory : canvas.entities()) {
            Entity e = factory.apply(level);
            if (e != null && level.addFreshEntity(e) && undo != null) {
                undo.spawnedEntities.add(e.getUUID());
            }
        }
    }

    /** Thrown when a plan grows past the configured block limit. */
    static final class TooLargeException extends RuntimeException {
        final long blocks;

        TooLargeException(long blocks) {
            super("too large: " + blocks);
            this.blocks = blocks;
        }
    }

    /** Planned size once planning has finished (0 before that). */
    long plannedBlocks() {
        return phase == Phase.PLAN ? canvas.size() : total;
    }
}

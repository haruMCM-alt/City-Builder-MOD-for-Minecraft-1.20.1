package com.example.citybuilder.engine;

import com.example.citybuilder.config.CityBuilderConfig;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import javax.annotation.Nullable;
import net.minecraft.ChatFormatting;
import net.minecraft.Util;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.BossEvent;

/**
 * Runs build jobs one after another inside a per-tick time budget and keeps an undo
 * history per player. All methods are called on the server thread.
 */
public final class BuildManager {
    private static final Deque<BuildJob> QUEUE = new ArrayDeque<>();
    private static final Map<UUID, Deque<UndoRecord>> HISTORY = new HashMap<>();
    private static final Map<Long, ServerBossEvent> BARS = new HashMap<>();
    private static long nextId = 1;

    private BuildManager() {
    }

    /** Result of {@link #submit}: the job id and its position in the queue (0 = running now). */
    public record Ticket(long id, int position) {
    }

    /**
     * Queues a build. {@code bounds} (minX, minZ, maxX, maxZ) is the area the plan reads and writes;
     * its chunks are loaded in the background before planning starts.
     */
    public static Ticket submit(ServerLevel level, @Nullable UUID owner, Component label, List<Consumer<BlockCanvas>> steps,
                                @Nullable int[] bounds) {
        BuildJob job = BuildJob.build(nextId++, label, owner, level, new ArrayDeque<>(steps), bounds);
        QUEUE.addLast(job);
        return new Ticket(job.id, QUEUE.size() - 1);
    }

    /** Queues the newest undo record of the owner. Returns its label, or null if there is nothing to undo. */
    @Nullable
    public static Component undo(MinecraftServer server, @Nullable UUID owner) {
        Deque<UndoRecord> stack = HISTORY.get(key(owner));
        if (stack == null || stack.isEmpty()) {
            return null;
        }
        UndoRecord record = stack.pollLast();
        ServerLevel level = server.getLevel(record.dimension);
        if (level == null) {
            return null;
        }
        QUEUE.addLast(BuildJob.restore(nextId++, owner, level, record));
        return record.label();
    }

    /** True when no build is queued or running. */
    public static boolean isIdle() {
        return QUEUE.isEmpty();
    }

    public static int undoDepth(@Nullable UUID owner) {
        Deque<UndoRecord> stack = HISTORY.get(key(owner));
        return stack == null ? 0 : stack.size();
    }

    /** Stops the running job of this owner (keeping what was placed undoable) and drops their queued jobs. */
    public static int cancel(MinecraftServer server, @Nullable UUID owner, boolean everyone) {
        int n = 0;
        Iterator<BuildJob> it = QUEUE.iterator();
        boolean first = true;
        while (it.hasNext()) {
            BuildJob job = it.next();
            if (everyone || java.util.Objects.equals(job.owner, owner)) {
                if (first) {
                    finalizeJob(server, job, true, true);
                }
                it.remove();
                n++;
            }
            first = false;
        }
        return n;
    }

    public static List<Component> status() {
        List<Component> lines = new ArrayList<>();
        int i = 0;
        for (BuildJob job : QUEUE) {
            int pct = Math.round(job.progress() * 100);
            lines.add(Component.translatable(i == 0 ? "citybuilder.status.running" : "citybuilder.status.queued",
                    job.id, job.label, pct, job.plannedBlocks()));
            i++;
        }
        return lines;
    }

    public static void tick(MinecraftServer server) {
        if (QUEUE.isEmpty()) {
            return;
        }
        long budget = CityBuilderConfig.msPerTick() * 1_000_000L;
        long deadline = System.nanoTime() + budget;
        while (!QUEUE.isEmpty() && System.nanoTime() < deadline) {
            BuildJob job = QUEUE.peekFirst();
            boolean done;
            try {
                done = job.tick(deadline);
            } catch (BuildJob.TooLargeException e) {
                notifyOwner(server, job, Component.translatable("citybuilder.job.too_large", job.label, e.blocks,
                        CityBuilderConfig.maxBlocks()).withStyle(ChatFormatting.RED));
                QUEUE.pollFirst();
                finalizeJob(server, job, true, false);
                continue;
            } catch (RuntimeException e) {
                com.mojang.logging.LogUtils.getLogger().error("CityBuilder job {} failed", job.id, e);
                notifyOwner(server, job, Component.translatable("citybuilder.job.failed", job.label, String.valueOf(e.getMessage()))
                        .withStyle(ChatFormatting.RED));
                QUEUE.pollFirst();
                finalizeJob(server, job, true, false);
                continue;
            }
            updateBar(server, job);
            if (done) {
                QUEUE.pollFirst();
                finalizeJob(server, job, false, true);
            }
        }
    }

    private static void finalizeJob(MinecraftServer server, BuildJob job, boolean aborted, boolean announce) {
        ServerBossEvent bar = BARS.remove(job.id);
        if (bar != null) {
            bar.removeAllPlayers();
        }
        if (job.undo != null && job.undo.blocks() > 0 || job.undo != null && !job.undo.spawnedEntities.isEmpty()) {
            Deque<UndoRecord> stack = HISTORY.computeIfAbsent(key(job.owner), k -> new ArrayDeque<>());
            stack.addLast(job.undo);
            while (stack.size() > CityBuilderConfig.maxUndo()) {
                stack.pollFirst();
            }
        }
        double secs = job.startedAt == 0 ? 0 : (System.currentTimeMillis() - job.startedAt) / 1000.0;
        String time = String.format(java.util.Locale.ROOT, "%.1f", secs);
        if (!announce) {
            return;
        }
        if (aborted) {
            notifyOwner(server, job, Component.translatable("citybuilder.job.cancelled", job.label, job.changed)
                    .withStyle(ChatFormatting.YELLOW));
        } else if (job.isRestore()) {
            notifyOwner(server, job, Component.translatable("citybuilder.job.undone", job.label, job.changed, time)
                    .withStyle(ChatFormatting.AQUA));
        } else {
            notifyOwner(server, job, Component.translatable("citybuilder.job.done", job.label, job.changed, time)
                    .withStyle(ChatFormatting.GREEN));
        }
    }

    private static void updateBar(MinecraftServer server, BuildJob job) {
        if (!CityBuilderConfig.showProgressBar() || job.owner == null) {
            return;
        }
        ServerPlayer player = server.getPlayerList().getPlayer(job.owner);
        ServerBossEvent bar = BARS.get(job.id);
        if (bar == null) {
            bar = new ServerBossEvent(Component.empty(), BossEvent.BossBarColor.GREEN, BossEvent.BossBarOverlay.NOTCHED_10);
            BARS.put(job.id, bar);
        }
        if (player != null && !bar.getPlayers().contains(player)) {
            bar.addPlayer(player);
        }
        float p = job.progress();
        bar.setProgress(p);
        String phase = switch (job.phase) {
            case LOAD -> "citybuilder.phase.load";
            case PLAN -> "citybuilder.phase.plan";
            case PLACE -> "citybuilder.phase.place";
            default -> "citybuilder.phase.finish";
        };
        bar.setName(Component.translatable("citybuilder.job.bar", job.label, Component.translatable(phase), Math.round(p * 100)));
    }

    private static void notifyOwner(MinecraftServer server, BuildJob job, Component msg) {
        if (job.owner == null) {
            server.sendSystemMessage(msg);
            return;
        }
        ServerPlayer player = server.getPlayerList().getPlayer(job.owner);
        if (player != null) {
            player.sendSystemMessage(msg);
        }
    }

    public static void clear() {
        for (ServerBossEvent bar : BARS.values()) {
            bar.removeAllPlayers();
        }
        BARS.clear();
        QUEUE.clear();
        HISTORY.clear();
    }

    private static UUID key(@Nullable UUID owner) {
        return owner == null ? Util.NIL_UUID : owner;
    }
}

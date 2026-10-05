package com.example.citybuilder.blocks;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Server-side elevator rides. A jump is recognised as "was on the ground on a pad last tick and
 * is now rising", a sneak as the shift key going down while standing on a pad.
 */
public final class ElevatorHandler {
   private static final Map<UUID, Track> TRACKS = new HashMap<>();
   private static final int COOLDOWN = 6;

   private ElevatorHandler() {
   }

   private static final class Track {
      double lastY;
      boolean lastOnGround;
      boolean lastSneak;
      BlockPos lastPad;
      int cooldown;
   }

   public static void tick(ServerPlayer player) {
      Track t = TRACKS.computeIfAbsent(player.getUUID(), k -> new Track());
      if (t.cooldown > 0) {
         t.cooldown--;
      }
      ServerLevel level = player.serverLevel();
      BlockPos below = BlockPos.containing(player.getX(), player.getY() - 0.2, player.getZ());
      BlockPos pad = isPad(level, below) ? below : null;
      boolean sneak = player.isShiftKeyDown();

      if (t.cooldown == 0 && !player.isPassenger() && !player.isSpectator()) {
         if (pad != null && sneak && !t.lastSneak) {
            ride(player, level, pad, -1, t);
         } else if (t.lastPad != null && t.lastOnGround && !player.onGround() && player.getY() > t.lastY + 0.05) {
            ride(player, level, t.lastPad, 1, t);
         }
      }

      t.lastY = player.getY();
      t.lastOnGround = player.onGround();
      t.lastSneak = sneak;
      t.lastPad = pad;
   }

   private static boolean isPad(ServerLevel level, BlockPos pos) {
      return level.getBlockState(pos).is(ModBlocks.ELEVATOR.get());
   }

   private static void ride(ServerPlayer player, ServerLevel level, BlockPos from, int dir, Track t) {
      BlockPos.MutableBlockPos p = from.mutable();
      for (int i = 1; i <= ElevatorBlock.RANGE; i++) {
         p.setY(from.getY() + dir * i);
         if (level.isOutsideBuildHeight(p.getY())) {
            break;
         }
         if (isPad(level, p) && fits(level, p.above()) && fits(level, p.above(2))) {
            level.playSound(null, from, SoundEvents.ENDERMAN_TELEPORT, SoundSource.BLOCKS, 0.4f, dir > 0 ? 1.6f : 1.2f);
            player.teleportTo(p.getX() + 0.5, p.getY() + 1.0, p.getZ() + 0.5);
            player.fallDistance = 0;
            player.setDeltaMovement(0, 0, 0);
            level.playSound(null, p, SoundEvents.NOTE_BLOCK_BELL.value(), SoundSource.BLOCKS, 0.6f, dir > 0 ? 1.4f : 1.0f);
            int floors = Math.abs(p.getY() - from.getY());
            player.displayClientMessage(Component.translatable(dir > 0 ? "citybuilder.elevator.up" : "citybuilder.elevator.down",
                  p.getY() + 1, floors), true);
            t.cooldown = COOLDOWN;
            t.lastPad = null;
            return;
         }
      }
      player.displayClientMessage(Component.translatable("citybuilder.elevator.none"), true);
      t.cooldown = COOLDOWN * 2;
   }

   private static boolean fits(ServerLevel level, BlockPos pos) {
      BlockState s = level.getBlockState(pos);
      return s.getCollisionShape(level, pos).isEmpty();
   }

   public static void forget(UUID player) {
      TRACKS.remove(player);
   }
}

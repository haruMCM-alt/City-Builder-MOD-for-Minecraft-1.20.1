package com.example.citybuilder.builders;

import com.example.citybuilder.blocks.ModBlocks;
import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/** Shared building services: elevators, emergency ladders and their halls. */
final class Facilities {
   private Facilities() {
   }

   static BlockState elevator() {
      return ModBlocks.ELEVATOR.get().defaultBlockState();
   }

   /** One stop of an elevator column: the pad in the floor plus headroom up to the ceiling. */
   static void elevatorShaftStop(BlockCanvas l, int x, int fy, int z, int ceilingY) {
      l.set(x, fy, z, elevator());
      for (int y = fy + 1; y < Math.max(fy + 3, ceilingY); y++) {
         l.set(x, y, z, BuildUtil.air());
      }
   }

   /** A clear 3x3 hall around an elevator stop so furniture never blocks it. */
   static void elevatorHall(BlockCanvas l, int cx, int fy, int cz, int ceilingY) {
      BlockState floor = Blocks.POLISHED_ANDESITE.defaultBlockState();
      for (int dx = -1; dx <= 1; dx++) {
         for (int dz = -1; dz <= 1; dz++) {
            l.set(cx + dx, fy, cz + dz, floor);
            for (int y = fy + 1; y < ceilingY; y++) {
               l.set(cx + dx, y, cz + dz, BuildUtil.air());
            }
         }
      }
      elevatorShaftStop(l, cx, fy, cz, ceilingY);
   }
}

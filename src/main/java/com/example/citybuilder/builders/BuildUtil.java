package com.example.citybuilder.builders;

import com.example.citybuilder.config.CityBuilderConfig;
import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.BlockPos.MutableBlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.LadderBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallSignBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.level.block.state.properties.SlabType;

public final class BuildUtil {
   private BuildUtil() {
   }

   public static void fill(BlockCanvas level, int x1, int y1, int z1, int x2, int y2, int z2, BlockState state) {
      int minX = Math.min(x1, x2);
      int maxX = Math.max(x1, x2);
      int minY = Math.min(y1, y2);
      int maxY = Math.max(y1, y2);
      int minZ = Math.min(z1, z2);
      int maxZ = Math.max(z1, z2);

      for (int x = minX; x <= maxX; x++) {
         for (int y = minY; y <= maxY; y++) {
            for (int z = minZ; z <= maxZ; z++) {
               level.set(x, y, z, state);
            }
         }
      }
   }

   public static void hollowBox(BlockCanvas level, int x1, int y1, int z1, int x2, int y2, int z2, BlockState wall) {
      int minX = Math.min(x1, x2);
      int maxX = Math.max(x1, x2);
      int minY = Math.min(y1, y2);
      int maxY = Math.max(y1, y2);
      int minZ = Math.min(z1, z2);
      int maxZ = Math.max(z1, z2);

      for (int x = minX; x <= maxX; x++) {
         for (int y = minY; y <= maxY; y++) {
            for (int z = minZ; z <= maxZ; z++) {
               boolean edge = x == minX || x == maxX || z == minZ || z == maxZ || y == minY || y == maxY;
               if (edge) {
                  level.set(x, y, z, wall);
               }
            }
         }
      }
   }

   public static void setBlock(BlockCanvas level, int x, int y, int z, BlockState state) {
      level.set(x, y, z, state);
   }

   public static BlockState air() {
      return Blocks.AIR.defaultBlockState();
   }

   public static int sign(int v) {
      return Integer.compare(v, 0);
   }

   /** Stairs whose climbing direction is {@code facing} (the player walks towards facing to go up). */
   public static BlockState stairs(Block stairs, Direction facing) {
      return stairs.defaultBlockState().setValue(StairBlock.FACING, facing);
   }

   /** Upside-down stairs, used for counters and eaves. */
   public static BlockState stairsTop(Block stairs, Direction facing) {
      return stairs(stairs, facing).setValue(StairBlock.HALF, Half.TOP);
   }

   public static BlockState topSlab(Block slab) {
      return slab.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.TOP);
   }

   /** A complete door; {@code facing} points out of the building through the doorway. */
   public static void door(BlockCanvas l, int x, int y, int z, Block door, Direction facing) {
      l.set(x, y, z, door.defaultBlockState().setValue(DoorBlock.FACING, facing.getOpposite()));
   }

   /** A complete bed whose head lies one block towards {@code headDir}. */
   public static void bed(BlockCanvas l, int x, int y, int z, Block bed, Direction headDir) {
      l.set(x, y, z, bed.defaultBlockState().setValue(BedBlock.FACING, headDir));
   }

   /** A lantern that hangs from the block above it. */
   public static BlockState hangingLantern(Block lantern) {
      return lantern.defaultBlockState().setValue(LanternBlock.HANGING, true);
   }

   /**
    * A ladder column climbing from {@code y1} to {@code y2}, fixed to the wall on the side
    * opposite {@code facing}. Every block in the column (and the one above for headroom) is
    * cleared, so the column also cuts through any floors in the way.
    */
   public static void ladder(BlockCanvas l, int x, int z, int y1, int y2, Direction facing) {
      BlockState ladder = Blocks.LADDER.defaultBlockState().setValue(LadderBlock.FACING, facing);
      int wx = x - facing.getStepX();
      int wz = z - facing.getStepZ();
      for (int y = y1; y <= y2; y++) {
         l.set(x, y, z, ladder);
         BlockState wall = l.get(wx, y, wz);
         if (!wall.isFaceSturdy(l.level(), new net.minecraft.core.BlockPos(wx, y, wz), facing)) {
            l.set(wx, y, wz, Blocks.SMOOTH_STONE.defaultBlockState());
         }
      }
      l.set(x, y2 + 1, z, air());
      l.set(x, y2 + 2, z, air());
   }

   /** A wall sign hanging on the face {@code facing} of the block behind it, with up to four lines. */
   public static void wallSign(BlockCanvas l, int x, int y, int z, Block sign, Direction facing, Component... lines) {
      l.set(x, y, z, sign.defaultBlockState().setValue(WallSignBlock.FACING, facing));
      if (lines.length > 0) {
         l.signText(x, y, z, lines);
      }
   }

   /** Rotates a horizontal block state's FACING property if it has one. */
   public static BlockState facing(BlockState s, Direction d) {
      return s.hasProperty(BlockStateProperties.HORIZONTAL_FACING) ? s.setValue(BlockStateProperties.HORIZONTAL_FACING, d) : s;
   }

   /**
    * Extends a column downwards from {@code yTop} with {@code state} until it reaches solid
    * ground, so structures built over dips and slopes do not float.
    */
   public static void foundation(BlockCanvas l, int x, int yTop, int z, BlockState state) {
      int depth = CityBuilderConfig.foundationDepth();
      for (int i = 0; i < depth; i++) {
         int y = yTop - i;
         if (l.isSet(x, y, z)) {
            continue;
         }
         BlockState here = l.get(x, y, z);
         if (!here.canBeReplaced() && here.getFluidState().isEmpty()) {
            return;
         }
         l.set(x, y, z, state);
      }
   }

   /** Foundation under every column of a rectangle. */
   public static void foundation(BlockCanvas l, int x1, int yTop, int z1, int x2, int z2, BlockState state) {
      for (int x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
         for (int z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
            foundation(l, x, yTop, z, state);
         }
      }
   }

   /**
    * A square spiral staircase winding around a 1-block core at (cx, cz) from {@code y1} up to
    * {@code y2}, clearing headroom (including holes in any floors it passes through).
    */
   public static void spiralStair(BlockCanvas l, int cx, int cz, int y1, int y2, Block stairs, BlockState core) {
      // The eight cells around the core in walking order, each with the direction of travel.
      int[][] ring = {{-1, -1}, {0, -1}, {1, -1}, {1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}};
      Direction[] dir = {Direction.EAST, Direction.EAST, Direction.SOUTH, Direction.SOUTH,
            Direction.WEST, Direction.WEST, Direction.NORTH, Direction.NORTH};
      for (int y = y1; y <= y2 + 3; y++) {
         for (int[] c : ring) {
            l.set(cx + c[0], y, cz + c[1], air());
         }
         l.set(cx, y, cz, core);
      }
      int step = 0;
      for (int y = y1; y <= y2; y++, step++) {
         int k = step % 8;
         l.set(cx + ring[k][0], y, cz + ring[k][1], stairs(stairs, dir[k]));
      }
      // Landing: the cell after the last step is level with the top floor.
      int k = step % 8;
      l.set(cx + ring[k][0], y2, cz + ring[k][1], core);
   }

}

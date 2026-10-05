package com.example.citybuilder.builders;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ButtonBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.TrapDoorBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.level.block.state.properties.SlabType;

/**
 * Local drawing surface for one building. Coordinates are relative to the plot corner:
 * {@code i} runs east (+x), {@code j} runs south (+z) and {@code h} up from the ground layer.
 * Every building faces north, so the street is at small {@code j}.
 */
final class Plot {
   final BlockCanvas l;
   final int x;
   final int y;
   final int z;

   Plot(BlockCanvas l, int x, int y, int z) {
      this.l = l;
      this.x = x;
      this.y = y;
      this.z = z;
   }

   static BlockState s(Block b) {
      return b.defaultBlockState();
   }

   static BlockState air() {
      return Blocks.AIR.defaultBlockState();
   }

   static BlockState stairs(Block b, Direction facing) {
      return b.defaultBlockState().setValue(StairBlock.FACING, facing);
   }

   static BlockState stairsTop(Block b, Direction facing) {
      return stairs(b, facing).setValue(StairBlock.HALF, Half.TOP);
   }

   static BlockState slab(Block b) {
      return b.defaultBlockState();
   }

   static BlockState slabTop(Block b) {
      return b.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.TOP);
   }

   static BlockState log(Block b, Direction.Axis axis) {
      return b.defaultBlockState().setValue(RotatedPillarBlock.AXIS, axis);
   }

   /** A trapdoor standing open against the face {@code facing} of its block, used as panels and shutters. */
   static BlockState panel(Block trapdoor, Direction facing) {
      return trapdoor.defaultBlockState().setValue(TrapDoorBlock.FACING, facing).setValue(TrapDoorBlock.OPEN, true);
   }

   /** A closed trapdoor in the top half of its block: a thin horizontal awning or shelf. */
   static BlockState awning(Block trapdoor) {
      return trapdoor.defaultBlockState().setValue(TrapDoorBlock.HALF, Half.TOP);
   }

   static BlockState button(Block b, Direction facing) {
      return b.defaultBlockState().setValue(ButtonBlock.FACE, AttachFace.WALL).setValue(ButtonBlock.FACING, facing);
   }

   void set(int i, int h, int j, BlockState st) {
      l.set(x + i, y + h, z + j, st);
   }

   BlockState get(int i, int h, int j) {
      return l.get(x + i, y + h, z + j);
   }

   void fill(int i1, int h1, int j1, int i2, int h2, int j2, BlockState st) {
      for (int i = Math.min(i1, i2); i <= Math.max(i1, i2); i++) {
         for (int h = Math.min(h1, h2); h <= Math.max(h1, h2); h++) {
            for (int j = Math.min(j1, j2); j <= Math.max(j1, j2); j++) {
               set(i, h, j, st);
            }
         }
      }
   }

   void clear(int i1, int h1, int j1, int i2, int h2, int j2) {
      fill(i1, h1, j1, i2, h2, j2, air());
   }

   /** The four side walls of a box (no floor or ceiling). */
   void walls(int i1, int h1, int j1, int i2, int h2, int j2, BlockState st) {
      for (int h = h1; h <= h2; h++) {
         ring(i1, h, j1, i2, j2, st);
      }
   }

   void ring(int i1, int h, int j1, int i2, int j2, BlockState st) {
      for (int i = i1; i <= i2; i++) {
         set(i, h, j1, st);
         set(i, h, j2, st);
      }
      for (int j = j1; j <= j2; j++) {
         set(i1, h, j, st);
         set(i2, h, j, st);
      }
   }

   /** Horizontal beam ring of logs lying along the walls. */
   void beamRing(int i1, int h, int j1, int i2, int j2, Block logBlock) {
      for (int i = i1; i <= i2; i++) {
         set(i, h, j1, log(logBlock, Direction.Axis.X));
         set(i, h, j2, log(logBlock, Direction.Axis.X));
      }
      for (int j = j1 + 1; j < j2; j++) {
         set(i1, h, j, log(logBlock, Direction.Axis.Z));
         set(i2, h, j, log(logBlock, Direction.Axis.Z));
      }
   }

   /**
    * Gable roof over the walls i1..i2, j1..j2 with its lowest course at height {@code h}.
    * The ridge runs along the x axis when {@code alongX}, otherwise along z. The two triangular
    * gable ends above the walls are filled with {@code gable}; {@code cap} tops an odd ridge.
    */
   void gable(int i1, int j1, int i2, int j2, int h, boolean alongX, Block stairs, BlockState gable, BlockState cap, int ov) {
      if (alongX) {
         for (int k = 0; ; k++) {
            int lo = j1 - ov + k;
            int hi = j2 + ov - k;
            if (lo > hi) {
               break;
            }
            for (int i = i1 - ov; i <= i2 + ov; i++) {
               if (lo == hi) {
                  set(i, h + k, lo, cap);
               } else {
                  set(i, h + k, lo, stairs(stairs, Direction.SOUTH));
                  set(i, h + k, hi, stairs(stairs, Direction.NORTH));
               }
            }
            for (int j = Math.max(lo + 1, j1); j <= Math.min(hi - 1, j2); j++) {
               set(i1, h + k, j, gable);
               set(i2, h + k, j, gable);
            }
         }
      } else {
         for (int k = 0; ; k++) {
            int lo = i1 - ov + k;
            int hi = i2 + ov - k;
            if (lo > hi) {
               break;
            }
            for (int j = j1 - ov; j <= j2 + ov; j++) {
               if (lo == hi) {
                  set(lo, h + k, j, cap);
               } else {
                  set(lo, h + k, j, stairs(stairs, Direction.EAST));
                  set(hi, h + k, j, stairs(stairs, Direction.WEST));
               }
            }
            for (int i = Math.max(lo + 1, i1); i <= Math.min(hi - 1, i2); i++) {
               set(i, h + k, j1, gable);
               set(i, h + k, j2, gable);
            }
         }
      }
   }

   /** Number of courses a gable roof over a span of {@code span} blocks with overhang {@code ov} needs. */
   static int gableHeight(int span, int ov) {
      return (span + 2 * ov + 1) / 2;
   }

   /**
    * Hip roof: rings of stairs climbing inwards from every side, closed at the top with
    * {@code top}. Stair corners are reshaped automatically once the build is placed.
    * Returns the height of the top course.
    */
   int hip(int i1, int j1, int i2, int j2, int h, Block stairs, BlockState top, int ov) {
      for (int k = 0; ; k++) {
         int il = i1 - ov + k;
         int ih = i2 + ov - k;
         int jl = j1 - ov + k;
         int jh = j2 + ov - k;
         if (il > ih || jl > jh) {
            return h + k - 1;
         }
         if (ih - il < 2 || jh - jl < 2) {
            fill(il, h + k, jl, ih, h + k, jh, top);
            return h + k;
         }
         for (int i = il; i <= ih; i++) {
            set(i, h + k, jl, stairs(stairs, Direction.SOUTH));
            set(i, h + k, jh, stairs(stairs, Direction.NORTH));
         }
         for (int j = jl + 1; j < jh; j++) {
            set(il, h + k, j, stairs(stairs, Direction.EAST));
            set(ih, h + k, j, stairs(stairs, Direction.WEST));
         }
      }
   }

   /** One ring of eave stairs (a lean-to skirt roof round a building), e.g. the lower roof of a pagoda. */
   void skirt(int i1, int j1, int i2, int j2, int h, Block stairs, int ov) {
      for (int k = 0; k < ov; k++) {
         int il = i1 - ov + k;
         int ih = i2 + ov - k;
         int jl = j1 - ov + k;
         int jh = j2 + ov - k;
         for (int i = il; i <= ih; i++) {
            set(i, h + k, jl, stairs(stairs, Direction.SOUTH));
            set(i, h + k, jh, stairs(stairs, Direction.NORTH));
         }
         for (int j = jl + 1; j < jh; j++) {
            set(il, h + k, j, stairs(stairs, Direction.EAST));
            set(ih, h + k, j, stairs(stairs, Direction.WEST));
         }
      }
   }

   /** Flat roof slab with a low parapet. */
   void flatRoof(int i1, int j1, int i2, int j2, int h, BlockState roof, BlockState parapet) {
      fill(i1, h, j1, i2, h, j2, roof);
      ring(i1, h + 1, j1, i2, j2, parapet);
   }

   /** Complete door; {@code out} is the direction from inside to outside. */
   void door(int i, int h, int j, Block door, Direction out) {
      clear(i, h, j, i, h + 1, j);
      BuildUtil.door(l, x + i, y + h, z + j, door, out);
   }

   void bed(int i, int h, int j, Block bed, Direction headDir) {
      BuildUtil.bed(l, x + i, y + h, z + j, bed, headDir);
   }

   void hangingLantern(int i, int h, int j) {
      set(i, h, j, BuildUtil.hangingLantern(Blocks.LANTERN));
   }

   void sign(int i, int h, int j, Block wallSign, Direction facing, Component... lines) {
      BuildUtil.wallSign(l, x + i, y + h, z + j, wallSign, facing, lines);
   }

   void ladder(int i, int j, int h1, int h2, Direction facing) {
      BuildUtil.ladder(l, x + i, z + j, y + h1, y + h2, facing);
   }

   /** Straight flight of stairs climbing towards {@code dir}, clearing three blocks of headroom. */
   void flight(int i, int h, int j, Direction dir, int steps, Block stairs) {
      for (int k = 0; k < steps; k++) {
         int ii = i + dir.getStepX() * k;
         int jj = j + dir.getStepZ() * k;
         set(ii, h + k, jj, stairs(stairs, dir));
         clear(ii, h + k + 1, jj, ii, h + k + 3, jj);
      }
   }

   /** A Japanese stone lantern (toro). */
   void stoneLantern(int i, int h, int j) {
      set(i, h, j, s(Blocks.POLISHED_ANDESITE));
      set(i, h + 1, j, s(Blocks.ANDESITE_WALL));
      set(i, h + 2, j, s(Blocks.LANTERN));
      set(i, h + 3, j, slab(Blocks.ANDESITE_SLAB));
   }

   /** A small pine (bonsai-like) tree. */
   void pine(int i, int h, int j) {
      fill(i, h, j, i, h + 2, j, log(Blocks.SPRUCE_LOG, Direction.Axis.Y));
      for (int di = -1; di <= 1; di++) {
         for (int dj = -1; dj <= 1; dj++) {
            if (Math.abs(di) + Math.abs(dj) < 2) {
               set(i + di, h + 2, j + dj, s(Blocks.SPRUCE_LEAVES));
            }
         }
      }
      set(i, h + 3, j, s(Blocks.SPRUCE_LEAVES));
   }

   /** A rounded broad-leaf tree. */
   void tree(int i, int h, int j, Block logBlock, Block leaves, int height) {
      fill(i, h, j, i, h + height - 1, j, log(logBlock, Direction.Axis.Y));
      int top = h + height;
      for (int di = -2; di <= 2; di++) {
         for (int dj = -2; dj <= 2; dj++) {
            for (int dh = -2; dh <= 1; dh++) {
               int d = di * di + dj * dj + dh * dh * 2;
               if (d <= 5 && get(i + di, top + dh, j + dj).isAir()) {
                  set(i + di, top + dh, j + dj, s(leaves));
               }
            }
         }
      }
   }

   /** Ground cover for the whole plot (at h = 0). */
   void ground(int i1, int j1, int i2, int j2, BlockState st) {
      fill(i1, 0, j1, i2, 0, j2, st);
   }
}

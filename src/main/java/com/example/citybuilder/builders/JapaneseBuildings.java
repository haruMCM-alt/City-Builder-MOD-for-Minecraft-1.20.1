package com.example.citybuilder.builders;

import static com.example.citybuilder.builders.Plot.air;
import static com.example.citybuilder.builders.Plot.log;
import static com.example.citybuilder.builders.Plot.panel;
import static com.example.citybuilder.builders.Plot.s;
import static com.example.citybuilder.builders.Plot.slab;
import static com.example.citybuilder.builders.Plot.slabTop;
import static com.example.citybuilder.builders.Plot.stairs;
import static com.example.citybuilder.builders.Plot.stairsTop;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.BellBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BellAttachType;

/** Traditional Japanese buildings. Every plot faces north; the street side is j = 0. */
final class JapaneseBuildings {
   private static final Block TILE = Blocks.DEEPSLATE_TILE_STAIRS;
   private static final Block COPPER = Blocks.WAXED_OXIDIZED_CUT_COPPER_STAIRS;
   private static final BlockState PLASTER = s(Blocks.WHITE_CONCRETE);
   private static final BlockState SHOJI = s(Blocks.WHITE_STAINED_GLASS_PANE);
   private static final BlockState TATAMI = s(Blocks.BAMBOO_MOSAIC);

   private JapaneseBuildings() {
   }

   /** Timber-framed wall: dark posts every {@code bay} blocks, plaster infill, shoji windows. */
   private static void timberWalls(Plot p, int i1, int h1, int j1, int i2, int h2, int j2, int bay, boolean windows) {
      BlockState post = log(Blocks.DARK_OAK_LOG, Direction.Axis.Y);
      for (int h = h1; h <= h2; h++) {
         for (int i = i1; i <= i2; i++) {
            for (int j : new int[]{j1, j2}) {
               boolean isPost = i == i1 || i == i2 || (i - i1) % bay == 0;
               p.set(i, h, j, isPost ? post : wallFill(h, h1, h2, windows));
            }
         }
         for (int j = j1 + 1; j < j2; j++) {
            for (int i : new int[]{i1, i2}) {
               boolean isPost = (j - j1) % bay == 0;
               p.set(i, h, j, isPost ? post : wallFill(h, h1, h2, windows));
            }
         }
      }
   }

   private static BlockState wallFill(int h, int h1, int h2, boolean windows) {
      if (h == h1) {
         return s(Blocks.SPRUCE_PLANKS);
      }
      if (windows && h > h1 && h < h2) {
         return SHOJI;
      }
      return PLASTER;
   }

   // ------------------------------------------------------------------ house (minka)

   static void house(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(9, Math.min(size, 24));
      Plot p = new Plot(l, x, y, z);
      int i1 = 1;
      int i2 = s - 2;
      int j1 = 3;
      int j2 = s - 2;
      int mid = (i1 + i2) / 2;
      p.clear(0, 1, 0, s - 1, 6 + Plot.gableHeight(j2 - j1 + 1, 1), s - 1);

      // Garden, bamboo fence and stepping stones to the door.
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRASS_BLOCK));
      for (int i = 0; i < s; i++) {
         if (Math.abs(i - mid) > 1) {
            p.set(i, 1, 0, s(Blocks.BAMBOO_FENCE));
         }
      }
      for (int j = 1; j < s; j++) {
         p.set(0, 1, j, s(Blocks.BAMBOO_FENCE));
         p.set(s - 1, 1, j, s(Blocks.BAMBOO_FENCE));
      }
      for (int i = 0; i < s; i++) {
         p.set(i, 1, s - 1, s(Blocks.BAMBOO_FENCE));
      }
      for (int j = 0; j < j1; j++) {
         p.set(mid, 0, j, s(Blocks.POLISHED_ANDESITE));
      }
      p.stoneLantern(i1, 1, 1);
      p.pine(i2 - 1, 1, 1);

      // Raised floor on a stone base.
      p.fill(i1, 0, j1, i2, 0, j2, s(Blocks.STONE_BRICKS));
      p.fill(i1, 1, j1, i2, 1, j2, s(Blocks.SPRUCE_PLANKS));
      p.fill(i1 + 1, 1, j1 + 3, i2 - 1, 1, j2 - 1, TATAMI);
      timberWalls(p, i1, 1, j1, i2, 4, j2, 3, true);
      p.beamRing(i1, 5, j1, i2, j2, Blocks.STRIPPED_DARK_OAK_LOG);
      p.fill(i1 + 1, 5, j1 + 1, i2 - 1, 5, j2 - 1, s(Blocks.SPRUCE_PLANKS));
      p.gable(i1, j1, i2, j2, 6, true, TILE, PLASTER, slab(Blocks.DEEPSLATE_TILE_SLAB), 1);

      // Entrance (genkan) with a stone step and a small canopy.
      p.door(mid, 2, j1, Blocks.SPRUCE_DOOR, Direction.NORTH);
      p.set(mid, 1, j1 - 1, slab(Blocks.STONE_SLAB));
      p.fill(mid - 1, 1, j1 + 1, mid + 1, 1, j1 + 2, s(Blocks.POLISHED_ANDESITE));
      for (int i = mid - 2; i <= mid + 2; i++) {
         p.set(i, 5, j1 - 1, stairs(Blocks.DARK_OAK_STAIRS, Direction.SOUTH));
      }

      // Shoji partition between the entry room and the living room, with an opening.
      int pj = j1 + 3;
      for (int i = i1 + 1; i < i2; i++) {
         p.set(i, 2, pj, SHOJI);
         p.set(i, 3, pj, SHOJI);
         p.set(i, 4, pj, s(Blocks.DARK_OAK_PLANKS));
      }
      p.clear(mid, 2, pj, mid, 3, pj);

      // Irori hearth with cushions, low table and a hanging lamp.
      int cj = (pj + j2) / 2;
      p.set(mid, 1, cj, s(Blocks.CAMPFIRE));
      p.set(mid - 1, 2, cj, s(Blocks.RED_CARPET));
      p.set(mid + 1, 2, cj, s(Blocks.RED_CARPET));
      p.set(mid, 4, cj, s(Blocks.CHAIN));
      if (i2 - i1 >= 8) {
         p.set(i1 + 2, 2, cj, s(Blocks.SPRUCE_TRAPDOOR).setValue(net.minecraft.world.level.block.TrapDoorBlock.HALF, net.minecraft.world.level.block.state.properties.Half.TOP));
      }
      p.hangingLantern(i1 + 1, 4, pj + 1);
      p.hangingLantern(i2 - 1, 4, j2 - 1);

      // Futon, chest of drawers and a kitchen corner.
      p.bed(i2 - 1, 2, j2 - 2, Blocks.WHITE_BED, Direction.SOUTH);
      p.set(i2 - 1, 2, pj + 1, s(Blocks.BARREL));
      p.set(i1 + 1, 2, j1 + 1, s(Blocks.SMOKER).setValue(net.minecraft.world.level.block.AbstractFurnaceBlock.FACING, Direction.EAST));
      p.set(i1 + 1, 2, j1 + 2, s(Blocks.WATER_CAULDRON).setValue(LayeredCauldronBlock.LEVEL, 3));
      p.set(i2 - 1, 2, j1 + 1, s(Blocks.CHEST));
   }

   // ------------------------------------------------------------------ shrine (jinja)

   static void shrine(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(14, Math.min(size, 32));
      Plot p = new Plot(l, x, y, z);
      int c = s / 2;
      int hw = Math.min(11, s - 6) | 1;
      int hd = Math.max(6, Math.min(s / 3 + 2, 11));
      int hi1 = c - hw / 2;
      int hi2 = c + hw / 2;
      int hj2 = s - 3;
      int hj1 = hj2 - hd + 1;
      p.clear(0, 1, 0, s - 1, 16, s - 1);

      // Gravel precinct with a stone approach (sando).
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRAVEL));
      p.fill(c - 1, 0, 0, c + 1, 0, hj1 - 1, s(Blocks.SMOOTH_STONE));

      // Torii at the entrance.
      torii(p, c, 1, 1);

      // Stone lanterns and guardian lion-dogs along the approach.
      int lj = Math.max(3, Math.min(5, hj1 - 4));
      p.stoneLantern(c - 3, 1, lj);
      p.stoneLantern(c + 3, 1, lj);
      for (int side : new int[]{-1, 1}) {
         int ki = c + side * 2;
         p.set(ki, 1, hj1 - 3, s(Blocks.CHISELED_STONE_BRICKS));
         p.set(ki, 2, hj1 - 3, stairs(Blocks.STONE_BRICK_STAIRS, side < 0 ? Direction.WEST : Direction.EAST));
      }

      // Purification fountain (chozuya): a stone basin with water in its centre, under a little roof.
      int wi = 1;
      int wj = Math.max(3, lj - 1);
      p.fill(wi, 1, wj, wi + 2, 1, wj + 2, s(Blocks.STONE_BRICKS));
      p.set(wi + 1, 1, wj + 1, s(Blocks.WATER));
      p.set(wi + 1, 2, wj, s(Blocks.STONE_BRICK_WALL));
      for (int[] post : new int[][]{{wi, wj}, {wi + 2, wj}, {wi, wj + 2}, {wi + 2, wj + 2}}) {
         p.fill(post[0], 2, post[1], post[0], 3, post[1], s(Blocks.DARK_OAK_FENCE));
      }
      p.gable(wi, wj, wi + 2, wj + 2, 4, false, COPPER, s(Blocks.DARK_OAK_PLANKS), slab(Blocks.WAXED_OXIDIZED_CUT_COPPER_SLAB), 1);

      // Stone platform with steps up to the hall.
      p.fill(hi1 - 1, 0, hj1 - 1, hi2 + 1, 1, hj2 + 1, s(Blocks.STONE_BRICKS));
      p.fill(c - 1, 1, hj1 - 1, c + 1, 1, hj1 - 1, stairs(Blocks.STONE_BRICK_STAIRS, Direction.SOUTH));

      // Main hall: open front veranda, walled sanctuary behind.
      p.fill(hi1, 2, hj1, hi2, 2, hj2, s(Blocks.DARK_OAK_PLANKS));
      int wallJ = hj1 + 2;
      for (int i = hi1; i <= hi2; i += 2) {
         p.fill(i, 3, hj1, i, 6, hj1, log(Blocks.STRIPPED_DARK_OAK_LOG, Direction.Axis.Y));
      }
      p.fill(hi2, 3, hj1, hi2, 6, hj1, log(Blocks.STRIPPED_DARK_OAK_LOG, Direction.Axis.Y));
      timberWalls(p, hi1, 2, wallJ, hi2, 6, hj2, 2, false);
      for (int i = hi1 + 1; i < hi2; i++) {
         p.set(i, 3, wallJ, s(Blocks.SPRUCE_TRAPDOOR).setValue(net.minecraft.world.level.block.TrapDoorBlock.OPEN, true)
               .setValue(net.minecraft.world.level.block.TrapDoorBlock.FACING, Direction.NORTH));
         p.set(i, 4, wallJ, PLASTER);
      }
      p.door(c, 3, wallJ, Blocks.SPRUCE_DOOR, Direction.NORTH);
      p.beamRing(hi1, 7, hj1, hi2, hj2, Blocks.STRIPPED_DARK_OAK_LOG);
      p.fill(hi1 + 1, 7, hj1 + 1, hi2 - 1, 7, hj2 - 1, s(Blocks.DARK_OAK_PLANKS));
      int top = p.hip(hi1, hj1, hi2, hj2, 8, COPPER, slab(Blocks.WAXED_OXIDIZED_CUT_COPPER_SLAB), 2);
      // Katsuogi logs across the ridge.
      for (int i = hi1 + 1; i <= hi2 - 1; i += 2) {
         p.set(i, top, (hj1 + hj2) / 2, log(Blocks.STRIPPED_DARK_OAK_LOG, Direction.Axis.Z));
      }

      // Offering box, shimenawa rope with paper streamers, and the bell.
      p.set(c, 3, hj1, s(Blocks.BARREL));
      p.set(c, 4, hj1, s(Blocks.SPRUCE_TRAPDOOR));
      for (int i = hi1 + 1; i < hi2; i++) {
         p.set(i, 6, hj1, s(Blocks.HAY_BLOCK).setValue(net.minecraft.world.level.block.RotatedPillarBlock.AXIS, Direction.Axis.X));
      }
      p.set(c, 5, hj1, s(Blocks.BELL).setValue(BellBlock.ATTACHMENT, BellAttachType.CEILING).setValue(BellBlock.FACING, Direction.NORTH));
      p.hangingLantern(hi1 + 1, 5, hj1);
      p.hangingLantern(hi2 - 1, 5, hj1);
      p.hangingLantern(c, 6, (wallJ + hj2) / 2);
      p.set(c, 3, hj2 - 1, s(Blocks.GOLD_BLOCK));
      p.set(c - 1, 3, hj2 - 1, s(Blocks.LANTERN));
      p.set(c + 1, 3, hj2 - 1, s(Blocks.LANTERN));

      // Sacred trees.
      p.tree(1, 1, s - 3, Blocks.OAK_LOG, Blocks.OAK_LEAVES, 5);
      p.tree(s - 2, 1, s - 3, Blocks.CHERRY_LOG, Blocks.CHERRY_LEAVES, 4);
   }

   /** Vermilion torii gate centred on {@code c}, {@code half} blocks from the centre to each pillar. */
   static void torii(Plot p, int c, int j, int h0) {
      BlockState red = s(Blocks.RED_CONCRETE);
      int half = 3;
      for (int side : new int[]{-half, half}) {
         p.set(c + side, h0 - 1, j, s(Blocks.POLISHED_ANDESITE));
         p.fill(c + side, h0, j, c + side, h0 + 5, j, red);
      }
      // Nuki (tie beam) poking out past the pillars, an open gap, then the shimaki and black kasagi.
      p.fill(c - half - 1, h0 + 3, j, c + half + 1, h0 + 3, j, red);
      p.fill(c - half - 1, h0 + 5, j, c + half + 1, h0 + 5, j, red);
      p.fill(c - half - 1, h0 + 6, j, c + half + 1, h0 + 6, j, s(Blocks.POLISHED_BLACKSTONE));
      p.set(c - half - 2, h0 + 6, j, stairsTop(Blocks.POLISHED_BLACKSTONE_STAIRS, Direction.EAST));
      p.set(c + half + 2, h0 + 6, j, stairsTop(Blocks.POLISHED_BLACKSTONE_STAIRS, Direction.WEST));
      p.set(c - half - 2, h0 + 7, j, slab(Blocks.POLISHED_BLACKSTONE_SLAB));
      p.set(c + half + 2, h0 + 7, j, slab(Blocks.POLISHED_BLACKSTONE_SLAB));
      p.set(c, h0 + 4, j, s(Blocks.DARK_OAK_PLANKS));
   }

   // ------------------------------------------------------------------ temple (otera)

   static void temple(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(18, Math.min(size, 36));
      Plot p = new Plot(l, x, y, z);
      int c = s / 2;
      int hw = Math.min(15, s - 6) | 1;
      int hd = Math.max(9, Math.min(s - 10, 13));
      int i1 = c - hw / 2;
      int i2 = c + hw / 2;
      int j2 = s - 3;
      int j1 = j2 - hd + 1;
      p.clear(0, 1, 0, s - 1, 22, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRAVEL));
      p.fill(c - 1, 0, 0, c + 1, 0, j1, s(Blocks.SMOOTH_STONE));

      // Gate (sanmon) at the street.
      for (int side : new int[]{-2, 2}) {
         p.fill(c + side, 1, 1, c + side, 4, 1, log(Blocks.DARK_OAK_LOG, Direction.Axis.Y));
         p.fill(c + side, 1, 2, c + side, 4, 2, log(Blocks.DARK_OAK_LOG, Direction.Axis.Y));
      }
      p.fill(c - 2, 5, 1, c + 2, 5, 2, s(Blocks.DARK_OAK_PLANKS));
      p.gable(c - 2, 1, c + 2, 2, 6, true, TILE, s(Blocks.DARK_OAK_PLANKS), slab(Blocks.DEEPSLATE_TILE_SLAB), 1);

      // Incense burner in front of the hall.
      int bj = Math.max(5, j1 - 4);
      p.set(c, 1, bj, s(Blocks.POLISHED_BLACKSTONE));
      p.set(c, 2, bj, s(Blocks.CAULDRON));
      p.set(c, 3, bj, s(Blocks.CAMPFIRE).setValue(net.minecraft.world.level.block.CampfireBlock.LIT, false));
      p.stoneLantern(c - 3, 1, bj);
      p.stoneLantern(c + 3, 1, bj);

      // Three-step stone base.
      for (int k = 0; k < 3; k++) {
         p.fill(i1 - 3 + k, k, j1 - 3 + k, i2 + 3 - k, k, j2 + 2 - k, s(Blocks.POLISHED_ANDESITE));
      }
      for (int k = 0; k < 3; k++) {
         p.fill(c - 2, k, j1 - 3 + k, c + 2, k, j1 - 3 + k, stairs(Blocks.POLISHED_ANDESITE_STAIRS, Direction.SOUTH));
      }
      p.fill(i1, 3, j1, i2, 3, j2, s(Blocks.SPRUCE_PLANKS));

      // Main hall: vermilion columns, white walls, lattice front.
      BlockState column = s(Blocks.RED_TERRACOTTA);
      for (int h = 3; h <= 9; h++) {
         for (int i = i1; i <= i2; i++) {
            for (int j : new int[]{j1, j2}) {
               boolean col = i == i1 || i == i2 || (i - i1) % 2 == 0;
               BlockState st = col ? column : PLASTER;
               if (j == j1 && !col && h >= 4 && h <= 7) {
                  st = panel(Blocks.DARK_OAK_TRAPDOOR, Direction.NORTH);
               }
               p.set(i, h, j, st);
            }
         }
         for (int j = j1 + 1; j < j2; j++) {
            for (int i : new int[]{i1, i2}) {
               p.set(i, h, j, (j - j1) % 2 == 0 ? column : PLASTER);
            }
         }
      }
      p.clear(c - 1, 4, j1, c + 1, 6, j1);
      p.fill(c - 1, 3, j1 - 1, c + 1, 3, j1 - 1, s(Blocks.SPRUCE_PLANKS));
      p.beamRing(i1, 10, j1, i2, j2, Blocks.STRIPPED_DARK_OAK_LOG);
      p.fill(i1 + 1, 10, j1 + 1, i2 - 1, 10, j2 - 1, s(Blocks.DARK_OAK_PLANKS));

      // Lower skirt roof (mokoshi) and the main hip roof with a gilded finial.
      p.skirt(i1, j1, i2, j2, 7, TILE, 2);
      p.walls(i1 + 1, 9, j1 + 1, i2 - 1, 9, j2 - 1, PLASTER);
      int top = p.hip(i1 + 1, j1 + 1, i2 - 1, j2 - 1, 11, TILE, slab(Blocks.DEEPSLATE_TILE_SLAB), 2);
      p.set(c, top + 1, (j1 + j2) / 2, s(Blocks.GOLD_BLOCK));
      p.set(c, top + 2, (j1 + j2) / 2, s(Blocks.LIGHTNING_ROD));

      // Altar with a golden Buddha, candles and hanging lanterns.
      int aj = j2 - 2;
      p.fill(c - 2, 4, aj, c + 2, 4, aj, s(Blocks.DARK_OAK_PLANKS));
      p.fill(c, 5, aj, c, 6, aj, s(Blocks.GOLD_BLOCK));
      p.set(c, 7, aj, s(Blocks.RAW_GOLD_BLOCK));
      p.set(c - 2, 5, aj, s(Blocks.CANDLE).setValue(net.minecraft.world.level.block.CandleBlock.LIT, true));
      p.set(c + 2, 5, aj, s(Blocks.CANDLE).setValue(net.minecraft.world.level.block.CandleBlock.LIT, true));
      p.hangingLantern(c - 3, 9, (j1 + j2) / 2);
      p.hangingLantern(c + 3, 9, (j1 + j2) / 2);

      // Bell tower (shoro) beside the hall.
      int ti = i2 + 3 <= s - 3 ? s - 4 : 2;
      int tj = Math.max(4, j1 - 1);
      p.fill(ti - 1, 0, tj - 1, ti + 1, 0, tj + 1, s(Blocks.POLISHED_ANDESITE));
      for (int[] post : new int[][]{{ti - 1, tj - 1}, {ti + 1, tj - 1}, {ti - 1, tj + 1}, {ti + 1, tj + 1}}) {
         p.fill(post[0], 1, post[1], post[0], 5, post[1], log(Blocks.DARK_OAK_LOG, Direction.Axis.Y));
      }
      p.fill(ti - 1, 6, tj - 1, ti + 1, 6, tj + 1, s(Blocks.DARK_OAK_PLANKS));
      p.hip(ti - 1, tj - 1, ti + 1, tj + 1, 7, TILE, slab(Blocks.DEEPSLATE_TILE_SLAB), 1);
      p.set(ti, 5, tj, s(Blocks.BELL).setValue(BellBlock.ATTACHMENT, BellAttachType.CEILING).setValue(BellBlock.FACING, Direction.NORTH));

      p.tree(1, 1, s - 2, Blocks.CHERRY_LOG, Blocks.CHERRY_LEAVES, 4);
      p.pine(s - 2, 1, s - 2);
   }

   // ------------------------------------------------------------------ dojo

   static void dojo(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(12, Math.min(size, 28));
      Plot p = new Plot(l, x, y, z);
      int i1 = 1;
      int i2 = s - 2;
      int j1 = 3;
      int j2 = s - 2;
      int mid = (i1 + i2) / 2;
      p.clear(0, 1, 0, s - 1, 16, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRAVEL));
      for (int j = 0; j < j1; j++) {
         p.set(mid, 0, j, s(Blocks.SMOOTH_STONE));
         p.set(mid - 1, 0, j, s(Blocks.SMOOTH_STONE));
         p.set(mid + 1, 0, j, s(Blocks.SMOOTH_STONE));
      }

      p.fill(i1, 0, j1, i2, 1, j2, s(Blocks.STONE_BRICKS));
      p.fill(i1 + 1, 1, j1 + 1, i2 - 1, 1, j2 - 1, s(Blocks.OAK_PLANKS));
      // Tall walls with a row of lattice windows near the top.
      BlockState post = log(Blocks.DARK_OAK_LOG, Direction.Axis.Y);
      for (int h = 2; h <= 6; h++) {
         for (int i = i1; i <= i2; i++) {
            for (int j : new int[]{j1, j2}) {
               p.set(i, h, j, (i - i1) % 3 == 0 || i == i2 ? post : h == 5 ? s(Blocks.SPRUCE_FENCE) : h == 2 ? s(Blocks.SPRUCE_PLANKS) : PLASTER);
            }
         }
         for (int j = j1 + 1; j < j2; j++) {
            for (int i : new int[]{i1, i2}) {
               p.set(i, h, j, (j - j1) % 3 == 0 ? post : h == 5 ? s(Blocks.SPRUCE_FENCE) : h == 2 ? s(Blocks.SPRUCE_PLANKS) : PLASTER);
            }
         }
      }
      p.beamRing(i1, 7, j1, i2, j2, Blocks.STRIPPED_DARK_OAK_LOG);
      p.fill(i1 + 1, 7, j1 + 1, i2 - 1, 7, j2 - 1, s(Blocks.SPRUCE_PLANKS));
      p.hip(i1, j1, i2, j2, 8, TILE, slab(Blocks.DEEPSLATE_TILE_SLAB), 2);

      // Sliding-door entrance with a sign board above.
      p.fill(mid - 1, 1, j1 - 1, mid + 1, 1, j1 - 1, stairs(Blocks.STONE_BRICK_STAIRS, Direction.SOUTH));
      p.clear(mid - 1, 2, j1, mid + 1, 4, j1);
      p.set(mid - 1, 2, j1, s(Blocks.SPRUCE_DOOR).setValue(net.minecraft.world.level.block.DoorBlock.FACING, Direction.SOUTH)
            .setValue(net.minecraft.world.level.block.DoorBlock.HINGE, net.minecraft.world.level.block.state.properties.DoorHingeSide.RIGHT));
      p.set(mid + 1, 2, j1, s(Blocks.SPRUCE_DOOR).setValue(net.minecraft.world.level.block.DoorBlock.FACING, Direction.SOUTH)
            .setValue(net.minecraft.world.level.block.DoorBlock.HINGE, net.minecraft.world.level.block.state.properties.DoorHingeSide.LEFT));
      p.set(mid, 5, j1, s(Blocks.DARK_OAK_PLANKS));
      p.sign(mid, 5, j1 - 1, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH,
            Component.empty(), Component.translatable("citybuilder.sign.dojo"));

      // Kamidana shrine shelf, banners and practice targets inside.
      p.fill(mid - 1, 4, j2 - 1, mid + 1, 4, j2 - 1, s(Blocks.DARK_OAK_SLAB).setValue(net.minecraft.world.level.block.SlabBlock.TYPE,
            net.minecraft.world.level.block.state.properties.SlabType.TOP));
      p.set(mid, 5, j2 - 1, s(Blocks.GOLD_BLOCK));
      p.set(mid - 1, 5, j2 - 1, s(Blocks.LANTERN));
      p.set(mid + 1, 5, j2 - 1, s(Blocks.LANTERN));
      for (int i = i1 + 2; i <= i2 - 2; i += 3) {
         p.set(i, 2, j2 - 1, s(Blocks.HAY_BLOCK));
         p.set(i, 3, j2 - 1, s(Blocks.TARGET));
      }
      for (int j = j1 + 2; j <= j2 - 2; j += 3) {
         p.hangingLantern(mid, 6, j);
      }
   }

   // ------------------------------------------------------------------ sento (public bath)

   static void sento(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(14, Math.min(size, 28));
      Plot p = new Plot(l, x, y, z);
      int i1 = 1;
      int i2 = s - 2;
      int j1 = 3;
      int j2 = s - 2;
      int mid = (i1 + i2) / 2;
      p.clear(0, 1, 0, s - 1, 20, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.STONE_BRICKS));

      p.fill(i1, 0, j1, i2, 0, j2, s(Blocks.STONE_BRICKS));
      p.fill(i1, 1, j1, i2, 1, j2, s(Blocks.SPRUCE_PLANKS));
      timberWalls(p, i1, 1, j1, i2, 5, j2, 3, false);
      for (int i = i1 + 1; i < i2; i++) {
         if ((i - i1) % 3 != 0) {
            p.set(i, 5, j2, SHOJI);
            p.set(i, 5, j1, SHOJI);
         }
      }
      p.beamRing(i1, 6, j1, i2, j2, Blocks.STRIPPED_DARK_OAK_LOG);
      p.fill(i1 + 1, 6, j1 + 1, i2 - 1, 6, j2 - 1, s(Blocks.SPRUCE_PLANKS));
      p.hip(i1, j1, i2, j2, 7, TILE, slab(Blocks.DEEPSLATE_TILE_SLAB), 1);

      // Gabled porch (karahafu style) with the noren curtain and the "yu" sign.
      p.fill(mid - 2, 0, 0, mid + 2, 0, j1 - 1, s(Blocks.SMOOTH_STONE));
      for (int side : new int[]{-2, 2}) {
         p.fill(mid + side, 1, 1, mid + side, 4, 1, log(Blocks.DARK_OAK_LOG, Direction.Axis.Y));
      }
      p.fill(mid - 2, 5, 0, mid + 2, 5, j1 - 1, s(Blocks.DARK_OAK_PLANKS));
      p.gable(mid - 2, 0, mid + 2, j1 - 1, 6, false, TILE, s(Blocks.DARK_OAK_PLANKS), slab(Blocks.DEEPSLATE_TILE_SLAB), 1);
      p.clear(mid - 1, 2, j1, mid + 1, 4, j1);
      p.set(mid - 1, 4, j1, s(Blocks.BLUE_WOOL));
      p.set(mid, 4, j1, s(Blocks.WHITE_WOOL));
      p.set(mid + 1, 4, j1, s(Blocks.RED_WOOL));
      p.sign(mid, 5, -1, Blocks.SPRUCE_WALL_SIGN, Direction.NORTH, Component.empty(), Component.literal("♨ ゆ ♨"));
      p.set(mid, 5, 0, s(Blocks.DARK_OAK_PLANKS));

      // Brick chimney.
      int ci = i2 - 1;
      int cj = j2 - 1;
      p.fill(ci, 2, cj, ci, 16, cj, s(Blocks.BRICKS));
      p.set(ci, 17, cj, s(Blocks.CAMPFIRE).setValue(net.minecraft.world.level.block.CampfireBlock.SIGNAL_FIRE, false));

      // Inside: shoe lockers and changing room in front, bath hall behind.
      int fj = j1 + 4;
      for (int i = i1 + 1; i < i2; i++) {
         p.set(i, 2, j1 + 1, s(Blocks.BARREL));
      }
      p.clear(mid - 1, 2, j1 + 1, mid + 1, 2, j1 + 1);
      for (int i = i1 + 1; i < i2; i++) {
         p.fill(i, 2, fj, i, 5, fj, PLASTER);
      }
      p.clear(mid - 1, 2, fj, mid - 1, 3, fj);
      p.clear(mid + 1, 2, fj, mid + 1, 3, fj);
      p.set(mid - 1, 4, fj, s(Blocks.BLUE_WOOL));
      p.set(mid + 1, 4, fj, s(Blocks.RED_WOOL));
      // Divider between the men's and women's sides.
      p.fill(mid, 2, fj, mid, 5, j2 - 1, s(Blocks.SMOOTH_QUARTZ));

      for (int side : new int[]{-1, 1}) {
         int a = side < 0 ? i1 + 1 : mid + 1;
         int b = side < 0 ? mid - 1 : i2 - 1;
         p.fill(a, 1, fj + 1, b, 1, j2 - 1, s(Blocks.LIGHT_BLUE_TERRACOTTA));
         // Bath tub.
         p.fill(a, 1, j2 - 3, b, 1, j2 - 1, s(Blocks.WATER));
         p.fill(a, 1, j2 - 4, b, 1, j2 - 4, s(Blocks.SMOOTH_STONE));
         p.fill(a, 2, j2 - 4, b, 2, j2 - 4, slab(Blocks.SMOOTH_STONE_SLAB));
         // Washing stations.
         for (int i = a; i <= b; i += 2) {
            p.set(i, 2, fj + 1, s(Blocks.STONE_BUTTON).setValue(net.minecraft.world.level.block.ButtonBlock.FACE,
                  net.minecraft.world.level.block.state.properties.AttachFace.FLOOR));
            p.set(i, 3, fj + 1, s(Blocks.WATER_CAULDRON).setValue(LayeredCauldronBlock.LEVEL, 3));
         }
      }
      // Mount Fuji mural on the inside of the back wall.
      for (int i = i1 + 1; i < i2; i++) {
         if (i == mid) {
            continue;
         }
         int dist = Math.abs(i - (i1 + i2) / 2);
         int peak = 5 - dist / 2;
         for (int h = 2; h <= 5; h++) {
            BlockState st = h > peak ? s(Blocks.LIGHT_BLUE_CONCRETE) : (h == peak && peak >= 4 ? s(Blocks.WHITE_CONCRETE) : s(Blocks.BLUE_CONCRETE));
            p.set(i, h, j2 - 1, st);
         }
      }
      p.fill(i1 + 1, 1, j2 - 1, i2 - 1, 1, j2 - 1, s(Blocks.SMOOTH_STONE));
      for (int j = fj + 2; j < j2 - 3; j += 3) {
         p.set(mid - 2, 5, j, s(Blocks.SEA_LANTERN));
         p.set(mid + 2, 5, j, s(Blocks.SEA_LANTERN));
      }
      p.hangingLantern(mid, 5, j1 + 2);
   }

   // ------------------------------------------------------------------ hot spring inn (ryokan)

   static void hotspring(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(16, Math.min(size, 32));
      Plot p = new Plot(l, x, y, z);
      p.clear(0, 1, 0, s - 1, 18, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRASS_BLOCK));

      // Two-storey inn along the back of the plot.
      int i1 = 1;
      int i2 = s - 2;
      int j2 = s - 2;
      int j1 = j2 - Math.max(6, s / 3) + 1;
      int mid = (i1 + i2) / 2;
      p.fill(i1, 0, j1, i2, 0, j2, s(Blocks.STONE_BRICKS));
      p.fill(i1, 1, j1, i2, 1, j2, s(Blocks.SPRUCE_PLANKS));
      timberWalls(p, i1, 1, j1, i2, 4, j2, 3, true);
      p.beamRing(i1, 5, j1, i2, j2, Blocks.STRIPPED_DARK_OAK_LOG);
      p.fill(i1 + 1, 5, j1 + 1, i2 - 1, 5, j2 - 1, s(Blocks.SPRUCE_PLANKS));
      p.skirt(i1, j1, i2, j2, 5, TILE, 1);
      timberWalls(p, i1, 6, j1, i2, 8, j2, 3, true);
      p.beamRing(i1, 9, j1, i2, j2, Blocks.STRIPPED_DARK_OAK_LOG);
      p.fill(i1 + 1, 9, j1 + 1, i2 - 1, 9, j2 - 1, s(Blocks.SPRUCE_PLANKS));
      p.hip(i1, j1, i2, j2, 10, TILE, slab(Blocks.DEEPSLATE_TILE_SLAB), 1);
      // Balcony rail on the upper floor, facing the bath.
      for (int i = i1; i <= i2; i++) {
         p.set(i, 6, j1 - 1, s(Blocks.DARK_OAK_PLANKS));
         p.set(i, 7, j1 - 1, s(Blocks.DARK_OAK_FENCE));
      }

      // Entrance with noren and the onsen sign.
      p.door(mid, 2, j1, Blocks.SPRUCE_DOOR, Direction.NORTH);
      p.set(mid - 1, 4, j1, s(Blocks.RED_WOOL));
      p.set(mid + 1, 4, j1, s(Blocks.RED_WOOL));
      p.sign(mid, 4, j1 - 1, Blocks.SPRUCE_WALL_SIGN, Direction.NORTH, Component.empty(), Component.translatable("citybuilder.sign.onsen"));
      for (int j = 0; j < j1; j++) {
         p.set(mid, 0, j, s(Blocks.POLISHED_ANDESITE));
      }

      // Rooms: tatami, futons, staircase up.
      p.fill(i1 + 1, 1, j1 + 1, i2 - 1, 1, j2 - 1, TATAMI);
      p.fill(i1 + 1, 6, j1 + 1, i2 - 1, 6, j2 - 1, TATAMI);
      p.flight(i2 - 1, 2, j1 + 1, Direction.SOUTH, Math.min(4, j2 - j1 - 2), Blocks.SPRUCE_STAIRS);
      for (int i = i1 + 1; i < i2 - 2; i += 3) {
         p.bed(i, 7, j2 - 2, Blocks.WHITE_BED, Direction.SOUTH);
         p.hangingLantern(i + 1, 8, j1 + 2);
      }
      p.hangingLantern(mid, 4, (j1 + j2) / 2);

      // Outdoor rock bath (rotenburo) in front, screened by a bamboo fence.
      int bi1 = 2;
      int bi2 = s - 3;
      int bj1 = 2;
      int bj2 = j1 - 3;
      if (bj2 - bj1 >= 2) {
         for (int i = bi1 - 1; i <= bi2 + 1; i++) {
            for (int j = bj1 - 1; j <= bj2 + 1; j++) {
               boolean rim = i < bi1 || i > bi2 || j < bj1 || j > bj2;
               p.set(i, 0, j, s(Blocks.STONE));
               p.set(i, 1, j, rim ? (Math.floorMod(i * 3 + j, 4) == 0 ? s(Blocks.MOSSY_COBBLESTONE) : s(Blocks.STONE)) : s(Blocks.WATER));
            }
         }
         p.set(bi1, 2, bj1, s(Blocks.STONE));
         p.set(bi2, 2, bj2, s(Blocks.MOSSY_COBBLESTONE));
         p.stoneLantern(bi2 + 1, 2, bj1 - 1);
      }
      for (int i = 0; i < s; i++) {
         if (Math.abs(i - mid) > 1) {
            p.fill(i, 1, 0, i, 3, 0, s(Blocks.BAMBOO_BLOCK));
         }
      }
      for (int j = 0; j < j1; j++) {
         p.fill(0, 1, j, 0, 3, j, s(Blocks.BAMBOO_BLOCK));
         p.fill(s - 1, 1, j, s - 1, 3, j, s(Blocks.BAMBOO_BLOCK));
      }
   }

   // ------------------------------------------------------------------ fire lookout tower (hinomi yagura)

   static void tower(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(5, Math.min(size, 9));
      Plot p = new Plot(l, x, y, z);
      int top = 14 + s;
      p.clear(0, 1, 0, s - 1, top + 6, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRAVEL));
      p.fill(0, 0, 0, 0, 0, 0, s(Blocks.POLISHED_ANDESITE));
      BlockState leg = log(Blocks.DARK_OAK_LOG, Direction.Axis.Y);
      int a = 0;
      int b = s - 1;
      for (int[] c : new int[][]{{a, a}, {b, a}, {a, b}, {b, b}}) {
         p.set(c[0], 0, c[1], s(Blocks.POLISHED_ANDESITE));
         p.fill(c[0], 1, c[1], c[0], top - 1, c[1], leg);
      }
      // Horizontal braces every four blocks.
      for (int h = 4; h < top; h += 4) {
         p.beamRing(a, h, a, b, b, Blocks.STRIPPED_DARK_OAK_LOG);
      }
      // Diagonal cross bracing with fences on every face.
      for (int h = 1; h < top - 1; h++) {
         int phase = (h - 1) % 4;
         int pos = phase * (s - 1) / 3;
         if (pos > 0 && pos < s - 1) {
            p.set(pos, h, a, s(Blocks.DARK_OAK_FENCE));
            p.set(s - 1 - pos, h, b, s(Blocks.DARK_OAK_FENCE));
            p.set(a, h, s - 1 - pos, s(Blocks.DARK_OAK_FENCE));
            p.set(b, h, pos, s(Blocks.DARK_OAK_FENCE));
         }
      }
      // Lookout platform with railing, bell and a pyramid roof.
      p.fill(a, top, a, b, top, b, s(Blocks.SPRUCE_PLANKS));
      p.ring(a, top + 1, a, b, b, s(Blocks.DARK_OAK_FENCE));
      for (int[] c : new int[][]{{a, a}, {b, a}, {a, b}, {b, b}}) {
         p.fill(c[0], top + 1, c[1], c[0], top + 3, c[1], leg);
      }
      p.hip(a, a, b, b, top + 4, Blocks.SPRUCE_STAIRS, slab(Blocks.SPRUCE_SLAB), 1);
      int cc = s / 2;
      p.set(cc, top + 3, cc, s(Blocks.BELL).setValue(BellBlock.ATTACHMENT, BellAttachType.CEILING).setValue(BellBlock.FACING, Direction.NORTH));
      p.set(cc, top + 4, cc, s(Blocks.SPRUCE_PLANKS));
      // Ladder fixed to the north-west leg, through a hatch in the platform.
      p.ladder(a + 1, a, 1, top, Direction.EAST);
      p.set(a + 1, top + 1, a, air());
      p.set(a + 1, top + 2, a, air());
   }
}

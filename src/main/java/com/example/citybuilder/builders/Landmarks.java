package com.example.citybuilder.builders;

import static com.example.citybuilder.builders.Plot.air;
import static com.example.citybuilder.builders.Plot.awning;
import static com.example.citybuilder.builders.Plot.log;
import static com.example.citybuilder.builders.Plot.s;
import static com.example.citybuilder.builders.Plot.slab;
import static com.example.citybuilder.builders.Plot.slabTop;
import static com.example.citybuilder.builders.Plot.stairs;
import static com.example.citybuilder.builders.Plot.stairsTop;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChainBlock;
import net.minecraft.world.level.block.state.BlockState;

/** Big public buildings and open spaces. Every plot faces north (street at j = 0). */
final class Landmarks {
   private Landmarks() {
   }

   // ------------------------------------------------------------------ SHIBUYA109

   static void shibuya109(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(16, Math.min(size, 32));
      Plot p = new Plot(l, x, y, z);
      int r = s / 2 - 2;
      int c = s / 2;
      int floors = 9;
      int fh = 4;
      int top = floors * fh;
      p.clear(0, 1, 0, s - 1, top + 12, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.SMOOTH_STONE));
      // Plaza paving in a fan in front.
      for (int i = 0; i < s; i++) {
         for (int j = 0; j < s; j++) {
            if ((i + j) % 4 == 0) {
               p.set(i, 0, j, s(Blocks.POLISHED_ANDESITE));
            }
         }
      }

      // Silver cylinder: metal panels with a glass band on every floor.
      for (int f = 0; f < floors; f++) {
         int fy = f * fh;
         disc(p, c, c, r, fy, s(Blocks.POLISHED_ANDESITE));
         for (int h = fy + 1; h < fy + fh; h++) {
            BlockState shell = h == fy + 2 ? s(Blocks.LIGHT_GRAY_STAINED_GLASS) : s(Blocks.IRON_BLOCK);
            if (f == 0 && h <= 3) {
               shell = s(Blocks.GLASS);
            }
            ring(p, c, c, r, h, shell);
         }
         ring(p, c, c, r, fy, s(Blocks.SMOOTH_STONE));
         // Shop racks of clothes round the walls.
         Block[] cloth = {Blocks.PINK_WOOL, Blocks.WHITE_WOOL, Blocks.MAGENTA_WOOL, Blocks.LIGHT_BLUE_WOOL, Blocks.YELLOW_WOOL};
         for (int a = 0; a < 360; a += 30) {
            double rad = Math.toRadians(a + f * 15);
            int i = c + (int) Math.round(Math.cos(rad) * (r - 3));
            int j = c + (int) Math.round(Math.sin(rad) * (r - 3));
            if (Math.abs(i - c) > 1 || Math.abs(j - c) > 1) {
               p.set(i, fy + 1, j, s(Blocks.IRON_BARS));
               p.set(i, fy + 2, j, s(cloth[(a / 30 + f) % cloth.length]));
            }
         }
         for (int a = 0; a < 360; a += 60) {
            double rad = Math.toRadians(a);
            p.set(c + (int) Math.round(Math.cos(rad) * (r / 2)), fy + fh - 1, c + (int) Math.round(Math.sin(rad) * (r / 2)), s(Blocks.SEA_LANTERN));
         }
      }
      disc(p, c, c, r, top, s(Blocks.SMOOTH_STONE));
      ring(p, c, c, r, top + 1, s(Blocks.IRON_BARS));
      // Crown ring and the logo tower.
      ring(p, c, c, r, top, s(Blocks.WHITE_CONCRETE));
      int si = c;
      int sj = c - r - 1;
      for (int h = 4; h <= top + 6; h++) {
         p.set(si - 1, h, sj, s(Blocks.WHITE_CONCRETE));
         p.set(si, h, sj, s(Blocks.WHITE_CONCRETE));
         p.set(si + 1, h, sj, s(Blocks.WHITE_CONCRETE));
      }
      // "109" stacked vertically on the logo tower.
      int[][] glyphs = {
         {0b010, 0b110, 0b010, 0b010, 0b111},
         {0b111, 0b101, 0b101, 0b101, 0b111},
         {0b111, 0b101, 0b111, 0b001, 0b111},
      };
      int gy = top + 3;
      for (int g = 0; g < 3; g++) {
         for (int row = 0; row < 5; row++) {
            for (int col = 0; col < 3; col++) {
               if ((glyphs[g][row] >> (2 - col) & 1) == 1) {
                  p.set(si + 1 - col, gy - g * 7 - row, sj - 1, s(Blocks.RED_CONCRETE));
               }
            }
         }
      }
      // Entrance under a canopy and the elevator core.
      p.clear(c - 1, 1, c - r, c + 1, 3, c - r + 1);
      p.fill(c - 3, 4, c - r - 2, c + 3, 4, c - r, slab(Blocks.SMOOTH_STONE_SLAB));
      for (int f = 0; f <= floors; f++) {
         Facilities.elevatorHall(l, x + c, y + f * fh, z + c, y + f * fh + (f < floors ? fh : 3));
      }
   }

   private static void disc(Plot p, int ci, int cj, int r, int h, BlockState st) {
      for (int di = -r; di <= r; di++) {
         for (int dj = -r; dj <= r; dj++) {
            if (di * di + dj * dj <= r * r + r) {
               p.set(ci + di, h, cj + dj, st);
            }
         }
      }
   }

   private static void ring(Plot p, int ci, int cj, int r, int h, BlockState st) {
      for (int di = -r; di <= r; di++) {
         for (int dj = -r; dj <= r; dj++) {
            int d = di * di + dj * dj;
            if (d <= r * r + r && d > (r - 1) * (r - 1) + (r - 1)) {
               p.set(ci + di, h, cj + dj, st);
            }
         }
      }
   }

   // ------------------------------------------------------------------ department store

   static void department(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(18, Math.min(size, 36));
      Plot p = new Plot(l, x, y, z);
      int i1 = 0;
      int i2 = s - 1;
      int j1 = 2;
      int j2 = s - 1;
      int floors = 6;
      int fh = 5;
      int top = floors * fh;
      int ci = (i1 + i2) / 2;
      int cj = (j1 + j2) / 2;
      p.clear(0, 1, 0, s - 1, top + 10, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.POLISHED_ANDESITE));

      BlockState stone = s(Blocks.SMOOTH_SANDSTONE);
      BlockState base = s(Blocks.POLISHED_GRANITE);
      for (int f = 0; f < floors; f++) {
         int fy = f * fh;
         p.fill(i1, fy, j1, i2, fy, j2, f == 0 ? base : stone);
         p.fill(i1 + 1, fy, j1 + 1, i2 - 1, fy, j2 - 1, f == 0 ? s(Blocks.POLISHED_DIORITE) : s(Blocks.SMOOTH_QUARTZ));
         for (int h = fy + 1; h < fy + fh; h++) {
            for (int i = i1; i <= i2; i++) {
               p.set(i, h, j1, facade(f, h - fy, i - i1, stone, base));
               p.set(i, h, j2, facade(f, h - fy, i - i1, stone, base));
            }
            for (int j = j1 + 1; j < j2; j++) {
               p.set(i1, h, j, facade(f, h - fy, j - j1, stone, base));
               p.set(i2, h, j, facade(f, h - fy, j - j1, stone, base));
            }
         }
      }
      // Display-window awnings, entrance and the big name sign.
      for (int i = i1; i <= i2; i++) {
         p.set(i, 4, j1 - 1, awning(Blocks.DARK_OAK_TRAPDOOR));
      }
      p.clear(ci - 1, 1, j1, ci + 1, 3, j1);
      p.fill(ci - 3, fh + 1, j1 - 1, ci + 3, fh + 2, j1 - 1, s(Blocks.GOLD_BLOCK));
      p.sign(ci, fh + 3, j1 - 1, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH,
            Component.empty(), Component.translatable("citybuilder.sign.department"));
      p.set(ci, fh + 3, j1, stone);

      // Cornice, rooftop garden, playground and flags.
      for (int i = i1 - 1; i <= i2 + 1; i++) {
         p.set(i, top, j1 - 1, stairsTop(Blocks.SANDSTONE_STAIRS, Direction.SOUTH));
         p.set(i, top, j2 + 1, stairsTop(Blocks.SANDSTONE_STAIRS, Direction.NORTH));
      }
      for (int j = j1; j <= j2; j++) {
         p.set(i1 - 1, top, j, stairsTop(Blocks.SANDSTONE_STAIRS, Direction.EAST));
         p.set(i2 + 1, top, j, stairsTop(Blocks.SANDSTONE_STAIRS, Direction.WEST));
      }
      p.flatRoof(i1, j1, i2, j2, top, stone, s(Blocks.SANDSTONE_WALL));
      p.fill(i1 + 2, top, j1 + 2, i2 - 2, top, j2 - 2, s(Blocks.GRASS_BLOCK));
      p.fill(ci - 1, top, j1 + 2, ci + 1, top, j2 - 2, s(Blocks.SMOOTH_STONE));
      for (int[] t : new int[][]{{i1 + 4, j1 + 4}, {i2 - 4, j1 + 4}, {i1 + 4, j2 - 4}, {i2 - 4, j2 - 4}}) {
         p.tree(t[0], top + 1, t[1], Blocks.OAK_LOG, Blocks.OAK_LEAVES, 3);
      }
      p.set(ci, top + 1, j2 - 3, s(Blocks.SMOOTH_STONE));
      JapaneseBuildings.torii(p, ci, j2 - 5, top + 1);
      for (int i : new int[]{i1, ci, i2}) {
         p.fill(i, top + 1, j1, i, top + 6, j1, s(Blocks.IRON_BARS));
         p.set(i, top + 6, j1 - 1, s(Blocks.RED_WOOL));
         p.set(i, top + 5, j1 - 1, s(Blocks.WHITE_WOOL));
      }

      // Atrium, escalators and goods on every floor.
      for (int f = 0; f < floors; f++) {
         int fy = f * fh;
         if (f > 0) {
            p.clear(ci - 2, fy, cj - 2, ci + 2, fy, cj + 2);
            p.ring(ci - 3, fy + 1, cj - 3, ci + 3, cj + 3, s(Blocks.GLASS_PANE));
            p.ring(ci - 3, fy, cj - 3, ci + 3, cj + 3, s(Blocks.SMOOTH_QUARTZ));
         }
         departmentFloor(p, f, i1, fy, j1, i2, j2, ci, cj, fh);
         if (f < floors - 1) {
            for (int k = 0; k < fh; k++) {
               p.set(ci + 4, fy + 1 + k, cj - 2 + k, stairs(Blocks.POLISHED_ANDESITE_STAIRS, Direction.SOUTH));
               p.clear(ci + 4, fy + 2 + k, cj - 2 + k, ci + 4, fy + 4 + k, cj - 2 + k);
               p.set(ci - 4, fy + 1 + k, cj + 2 - k, stairs(Blocks.POLISHED_ANDESITE_STAIRS, Direction.NORTH));
               p.clear(ci - 4, fy + 2 + k, cj + 2 - k, ci - 4, fy + 4 + k, cj + 2 - k);
            }
         }
         for (int i = i1 + 3; i < i2 - 2; i += 4) {
            for (int j = j1 + 3; j < j2 - 2; j += 4) {
               if (Math.abs(i - ci) > 4 || Math.abs(j - cj) > 4) {
                  p.set(i, fy + fh - 1, j, s(Blocks.SEA_LANTERN));
               }
            }
         }
         p.set(ci, fy + fh - 1, cj, s(Blocks.CHAIN).setValue(ChainBlock.AXIS, Direction.Axis.Y));
      }
      p.set(ci, fh - 2, cj, s(Blocks.LANTERN).setValue(net.minecraft.world.level.block.LanternBlock.HANGING, true));
      for (int f = 0; f <= floors; f++) {
         Facilities.elevatorShaftStop(l, x + i2 - 2, y + f * fh, z + j2 - 2, y + f * fh + (f < floors ? fh : 3));
      }
   }

   private static BlockState facade(int floor, int h, int u, BlockState stone, BlockState base) {
      boolean pier = u % 4 == 0;
      if (floor == 0) {
         if (pier) {
            return base;
         }
         return h <= 3 ? s(Blocks.GLASS) : s(Blocks.DARK_OAK_PLANKS);
      }
      if (pier || h == 1 || h == 4) {
         return stone;
      }
      return s(Blocks.GLASS_PANE);
   }

   private static void departmentFloor(Plot p, int f, int i1, int fy, int j1, int i2, int j2, int ci, int cj, int fh) {
      Block[][] goods = {
         {Blocks.QUARTZ_BLOCK, Blocks.FLOWER_POT},
         {Blocks.STRIPPED_BIRCH_LOG, Blocks.PINK_WOOL},
         {Blocks.STRIPPED_BIRCH_LOG, Blocks.BLACK_WOOL},
         {Blocks.SMOOTH_QUARTZ, Blocks.LIGHT_BLUE_STAINED_GLASS},
         {Blocks.SPRUCE_PLANKS, Blocks.BOOKSHELF},
         {Blocks.DARK_OAK_PLANKS, Blocks.CAKE},
      };
      Block[] g = goods[f % goods.length];
      for (int i = i1 + 2; i <= i2 - 2; i += 3) {
         for (int j = j1 + 2; j <= j2 - 2; j += 3) {
            if (Math.abs(i - ci) < 6 && Math.abs(j - cj) < 5) {
               continue;
            }
            p.set(i, fy + 1, j, s(g[0]));
            p.set(i, fy + 2, j, s(g[1]));
         }
      }
   }

   // ------------------------------------------------------------------ school

   static void school(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(18, Math.min(size, 40));
      Plot p = new Plot(l, x, y, z);
      int depth = 8;
      int j2 = s - 1;
      int bj1 = j2 - depth + 1;
      int floors = 3;
      int fh = 4;
      int top = floors * fh;
      int ci = s / 2;
      p.clear(0, 1, 0, s - 1, top + 9, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRASS_BLOCK));

      // Sports ground with a running track, goals and the flagpole.
      p.fill(1, 0, 1, s - 2, 0, bj1 - 2, s(Blocks.COARSE_DIRT));
      p.ring(2, 0, 2, s - 3, bj1 - 3, s(Blocks.WHITE_CONCRETE));
      for (int gi : new int[]{2, s - 3}) {
         int gj = (2 + bj1 - 3) / 2;
         p.fill(gi, 1, gj - 1, gi, 2, gj - 1, s(Blocks.IRON_BARS));
         p.fill(gi, 1, gj + 1, gi, 2, gj + 1, s(Blocks.IRON_BARS));
         p.set(gi, 3, gj - 1, s(Blocks.IRON_BARS));
         p.set(gi, 3, gj, s(Blocks.IRON_BARS));
         p.set(gi, 3, gj + 1, s(Blocks.IRON_BARS));
      }
      // Fence, gate pillars with the school name and cherry trees along the street.
      for (int i = 0; i < s; i++) {
         if (Math.abs(i - ci) > 2) {
            p.fill(i, 1, 0, i, 2, 0, s(Blocks.IRON_BARS));
         }
      }
      for (int j = 0; j < s; j++) {
         p.fill(0, 1, j, 0, 2, j, s(Blocks.IRON_BARS));
         p.fill(s - 1, 1, j, s - 1, 2, j, s(Blocks.IRON_BARS));
      }
      p.fill(ci - 3, 1, 0, ci - 3, 3, 0, s(Blocks.STONE_BRICKS));
      p.fill(ci + 3, 1, 0, ci + 3, 3, 0, s(Blocks.STONE_BRICKS));
      p.sign(ci - 3, 2, -1, Blocks.SPRUCE_WALL_SIGN, Direction.NORTH,
            Component.empty(), Component.literal(StationBuilder.defaultName(x, z)), Component.translatable("citybuilder.sign.school"));
      for (int i = 3; i < s - 3; i += 6) {
         if (Math.abs(i - ci) > 4) {
            p.tree(i, 1, 1, Blocks.CHERRY_LOG, Blocks.CHERRY_LEAVES, 3);
         }
      }
      p.fill(1, 1, 3, 1, 10, 3, s(Blocks.IRON_BARS));
      p.set(2, 10, 3, s(Blocks.WHITE_WOOL));
      p.set(2, 9, 3, s(Blocks.RED_WOOL));

      // Three-storey school building with a corridor at the back and classrooms at the front.
      BlockState wall = s(Blocks.WHITE_CONCRETE);
      BlockState band = s(Blocks.LIGHT_GRAY_CONCRETE);
      for (int f = 0; f < floors; f++) {
         int fy = f * fh;
         p.fill(0, fy, bj1, s - 1, fy, j2, band);
         p.fill(1, fy, bj1 + 1, s - 2, fy, j2 - 1, s(Blocks.OAK_PLANKS));
         for (int h = fy + 1; h < fy + fh; h++) {
            for (int i = 0; i < s; i++) {
               boolean pier = i % 4 == 0 || i == s - 1;
               BlockState st = pier || h == fy + 1 ? wall : s(Blocks.GLASS_PANE);
               p.set(i, h, bj1, st);
               p.set(i, h, j2, pier || h != fy + 2 ? wall : s(Blocks.GLASS_PANE));
            }
            for (int j = bj1 + 1; j < j2; j++) {
               p.set(0, h, j, wall);
               p.set(s - 1, h, j, wall);
            }
         }
         // Classrooms: partitions, blackboards, desks; corridor along the back.
         int corridor = j2 - 2;
         for (int i = 1; i < s - 1; i++) {
            p.fill(i, fy + 1, corridor, i, fy + fh - 1, corridor, wall);
         }
         for (int i = 8; i < s - 1; i += 8) {
            p.fill(i, fy + 1, bj1 + 1, i, fy + fh - 1, corridor, wall);
         }
         for (int i = 4; i < s - 1; i += 8) {
            p.door(i, fy + 1, corridor, Blocks.BIRCH_DOOR, Direction.SOUTH);
            p.fill(i - 2, fy + 2, corridor - 1, i + 2, fy + 2, corridor - 1, s(Blocks.GREEN_TERRACOTTA));
         }
         for (int i = 2; i < s - 2; i++) {
            if (i % 8 == 0) {
               continue;
            }
            for (int j = bj1 + 2; j < corridor - 2; j += 2) {
               if (i % 2 == 0) {
                  p.set(i, fy + 1, j, stairsTop(Blocks.BIRCH_STAIRS, Direction.NORTH));
                  p.set(i, fy + 1, j + 1, stairs(Blocks.SPRUCE_STAIRS, Direction.SOUTH));
               }
            }
         }
         for (int i = 3; i < s - 2; i += 4) {
            p.set(i, fy + fh - 1, bj1 + 3, s(Blocks.SEA_LANTERN));
            p.set(i, fy + fh - 1, j2 - 1, s(Blocks.SEA_LANTERN));
         }
      }
      p.flatRoof(0, bj1, s - 1, j2, top, band, s(Blocks.IRON_BARS));
      // Clock tower over the entrance, with the stairwell inside.
      for (int h = 1; h <= top + 4; h++) {
         for (int i = ci - 2; i <= ci + 2; i++) {
            BlockState st = h > top && (i == ci - 2 || i == ci + 2) ? wall : (h > top ? wall : (i == ci - 2 || i == ci + 2 ? wall : s(Blocks.GLASS_PANE)));
            p.set(i, h, bj1 - 1, st);
         }
      }
      p.fill(ci - 2, top + 5, bj1 - 1, ci + 2, top + 5, bj1, band);
      p.set(ci, top + 2, bj1 - 2, s(Blocks.WHITE_CONCRETE));
      p.set(ci, top + 2, bj1 - 1, s(Blocks.WHITE_CONCRETE));
      p.set(ci - 1, top + 3, bj1 - 2, s(Blocks.BLACK_CONCRETE));
      p.set(ci, top + 3, bj1 - 2, s(Blocks.BLACK_CONCRETE));
      p.set(ci, top + 4, bj1 - 2, s(Blocks.BLACK_CONCRETE));
      p.set(ci + 1, top + 2, bj1 - 2, s(Blocks.BLACK_CONCRETE));
      p.clear(ci - 1, 1, bj1 - 1, ci + 1, 2, bj1);
      p.door(ci, 1, bj1 - 1, Blocks.BIRCH_DOOR, Direction.NORTH);
      p.fill(ci - 2, 4, bj1 - 3, ci + 2, 4, bj1 - 2, slab(Blocks.SMOOTH_STONE_SLAB));
      for (int f = 0; f <= floors; f++) {
         Facilities.elevatorShaftStop(l, x + ci - 1, y + f * fh, z + bj1 + 1, y + f * fh + (f < floors ? fh : 3));
      }
   }

   // ------------------------------------------------------------------ park

   static void park(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(10, Math.min(size, 48));
      Plot p = new Plot(l, x, y, z);
      int c = s / 2;
      p.clear(0, 1, 0, s - 1, 10, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRASS_BLOCK));
      // Clipped hedge with openings, cross paths of brick paving.
      for (int i = 0; i < s; i++) {
         for (int j = 0; j < s; j++) {
            boolean edge = i == 0 || j == 0 || i == s - 1 || j == s - 1;
            boolean path = Math.abs(i - c) <= 1 || Math.abs(j - c) <= 1;
            if (edge && !path) {
               p.set(i, 1, j, s(Blocks.AZALEA_LEAVES));
            }
            if (path) {
               p.set(i, 0, j, (i + j) % 2 == 0 ? s(Blocks.BRICKS) : s(Blocks.MUD_BRICKS));
            }
         }
      }
      // Fountain.
      int r = Math.max(2, Math.min(4, s / 6));
      for (int di = -r; di <= r; di++) {
         for (int dj = -r; dj <= r; dj++) {
            int d = di * di + dj * dj;
            if (d > r * r + r) {
               continue;
            }
            // A cell is rim if any orthogonal neighbour lies outside the disc, so water can never leak out.
            boolean rim = false;
            for (int[] n : new int[][]{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}) {
               int ni = di + n[0];
               int nj = dj + n[1];
               if (ni * ni + nj * nj > r * r + r) {
                  rim = true;
               }
            }
            p.set(c + di, 0, c + dj, s(Blocks.STONE_BRICKS));
            p.set(c + di, 1, c + dj, rim ? s(Blocks.POLISHED_ANDESITE) : s(Blocks.WATER));
         }
      }
      p.fill(c, 1, c, c, 2, c, s(Blocks.CHISELED_QUARTZ_BLOCK));
      p.set(c, 3, c, s(Blocks.SEA_LANTERN));
      // Cherry trees, benches and lamps along the paths.
      int q = Math.max(3, s / 4);
      for (int[] t : new int[][]{{q, q}, {s - 1 - q, q}, {q, s - 1 - q}, {s - 1 - q, s - 1 - q}}) {
         if (Math.abs(t[0] - c) > r + 2 && Math.abs(t[1] - c) > r + 2) {
            p.tree(t[0], 1, t[1], Blocks.CHERRY_LOG, Blocks.CHERRY_LEAVES, 4);
         }
      }
      for (int d = r + 3; d < s / 2 - 1; d += 4) {
         p.set(c - 2, 1, c - d, stairs(Blocks.SPRUCE_STAIRS, Direction.WEST));
         p.set(c + 2, 1, c + d, stairs(Blocks.SPRUCE_STAIRS, Direction.EAST));
         p.set(c - d, 1, c + 2, stairs(Blocks.SPRUCE_STAIRS, Direction.SOUTH));
         p.set(c + d, 1, c - 2, stairs(Blocks.SPRUCE_STAIRS, Direction.NORTH));
         lamp(p, c + 2, c - d);
         lamp(p, c - 2, c + d);
      }
      // Flower beds.
      Block[] flowers = {Blocks.RED_TULIP, Blocks.POPPY, Blocks.DANDELION, Blocks.CORNFLOWER, Blocks.OXEYE_DAISY, Blocks.ALLIUM, Blocks.PINK_TULIP};
      for (int i = 2; i < s - 2; i++) {
         for (int j = 2; j < s - 2; j++) {
            boolean path = Math.abs(i - c) <= 2 || Math.abs(j - c) <= 2;
            if (!path && p.get(i, 1, j).isAir() && Math.floorMod(i * 7 + j * 13, 9) == 0) {
               p.set(i, 1, j, s(flowers[Math.floorMod(i + j, flowers.length)]));
            }
         }
      }
      // Playground: slide, swing frame and a sandpit.
      if (s >= 18) {
         int pi = s - 6;
         int pj = 2;
         p.fill(pi, 0, pj, pi + 3, 0, pj + 3, s(Blocks.SAND));
         p.fill(pi, 1, pj, pi + 3, 2, pj + 3, air());
         int si = 3;
         int sj = 3;
         p.fill(si, 1, sj, si, 3, sj, s(Blocks.IRON_BARS));
         p.fill(si + 3, 1, sj, si + 3, 3, sj, s(Blocks.IRON_BARS));
         p.fill(si, 4, sj, si + 3, 4, sj, s(Blocks.IRON_BARS));
         p.fill(si + 1, 2, sj, si + 1, 3, sj, s(Blocks.CHAIN));
         p.fill(si + 2, 2, sj, si + 2, 3, sj, s(Blocks.CHAIN));
         p.set(si + 1, 1, sj, slabTop(Blocks.OAK_SLAB));
         p.set(si + 2, 1, sj, slabTop(Blocks.OAK_SLAB));
         int li = 3;
         int lj = s - 6;
         p.fill(li, 1, lj, li, 2, lj, s(Blocks.LADDER).setValue(net.minecraft.world.level.block.LadderBlock.FACING, Direction.NORTH));
         p.fill(li, 1, lj + 1, li, 2, lj + 1, s(Blocks.YELLOW_CONCRETE));
         p.set(li, 3, lj + 1, slab(Blocks.SMOOTH_QUARTZ_SLAB));
         p.set(li, 2, lj + 2, stairs(Blocks.QUARTZ_STAIRS, Direction.NORTH));
         p.set(li, 1, lj + 3, stairs(Blocks.QUARTZ_STAIRS, Direction.NORTH));
      }
   }

   private static void lamp(Plot p, int i, int j) {
      p.fill(i, 1, j, i, 3, j, s(Blocks.DARK_OAK_FENCE));
      p.set(i, 4, j, s(Blocks.LANTERN));
   }
}

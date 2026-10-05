package com.example.citybuilder.builders;

import static com.example.citybuilder.builders.Plot.air;
import static com.example.citybuilder.builders.Plot.awning;
import static com.example.citybuilder.builders.Plot.log;
import static com.example.citybuilder.builders.Plot.panel;
import static com.example.citybuilder.builders.Plot.s;
import static com.example.citybuilder.builders.Plot.slab;
import static com.example.citybuilder.builders.Plot.slabTop;
import static com.example.citybuilder.builders.Plot.stairs;
import static com.example.citybuilder.builders.Plot.stairsTop;

import com.example.citybuilder.engine.BlockCanvas;
import java.util.Random;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;

/** Everyday town buildings: shops, offices, sheds and homes. Every plot faces north (street at j = 0). */
final class TownBuildings {
   private TownBuildings() {
   }

   /** Pair of iron doors that open automatically from pressure plates on both sides. */
   static void autoDoors(Plot p, int i, int h, int j) {
      p.clear(i, h, j, i + 1, h + 1, j);
      p.set(i, h, j, s(Blocks.IRON_DOOR).setValue(DoorBlock.FACING, Direction.SOUTH).setValue(DoorBlock.HINGE, DoorHingeSide.RIGHT));
      p.set(i + 1, h, j, s(Blocks.IRON_DOOR).setValue(DoorBlock.FACING, Direction.SOUTH).setValue(DoorBlock.HINGE, DoorHingeSide.LEFT));
      for (int di = 0; di <= 1; di++) {
         p.set(i + di, h, j - 1, s(Blocks.LIGHT_WEIGHTED_PRESSURE_PLATE));
         p.set(i + di, h, j + 1, s(Blocks.LIGHT_WEIGHTED_PRESSURE_PLATE));
      }
   }

   /** A table (fence and pressure plate) with chairs on two sides. */
   static void table(Plot p, int i, int h, int j, Block fence, Block plate, Block chair) {
      p.set(i, h, j, s(fence));
      p.set(i, h + 1, j, s(plate));
      p.set(i - 1, h, j, stairs(chair, Direction.WEST));
      p.set(i + 1, h, j, stairs(chair, Direction.EAST));
   }

   // ------------------------------------------------------------------ cafe

   static void cafe(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(9, Math.min(size, 20));
      Plot p = new Plot(l, x, y, z);
      int i1 = 1;
      int i2 = s - 2;
      int j1 = 3;
      int j2 = s - 2;
      int mid = (i1 + i2) / 2;
      p.clear(0, 1, 0, s - 1, 13, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRASS_BLOCK));
      // Paved terrace in front.
      p.fill(0, 0, 0, s - 1, 0, j1 - 1, s(Blocks.SMOOTH_STONE));
      p.fill(i1, 0, j1, i2, 0, j2, s(Blocks.SPRUCE_PLANKS));

      BlockState brick = s(Blocks.BRICKS);
      BlockState trim = s(Blocks.SMOOTH_QUARTZ);
      // Ground floor: brick piers and a glazed shop front.
      p.walls(i1, 1, j1, i2, 4, j2, brick);
      for (int i = i1 + 1; i < i2; i++) {
         p.fill(i, 1, j1, i, 3, j1, i == mid ? air() : s(Blocks.GLASS_PANE));
         p.set(i, 4, j1, s(Blocks.DARK_OAK_PLANKS));
      }
      for (int j = j1 + 2; j < j2 - 1; j += 2) {
         p.fill(i1, 2, j, i1, 3, j, s(Blocks.GLASS_PANE));
         p.fill(i2, 2, j, i2, 3, j, s(Blocks.GLASS_PANE));
      }
      p.door(mid, 1, j1, Blocks.DARK_OAK_DOOR, Direction.NORTH);
      // Striped awning and the shop sign.
      for (int i = i1; i <= i2; i++) {
         p.set(i, 4, j1 - 1, awning((i - i1) % 2 == 0 ? Blocks.MANGROVE_TRAPDOOR : Blocks.BIRCH_TRAPDOOR));
      }
      p.set(mid, 5, j1, s(Blocks.DARK_OAK_PLANKS));
      p.sign(mid, 5, j1 - 1, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH,
            Component.empty(), Component.literal("☕ CAFE"), Component.translatable("citybuilder.sign.cafe"));

      // Upper floor: apartment with flower boxes.
      p.fill(i1, 5, j1, i2, 5, j2, trim);
      p.walls(i1, 6, j1, i2, 8, j2, brick);
      for (int i = i1 + 1; i < i2; i++) {
         if ((i - i1) % 3 != 0) {
            p.fill(i, 6, j1, i, 7, j1, s(Blocks.GLASS_PANE));
            p.set(i, 6, j1 - 1, awning(Blocks.SPRUCE_TRAPDOOR));
            p.set(i, 7, j1 - 1, (i % 2 == 0) ? s(Blocks.POTTED_RED_TULIP) : s(Blocks.POTTED_POPPY));
            p.fill(i, 6, j2, i, 7, j2, s(Blocks.GLASS_PANE));
         }
      }
      for (int j = j1 + 2; j < j2 - 1; j += 2) {
         p.fill(i1, 6, j, i1, 7, j, s(Blocks.GLASS_PANE));
         p.fill(i2, 6, j, i2, 7, j, s(Blocks.GLASS_PANE));
      }
      p.flatRoof(i1, j1, i2, j2, 9, s(Blocks.SMOOTH_STONE), s(Blocks.BRICK_WALL));
      p.ring(i1, 9, j1, i2, j2, trim);
      p.fill(i2 - 1, 10, j2 - 1, i2 - 1, 12, j2 - 1, brick);
      p.set(i2 - 1, 13, j2 - 1, s(Blocks.CAMPFIRE).setValue(net.minecraft.world.level.block.CampfireBlock.LIT, false));

      // Counter, coffee machine, cakes and tables inside.
      int cj = j2 - 2;
      for (int i = i1 + 1; i < i2 - 2; i++) {
         p.set(i, 1, cj, stairsTop(Blocks.DARK_OAK_STAIRS, Direction.NORTH));
      }
      p.set(i1 + 1, 2, cj, s(Blocks.BREWING_STAND));
      p.set(i1 + 2, 2, cj, s(Blocks.CAKE));
      p.set(i1 + 3, 2, cj, s(Blocks.FLOWER_POT));
      p.set(i1 + 1, 1, j2 - 1, s(Blocks.SMOKER).setValue(net.minecraft.world.level.block.AbstractFurnaceBlock.FACING, Direction.NORTH));
      p.set(i1 + 2, 1, j2 - 1, s(Blocks.BARREL));
      for (int i = i1 + 2; i < i2 - 1; i += 4) {
         table(p, i, 1, j1 + 2, Blocks.DARK_OAK_FENCE, Blocks.DARK_OAK_PRESSURE_PLATE, Blocks.SPRUCE_STAIRS);
      }
      p.hangingLantern(mid - 1, 4, j1 + 2);
      p.hangingLantern(mid + 2, 4, cj - 1);
      // Stairs up to the flat.
      p.flight(i2 - 1, 1, j1 + 1, Direction.SOUTH, 4, Blocks.SPRUCE_STAIRS);
      p.bed(i1 + 1, 6, j2 - 2, Blocks.LIGHT_BLUE_BED, Direction.SOUTH);
      p.set(i1 + 1, 6, j1 + 1, s(Blocks.BOOKSHELF));
      p.hangingLantern(mid, 8, (j1 + j2) / 2);

      // Terrace tables with parasols.
      for (int i = 2; i <= s - 3; i += 5) {
         p.set(i, 1, 1, s(Blocks.SPRUCE_FENCE));
         p.set(i, 2, 1, s(Blocks.SPRUCE_FENCE));
         p.set(i, 3, 1, s(Blocks.WHITE_WOOL));
         p.set(i - 1, 3, 1, slab(Blocks.BIRCH_SLAB));
         p.set(i + 1, 3, 1, slab(Blocks.BIRCH_SLAB));
         p.set(i, 3, 0, slab(Blocks.MANGROVE_SLAB));
         p.set(i, 3, 2, slab(Blocks.MANGROVE_SLAB));
         p.set(i, 2, 1, s(Blocks.SPRUCE_FENCE));
         p.set(i - 1, 1, 1, stairs(Blocks.SPRUCE_STAIRS, Direction.WEST));
         p.set(i + 1, 1, 1, stairs(Blocks.SPRUCE_STAIRS, Direction.EAST));
      }
   }

   // ------------------------------------------------------------------ konbini

   private record Brand(String name, Block band1, Block band2, Block band3) {
   }

   private static final Brand[] BRANDS = {
      new Brand("CITY MART", Blocks.ORANGE_CONCRETE, Blocks.GREEN_CONCRETE, Blocks.RED_CONCRETE),
      new Brand("FAMILY SHOP", Blocks.BLUE_CONCRETE, Blocks.WHITE_CONCRETE, Blocks.LIME_CONCRETE),
      new Brand("LAWNSON", Blocks.LIGHT_BLUE_CONCRETE, Blocks.WHITE_CONCRETE, Blocks.LIGHT_BLUE_CONCRETE),
   };

   static void konbini(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(10, Math.min(size, 22));
      Plot p = new Plot(l, x, y, z);
      Brand brand = BRANDS[Math.floorMod(x * 7 + z * 13, BRANDS.length)];
      int i1 = 1;
      int i2 = s - 2;
      int j1 = Math.min(5, s / 3);
      int j2 = s - 2;
      int mid = (i1 + i2) / 2;
      p.clear(0, 1, 0, s - 1, 9, s - 1);

      // Car park with bays.
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRAY_CONCRETE));
      for (int i = 0; i < s; i += 3) {
         for (int j = 0; j < j1 - 1; j++) {
            p.set(i, 0, j, s(Blocks.WHITE_CONCRETE));
         }
         if (i + 1 < s) {
            p.set(i + 1, 1, j1 - 2, slab(Blocks.STONE_SLAB));
         }
      }
      p.fill(i1, 0, j1 - 1, i2, 0, j1 - 1, s(Blocks.SMOOTH_STONE));

      // Shell: white box with a full glass front and the brand stripes.
      p.fill(i1, 0, j1, i2, 0, j2, s(Blocks.WHITE_CONCRETE));
      p.walls(i1, 1, j1, i2, 4, j2, s(Blocks.WHITE_CONCRETE));
      for (int i = i1 + 1; i < i2; i++) {
         p.fill(i, 1, j1, i, 3, j1, s(Blocks.GLASS));
      }
      for (int j = j1 + 1; j < j1 + 4 && j < j2; j++) {
         p.fill(i1, 1, j, i1, 3, j, s(Blocks.GLASS));
      }
      for (int i = i1; i <= i2; i++) {
         p.set(i, 4, j1, s(brand.band1));
         p.set(i, 5, j1, s(brand.band2));
         p.set(i, 6, j1, s(brand.band3));
      }
      for (int j = j1; j <= j2; j++) {
         p.set(i1, 4, j, s(brand.band1));
         p.set(i2, 4, j, s(brand.band1));
      }
      p.fill(i1, 5, j1 + 1, i2, 5, j2, s(Blocks.WHITE_CONCRETE));
      p.ring(i1, 6, j1, i2, j2, s(Blocks.WHITE_CONCRETE));
      for (int i = i1; i <= i2; i++) {
         p.set(i, 6, j1, s(brand.band3));
      }
      p.sign(mid, 5, j1 - 1, Blocks.BIRCH_WALL_SIGN, Direction.NORTH,
            Component.literal(brand.name), Component.translatable("citybuilder.sign.konbini"), Component.literal("OPEN 24h"));
      autoDoors(p, mid, 1, j1);

      // Rooftop air-conditioning units.
      for (int i = i1 + 2; i < i2 - 1; i += 4) {
         p.fill(i, 6, j2 - 2, i + 1, 6, j2 - 2, s(Blocks.LIGHT_GRAY_CONCRETE));
         p.set(i, 7, j2 - 2, panel(Blocks.IRON_TRAPDOOR, Direction.NORTH));
      }

      // Inside: ceiling lights, shelves of goods, drinks fridges, counter and ATM.
      for (int i = i1 + 2; i < i2 - 1; i += 3) {
         for (int j = j1 + 2; j < j2; j += 3) {
            p.set(i, 5, j, s(Blocks.SEA_LANTERN));
         }
      }
      Block[] goods = {Blocks.RED_WOOL, Blocks.YELLOW_WOOL, Blocks.LIGHT_BLUE_WOOL, Blocks.LIME_WOOL, Blocks.ORANGE_WOOL, Blocks.PINK_WOOL};
      for (int i = i1 + 2; i <= i2 - 2; i += 3) {
         for (int j = j1 + 4; j <= j2 - 3; j++) {
            p.set(i, 1, j, s(Blocks.WHITE_CONCRETE));
            p.set(i, 2, j, s(goods[Math.floorMod(i + j, goods.length)]));
         }
      }
      for (int i = i1 + 1; i < i2; i++) {
         p.set(i, 1, j2 - 1, s(Blocks.LIGHT_BLUE_STAINED_GLASS));
         p.set(i, 2, j2 - 1, s(Blocks.LIGHT_BLUE_STAINED_GLASS));
         p.set(i, 3, j2 - 1, s(Blocks.SEA_LANTERN));
      }
      int ci = i2 - 1;
      for (int j = j1 + 1; j <= j1 + 3; j++) {
         p.set(ci - 1, 1, j, s(Blocks.SMOOTH_QUARTZ));
         p.set(ci - 1, 2, j, slab(Blocks.SMOOTH_STONE_SLAB));
      }
      p.set(ci - 1, 2, j1 + 2, s(Blocks.LIGHT_GRAY_STAINED_GLASS_PANE));
      p.set(i1 + 1, 1, j2 - 2, s(Blocks.IRON_BLOCK));
      p.set(i1 + 1, 2, j2 - 2, s(Blocks.BLACK_STAINED_GLASS));

      // Bins and a pole sign by the road.
      p.set(i1, 1, j1 - 1, s(Blocks.COMPOSTER));
      p.set(i1 + 1, 1, j1 - 1, s(Blocks.CAULDRON));
      p.fill(s - 1, 1, 0, s - 1, 5, 0, s(Blocks.IRON_BARS));
      p.set(s - 1, 6, 0, s(brand.band1));
      p.set(s - 1, 7, 0, s(brand.band2));
      p.set(s - 1, 8, 0, s(brand.band3));
   }

   // ------------------------------------------------------------------ koban (police box)

   static void koban(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(8, Math.min(size, 12));
      Plot p = new Plot(l, x, y, z);
      int i1 = 1;
      int i2 = s - 2;
      int j1 = 2;
      int j2 = s - 2;
      int mid = (i1 + i2) / 2;
      p.clear(0, 1, 0, s - 1, 10, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.SMOOTH_STONE));
      p.fill(i1, 0, j1, i2, 0, j2, s(Blocks.POLISHED_ANDESITE));

      p.walls(i1, 1, j1, i2, 4, j2, s(Blocks.WHITE_CONCRETE));
      p.ring(i1, 1, j1, i2, j2, s(Blocks.GRAY_CONCRETE));
      for (int i = i1 + 1; i < i2; i++) {
         if (i != mid) {
            p.fill(i, 2, j1, i, 3, j1, s(Blocks.GLASS_PANE));
         }
      }
      for (int j = j1 + 1; j < j2; j++) {
         p.fill(i1, 2, j, i1, 3, j, s(Blocks.GLASS_PANE));
      }
      p.door(mid, 1, j1, Blocks.IRON_DOOR, Direction.NORTH);
      p.set(mid, 1, j1 - 1, s(Blocks.STONE_PRESSURE_PLATE));
      p.set(mid, 1, j1 + 1, s(Blocks.STONE_PRESSURE_PLATE));
      p.fill(i1, 5, j1, i2, 5, j2, s(Blocks.GRAY_CONCRETE));
      // Pitched roof and the canopy over the entrance.
      p.gable(i1, j1, i2, j2, 6, false, Blocks.POLISHED_DEEPSLATE_STAIRS, s(Blocks.WHITE_CONCRETE), slab(Blocks.POLISHED_DEEPSLATE_SLAB), 1);
      for (int i = i1; i <= i2; i++) {
         p.set(i, 5, j1 - 1, slab(Blocks.POLISHED_DEEPSLATE_SLAB));
      }
      // The red lamp, the emblem and the sign.
      p.set(mid, 4, j1 - 1, s(Blocks.REDSTONE_LAMP));
      p.set(mid, 5, j1 - 1, s(Blocks.RED_STAINED_GLASS));
      p.set(mid - 1, 4, j1, s(Blocks.GOLD_BLOCK));
      p.sign(mid + 1, 4, j1 - 1, Blocks.BIRCH_WALL_SIGN, Direction.NORTH,
            Component.empty(), Component.translatable("citybuilder.sign.koban"), Component.literal("KOBAN"));
      // Desk, chair, map board and a bicycle stand outside.
      p.fill(i1 + 1, 1, j2 - 2, i2 - 1, 1, j2 - 2, stairsTop(Blocks.SPRUCE_STAIRS, Direction.SOUTH));
      p.set(mid, 1, j2 - 1, stairs(Blocks.SPRUCE_STAIRS, Direction.SOUTH));
      p.set(i2 - 1, 1, j1 + 1, s(Blocks.CARTOGRAPHY_TABLE));
      p.set(i2 - 1, 2, j2 - 1, s(Blocks.CHEST));
      p.set(mid, 4, (j1 + j2) / 2, s(Blocks.SEA_LANTERN));
      p.set(i1 - 1 < 0 ? 0 : i1 - 1, 1, j1 + 1, s(Blocks.IRON_BARS));
   }

   // ------------------------------------------------------------------ zakkyo (multi-tenant building)

   static void zakkyo(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(8, Math.min(size, 18));
      Random rng = new Random((long) x * 2654435761L ^ (long) z * 1234567891L ^ (long) size * 9876543211L);
      Plot p = new Plot(l, x, y, z);
      int floors = 4 + rng.nextInt(5);
      int fh = 4;
      int i1 = 0;
      int i2 = s - 1;
      int j1 = 2;
      int j2 = s - 1;
      int top = floors * fh;
      p.clear(0, 1, 0, s - 1, top + 8, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.SMOOTH_STONE));

      Block[][] palettes = {
         {Blocks.LIGHT_GRAY_CONCRETE, Blocks.GRAY_CONCRETE},
         {Blocks.WHITE_TERRACOTTA, Blocks.BROWN_TERRACOTTA},
         {Blocks.SMOOTH_SANDSTONE, Blocks.CUT_SANDSTONE},
         {Blocks.STONE_BRICKS, Blocks.POLISHED_ANDESITE},
         {Blocks.QUARTZ_BRICKS, Blocks.POLISHED_DIORITE},
      };
      Block[] pal = palettes[rng.nextInt(palettes.length)];
      BlockState wall = s(pal[0]);
      BlockState band = s(pal[1]);
      Block glassBlock = rng.nextBoolean() ? Blocks.GLASS_PANE : Blocks.GRAY_STAINED_GLASS_PANE;
      Block[] neon = {Blocks.RED_CONCRETE, Blocks.YELLOW_CONCRETE, Blocks.MAGENTA_CONCRETE, Blocks.LIME_CONCRETE,
         Blocks.LIGHT_BLUE_CONCRETE, Blocks.ORANGE_CONCRETE, Blocks.PINK_CONCRETE, Blocks.CYAN_CONCRETE};

      for (int f = 0; f < floors; f++) {
         int fy = f * fh;
         p.fill(i1, fy, j1, i2, fy, j2, band);
         p.walls(i1, fy + 1, j1, i2, fy + fh - 1, j2, wall);
         // Front windows: the ground floor is a shop front, upper floors have ribbon windows.
         for (int i = i1 + 1; i < i2; i++) {
            if (f == 0) {
               p.fill(i, 1, j1, i, 3, j1, s(Blocks.GLASS_PANE));
            } else {
               p.fill(i, fy + 1, j1, i, fy + 2, j1, s(glassBlock));
            }
            p.fill(i, fy + 2, j2, i, fy + 2, j2, (i - i1) % 3 == 0 ? wall : s(glassBlock));
         }
         for (int j = j1 + 2; j < j2; j += 3) {
            p.set(i1, fy + 2, j, s(glassBlock));
            p.set(i2, fy + 2, j, s(glassBlock));
         }
         if (f > 0) {
            // A coloured fascia strip naming the tenant.
            for (int i = i1; i <= i2; i++) {
               p.set(i, fy + fh - 1, j1, s(neon[(f * 3) % neon.length]));
            }
            // Air-conditioner unit hanging on the side wall.
            p.set(i2 + (i2 + 1 < s ? 0 : 0), fy + 1, j2 - 1, wall);
         }
         zakkyoTenant(p, rng.nextInt(5), f, i1, fy, j1, i2, j2, fh);
         p.hangingLantern((i1 + i2) / 2, fy + fh - 1, (j1 + j2) / 2);
      }
      p.door((i1 + i2) / 2, 1, j1, Blocks.DARK_OAK_DOOR, Direction.NORTH);
      for (int i = i1; i <= i2; i++) {
         p.set(i, 4, j1 - 1, awning(Blocks.DARK_OAK_TRAPDOOR));
      }

      // Vertical sign tower (tate-kanban) on the corner of the facade.
      int si = i2;
      for (int h = 5; h < top; h++) {
         int f = h / fh;
         p.set(si, h, j1 - 1, (h % fh == 0) ? s(Blocks.BLACK_CONCRETE) : s(neon[(f * 3) % neon.length]));
         p.set(si, h, j1 - 2, (h % fh == 0) ? s(Blocks.BLACK_CONCRETE) : s(Blocks.OCHRE_FROGLIGHT));
      }

      // Roof: parapet, water tank and a billboard.
      p.flatRoof(i1, j1, i2, j2, top, band, s(Blocks.IRON_BARS));
      p.fill(i1 + 1, top + 1, j2 - 3, i1 + 3, top + 3, j2 - 1, s(Blocks.LIGHT_GRAY_CONCRETE));
      p.fill(i1 + 1, top + 4, j2 - 3, i1 + 3, top + 4, j2 - 1, slab(Blocks.SMOOTH_STONE_SLAB));
      for (int i = i1 + 1; i <= i2 - 1; i++) {
         p.set(i, top + 2, j1 + 1, s(Blocks.IRON_BARS));
         p.fill(i, top + 3, j1 + 1, i, top + 5, j1 + 1, s(neon[(i + 1) % neon.length]));
      }

      // Elevator through every floor in the back corner.
      for (int f = 0; f < floors; f++) {
         Facilities.elevatorShaftStop(l, x + i2 - 1, y + f * fh, z + j2 - 1, y + f * fh + fh);
      }
      Facilities.elevatorShaftStop(l, x + i2 - 1, y + top, z + j2 - 1, y + top + 3);
   }

   private static void zakkyoTenant(Plot p, int kind, int f, int i1, int fy, int j1, int i2, int j2, int fh) {
      int ci = (i1 + i2) / 2;
      int floor = fy;
      switch (f == 0 ? 0 : kind) {
         case 0 -> {
            // Izakaya: counter, red lanterns, barrels of sake.
            p.fill(i1 + 1, floor, j1 + 1, i2 - 1, floor, j2 - 1, s(Blocks.SPRUCE_PLANKS));
            for (int i = i1 + 1; i < i2 - 1; i++) {
               p.set(i, floor + 1, j2 - 3, stairsTop(Blocks.DARK_OAK_STAIRS, Direction.NORTH));
            }
            for (int i = i1 + 1; i < i2 - 1; i += 2) {
               p.set(i, floor + 1, j2 - 1, s(Blocks.BARREL));
               p.set(i, fy + fh - 1, j1 + 1, s(Blocks.CHAIN));
               p.set(i, fy + fh - 2, j1 + 1, s(Blocks.RED_WOOL));
            }
         }
         case 1 -> {
            // Office: grey carpet, desks with monitors.
            p.fill(i1 + 1, floor, j1 + 1, i2 - 1, floor, j2 - 1, s(Blocks.GRAY_WOOL));
            for (int i = i1 + 2; i < i2 - 1; i += 3) {
               for (int j = j1 + 2; j < j2 - 1; j += 3) {
                  p.set(i, floor + 1, j, stairsTop(Blocks.BIRCH_STAIRS, Direction.SOUTH));
                  p.set(i, floor + 2, j, s(Blocks.BLACK_STAINED_GLASS_PANE));
                  p.set(i, floor + 1, j + 1, stairs(Blocks.SPRUCE_STAIRS, Direction.SOUTH));
               }
            }
         }
         case 2 -> {
            // Karaoke: purple rooms with neon ceilings.
            p.fill(i1 + 1, floor, j1 + 1, i2 - 1, floor, j2 - 1, s(Blocks.PURPLE_WOOL));
            p.fill(ci, floor + 1, j1 + 2, ci, fy + fh - 1, j2 - 1, s(Blocks.PURPLE_TERRACOTTA));
            p.set(ci, floor + 1, j1 + 2, air());
            p.set(ci, floor + 2, j1 + 2, air());
            p.set(i1 + 1, fy + fh - 1, j2 - 2, s(Blocks.PEARLESCENT_FROGLIGHT));
            p.set(i2 - 1, fy + fh - 1, j2 - 2, s(Blocks.VERDANT_FROGLIGHT));
            p.set(i1 + 1, floor + 1, j2 - 1, s(Blocks.JUKEBOX));
         }
         case 3 -> {
            // Hair salon: chairs facing mirrors.
            p.fill(i1 + 1, floor, j1 + 1, i2 - 1, floor, j2 - 1, s(Blocks.WHITE_CONCRETE));
            for (int i = i1 + 1; i < i2; i += 2) {
               p.set(i, floor + 1, j2 - 2, stairs(Blocks.QUARTZ_STAIRS, Direction.SOUTH));
               p.set(i, floor + 2, j2 - 1, s(Blocks.LIGHT_BLUE_STAINED_GLASS_PANE));
            }
         }
         default -> {
            // Ramen shop: counter and stools.
            p.fill(i1 + 1, floor, j1 + 1, i2 - 1, floor, j2 - 1, s(Blocks.RED_TERRACOTTA));
            for (int i = i1 + 1; i < i2 - 1; i++) {
               p.set(i, floor + 1, j2 - 2, s(Blocks.SPRUCE_PLANKS));
               if (i % 2 == 0) {
                  p.set(i, floor + 1, j2 - 3, s(Blocks.OAK_FENCE));
               }
            }
            p.set(i1 + 1, floor + 1, j2 - 1, s(Blocks.SMOKER));
            p.set(i1 + 2, floor + 1, j2 - 1, s(Blocks.CAULDRON));
         }
      }
   }

   // ------------------------------------------------------------------ warehouse

   static void warehouse(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(10, Math.min(size, 36));
      Plot p = new Plot(l, x, y, z);
      int i1 = 0;
      int i2 = s - 1;
      int j1 = 3;
      int j2 = s - 1;
      int h = 7;
      p.clear(0, 1, 0, s - 1, h + 3, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRAY_CONCRETE));
      // Loading dock.
      p.fill(i1, 0, j1 - 2, i2, 1, j1 - 1, s(Blocks.SMOOTH_STONE));
      for (int i = i1; i <= i2; i += 4) {
         p.set(i, 2, j1 - 2, s(Blocks.YELLOW_CONCRETE));
      }

      p.fill(i1, 0, j1, i2, 1, j2, s(Blocks.SMOOTH_STONE));
      // Ribbed metal cladding on a steel frame.
      for (int hh = 2; hh <= h; hh++) {
         for (int i = i1; i <= i2; i++) {
            BlockState st = i == i1 || i == i2 || (i - i1) % 6 == 0 ? s(Blocks.POLISHED_DEEPSLATE)
                  : (i % 2 == 0 ? s(Blocks.LIGHT_GRAY_CONCRETE) : s(Blocks.SMOOTH_STONE));
            p.set(i, hh, j1, st);
            p.set(i, hh, j2, st);
         }
         for (int j = j1 + 1; j < j2; j++) {
            BlockState st = (j - j1) % 6 == 0 ? s(Blocks.POLISHED_DEEPSLATE) : (j % 2 == 0 ? s(Blocks.LIGHT_GRAY_CONCRETE) : s(Blocks.SMOOTH_STONE));
            p.set(i1, hh, j, st);
            p.set(i2, hh, j, st);
         }
      }
      // High clerestory windows along the sides.
      for (int j = j1 + 2; j < j2 - 1; j++) {
         if ((j - j1) % 6 != 0) {
            p.set(i1, h - 1, j, s(Blocks.GLASS_PANE));
            p.set(i2, h - 1, j, s(Blocks.GLASS_PANE));
         }
      }
      // Low-pitched roof of slabs with skylight strips.
      int span = i2 - i1;
      for (int i = i1 - 1; i <= i2 + 1; i++) {
         int rise = Math.min(i - (i1 - 1), (i2 + 1) - i) / 3;
         for (int j = j1 - 1; j <= j2 + 1; j++) {
            boolean skylight = j > j1 + 1 && j < j2 - 1 && (j - j1) % 5 == 0 && i > i1 + 1 && i < i2 - 1;
            p.set(i, h + 1 + rise / 2, j, skylight ? s(Blocks.GLASS) : (rise % 2 == 0 ? slab(Blocks.SMOOTH_STONE_SLAB) : slabTop(Blocks.SMOOTH_STONE_SLAB)));
         }
      }
      p.fill(i1 + 1, h + 1, j1 + 1, i2 - 1, h + 1, j2 - 1, air());
      p.ring(i1, h + 1, j1, i2, j2, s(Blocks.POLISHED_DEEPSLATE));
      p.fill(i1, h + 1, j1, i2, h + 1, j2, s(Blocks.SMOOTH_STONE_SLAB).setValue(net.minecraft.world.level.block.SlabBlock.TYPE,
            net.minecraft.world.level.block.state.properties.SlabType.TOP));
      for (int i = i1 + 2; i < i2 - 1; i += 4) {
         for (int j = j1 + 2; j < j2 - 1; j += 4) {
            p.set(i, h + 1, j, s(Blocks.SEA_LANTERN));
         }
      }

      // Roller shutters and a side door.
      int shutters = Math.max(1, (i2 - i1 - 2) / 6);
      for (int k = 0; k < shutters; k++) {
         int a = i1 + 2 + k * 6;
         for (int i = a; i < a + 4 && i < i2 - 1; i++) {
            for (int hh = 2; hh <= 5; hh++) {
               p.set(i, hh, j1, air());
               p.set(i, hh, j1 - 0, panel(Blocks.IRON_TRAPDOOR, Direction.NORTH));
            }
            p.set(i, 6, j1, s(Blocks.YELLOW_CONCRETE));
         }
         p.clear(a + 1, 2, j1, a + 2, 3, j1);
      }
      p.door(i2 - 2, 2, j1, Blocks.IRON_DOOR, Direction.NORTH);
      p.set(i2 - 2, 2, j1 - 1, s(Blocks.STONE_PRESSURE_PLATE));
      p.set(i2 - 2, 2, j1 + 1, s(Blocks.STONE_PRESSURE_PLATE));
      p.sign(i2 - 3, 5, j1 - 1, Blocks.SPRUCE_WALL_SIGN, Direction.NORTH,
            Component.literal("CITY LOGISTICS"), Component.translatable("citybuilder.sign.warehouse"));

      // Racks of crates and a forklift inside.
      for (int i = i1 + 2; i < i2 - 1; i += 4) {
         for (int j = j1 + 4; j < j2 - 1; j++) {
            p.set(i, 2, j, s(Blocks.BARREL));
            p.set(i, 3, j, slab(Blocks.SPRUCE_SLAB));
            p.set(i, 4, j, (j % 3 == 0) ? s(Blocks.CHEST) : s(Blocks.BARREL));
            p.set(i, 5, j, slab(Blocks.SPRUCE_SLAB));
            p.set(i + 1, 2, j, s(Blocks.SPRUCE_FENCE));
         }
      }
      p.set(i2 - 2, 2, j1 + 3, s(Blocks.YELLOW_CONCRETE));
      p.set(i2 - 2, 3, j1 + 3, s(Blocks.IRON_BARS));
      p.set(i2 - 2, 2, j1 + 2, s(Blocks.IRON_TRAPDOOR));
   }

   // ------------------------------------------------------------------ farm

   static void farm(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(10, Math.min(size, 48));
      Plot p = new Plot(l, x, y, z);
      p.clear(0, 1, 0, s - 1, 10, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRASS_BLOCK));
      int mid = s / 2;
      // Fence round the plot with a gate on the road side.
      for (int i = 0; i < s; i++) {
         if (i != mid) {
            p.set(i, 1, 0, s(Blocks.OAK_FENCE));
         }
         p.set(i, 1, s - 1, s(Blocks.OAK_FENCE));
      }
      for (int j = 0; j < s; j++) {
         p.set(0, 1, j, s(Blocks.OAK_FENCE));
         p.set(s - 1, 1, j, s(Blocks.OAK_FENCE));
      }
      p.set(mid, 1, 0, s(Blocks.OAK_FENCE_GATE).setValue(net.minecraft.world.level.block.FenceGateBlock.FACING, Direction.NORTH));
      for (int j = 0; j < s - 1; j++) {
         p.set(mid, 0, j, s(Blocks.DIRT_PATH));
      }

      // Barn in the back corner.
      boolean barn = s >= 14;
      int bi1 = s - 8;
      int bj1 = s - 8;
      if (barn) {
         p.fill(bi1, 0, bj1, s - 2, 0, s - 2, s(Blocks.SPRUCE_PLANKS));
         p.walls(bi1, 1, bj1, s - 2, 4, s - 2, s(Blocks.RED_TERRACOTTA));
         for (int[] c : new int[][]{{bi1, bj1}, {s - 2, bj1}, {bi1, s - 2}, {s - 2, s - 2}}) {
            p.fill(c[0], 1, c[1], c[0], 4, c[1], log(Blocks.STRIPPED_SPRUCE_LOG, Direction.Axis.Y));
         }
         p.gable(bi1, bj1, s - 2, s - 2, 5, false, Blocks.DARK_OAK_STAIRS, s(Blocks.RED_TERRACOTTA), slab(Blocks.DARK_OAK_SLAB), 1);
         int bm = (bi1 + s - 2) / 2;
         p.clear(bm - 1, 1, bj1, bm + 1, 3, bj1);
         for (int i = bm - 1; i <= bm + 1; i++) {
            p.set(i, 4, bj1, s(Blocks.WHITE_TERRACOTTA));
         }
         p.set(bi1 + 1, 1, s - 3, s(Blocks.HAY_BLOCK));
         p.set(bi1 + 1, 2, s - 3, s(Blocks.HAY_BLOCK));
         p.set(bi1 + 2, 1, s - 3, s(Blocks.HAY_BLOCK));
         p.set(s - 3, 1, s - 3, s(Blocks.COMPOSTER));
         p.hangingLantern(bm, 4, s - 4);
      }

      // Fields with irrigation channels and a scarecrow.
      for (int i = 1; i < s - 1; i++) {
         for (int j = 2; j < s - 1; j++) {
            if (i == mid || barn && i >= bi1 - 1 && j >= bj1 - 1) {
               continue;
            }
            if ((j - 2) % 5 == 4) {
               p.set(i, 0, j, s(Blocks.WATER));
               continue;
            }
            int bed = (i < mid ? 0 : 1) + ((j - 2) / 5) * 2;
            CropBlock crop = (CropBlock) switch (Math.floorMod(bed, 4)) {
               case 0 -> Blocks.WHEAT;
               case 1 -> Blocks.CARROTS;
               case 2 -> Blocks.POTATOES;
               default -> Blocks.BEETROOTS;
            };
            p.set(i, 0, j, s(Blocks.FARMLAND).setValue(net.minecraft.world.level.block.FarmBlock.MOISTURE, 7));
            p.set(i, 1, j, crop.getStateForAge(Math.min(crop.getMaxAge(), 3 + Math.floorMod(i * 7 + j * 3, crop.getMaxAge()))));
         }
      }
      int si = Math.max(2, mid / 2);
      int sj = Math.min(s - 3, 5);
      p.set(si, 1, sj, s(Blocks.OAK_FENCE));
      p.set(si, 2, sj, s(Blocks.HAY_BLOCK));
      p.set(si, 3, sj, s(Blocks.CARVED_PUMPKIN).setValue(net.minecraft.world.level.block.CarvedPumpkinBlock.FACING, Direction.NORTH));
      p.set(si - 1, 2, sj, s(Blocks.OAK_FENCE));
      p.set(si + 1, 2, sj, s(Blocks.OAK_FENCE));
      // Well.
      int wi = mid + 2;
      int wj = 2;
      p.fill(wi, 0, wj, wi + 2, 1, wj + 2, s(Blocks.COBBLESTONE));
      p.set(wi + 1, 1, wj + 1, s(Blocks.WATER));
      p.set(wi + 1, 0, wj + 1, s(Blocks.WATER));
      p.fill(wi, 2, wj, wi, 3, wj, s(Blocks.OAK_FENCE));
      p.fill(wi + 2, 2, wj + 2, wi + 2, 3, wj + 2, s(Blocks.OAK_FENCE));
      p.fill(wi, 4, wj, wi + 2, 4, wj + 2, slab(Blocks.SPRUCE_SLAB));
   }

   // ------------------------------------------------------------------ western mansion (yokan)

   static void mansion(BlockCanvas l, int x, int y, int z, int size) {
      int s = Math.max(15, Math.min(size, 34));
      Plot p = new Plot(l, x, y, z);
      int i1 = 1;
      int i2 = s - 2;
      if ((i2 - i1) % 2 == 1) {
         i2--;
      }
      int j1 = 5;
      int j2 = s - 2;
      int mid = (i1 + i2) / 2;
      p.clear(0, 1, 0, s - 1, 24, s - 1);
      p.ground(0, 0, s - 1, s - 1, s(Blocks.GRASS_BLOCK));
      // Gravel drive, hedges and a fountain in the front garden.
      p.fill(mid - 1, 0, 0, mid + 1, 0, j1 - 1, s(Blocks.GRAVEL));
      for (int i = 0; i < s; i++) {
         if (Math.abs(i - mid) > 1) {
            p.set(i, 1, 0, s(Blocks.OAK_LEAVES));
         }
      }
      p.fill(0, 1, 0, 0, 1, s - 1, s(Blocks.OAK_LEAVES));
      p.fill(s - 1, 1, 0, s - 1, 1, s - 1, s(Blocks.OAK_LEAVES));
      p.fill(mid - 2, 1, 0, mid - 2, 2, 0, s(Blocks.QUARTZ_PILLAR));
      p.fill(mid + 2, 1, 0, mid + 2, 2, 0, s(Blocks.QUARTZ_PILLAR));
      p.set(mid - 2, 3, 0, s(Blocks.LANTERN));
      p.set(mid + 2, 3, 0, s(Blocks.LANTERN));

      BlockState brick = s(Blocks.BRICKS);
      BlockState stone = s(Blocks.SMOOTH_QUARTZ);
      int f1 = 1;
      int f2 = 6;
      int roofH = 11;
      p.fill(i1, 0, j1, i2, 0, j2, s(Blocks.STONE_BRICKS));
      p.fill(i1, f1 - 1, j1, i2, f1 - 1, j2, s(Blocks.DARK_OAK_PLANKS));
      p.walls(i1, f1, j1, i2, roofH - 1, j2, brick);
      // Quoins at the corners and string courses at each floor.
      for (int h = f1; h < roofH; h++) {
         BlockState q = h % 2 == 0 ? stone : brick;
         for (int[] c : new int[][]{{i1, j1}, {i2, j1}, {i1, j2}, {i2, j2}}) {
            p.set(c[0], h, c[1], h % 2 == 0 ? stone : s(Blocks.QUARTZ_BRICKS));
         }
      }
      p.ring(i1, f2 - 1, j1, i2, j2, stone);
      p.ring(i1, roofH - 1, j1, i2, j2, stone);
      p.fill(i1 + 1, f2 - 1, j1 + 1, i2 - 1, f2 - 1, j2 - 1, s(Blocks.DARK_OAK_PLANKS));
      p.fill(i1 + 1, roofH - 1, j1 + 1, i2 - 1, roofH - 1, j2 - 1, s(Blocks.DARK_OAK_PLANKS));
      // Tall windows with stone sills, two per bay.
      for (int fy : new int[]{f1, f2}) {
         for (int i = i1 + 2; i <= i2 - 2; i += 2) {
            if (Math.abs(i - mid) <= 1) {
               continue;
            }
            p.fill(i, fy + 1, j1, i, fy + 2, j1, s(Blocks.GLASS_PANE));
            p.set(i, fy, j1 - 1, slab(Blocks.QUARTZ_SLAB));
            p.fill(i, fy + 1, j2, i, fy + 2, j2, s(Blocks.GLASS_PANE));
         }
         for (int j = j1 + 2; j <= j2 - 2; j += 2) {
            p.fill(i1, fy + 1, j, i1, fy + 2, j, s(Blocks.GLASS_PANE));
            p.fill(i2, fy + 1, j, i2, fy + 2, j, s(Blocks.GLASS_PANE));
         }
      }
      // Portico with columns, a balcony above and a pediment.
      for (int side : new int[]{-2, 2}) {
         p.fill(mid + side, f1, j1 - 3, mid + side, f2 - 2, j1 - 3, s(Blocks.QUARTZ_PILLAR));
      }
      p.fill(mid - 2, 0, j1 - 3, mid + 2, 0, j1 - 1, s(Blocks.POLISHED_DIORITE));
      p.fill(mid - 1, 0, j1 - 4, mid + 1, 0, j1 - 4, stairs(Blocks.POLISHED_DIORITE_STAIRS, Direction.SOUTH));
      p.fill(mid - 2, f2 - 1, j1 - 3, mid + 2, f2 - 1, j1 - 1, stone);
      p.fill(mid - 2, f2, j1 - 3, mid + 2, f2, j1 - 3, s(Blocks.DIORITE_WALL));
      p.door(mid, f1, j1, Blocks.DARK_OAK_DOOR, Direction.NORTH);
      p.set(mid, f1 + 2, j1, s(Blocks.GLASS_PANE));
      p.door(mid, f2, j1, Blocks.DARK_OAK_DOOR, Direction.NORTH);
      p.fill(mid - 2, roofH, j1 - 2, mid + 2, roofH, j1 - 1, stone);
      p.gable(mid - 2, j1 - 2, mid + 2, j1 + 1, roofH + 1, false, Blocks.QUARTZ_STAIRS, stone, slab(Blocks.QUARTZ_SLAB), 0);

      // Slate hip roof with two chimneys.
      int top = p.hip(i1, j1, i2, j2, roofH, Blocks.DEEPSLATE_TILE_STAIRS, slab(Blocks.DEEPSLATE_TILE_SLAB), 1);
      for (int ci : new int[]{i1 + 2, i2 - 2}) {
         p.fill(ci, roofH, (j1 + j2) / 2, ci, top + 2, (j1 + j2) / 2, brick);
         p.set(ci, top + 3, (j1 + j2) / 2, slab(Blocks.STONE_BRICK_SLAB));
      }

      // Interior: hall with a grand staircase and chandelier, fireplace, dining room, library, bedrooms.
      p.fill(i1 + 1, f1 - 1, j1 + 1, i2 - 1, f1 - 1, j2 - 1, s(Blocks.DARK_OAK_PLANKS));
      p.fill(mid - 1, f1 - 1, j1 + 1, mid + 1, f1 - 1, j2 - 2, s(Blocks.RED_WOOL));
      int steps = f2 - f1;
      p.flight(mid, f1, j2 - 1 - steps, Direction.SOUTH, steps, Blocks.DARK_OAK_STAIRS);
      p.set(mid, f2 - 1, j2 - 1, s(Blocks.DARK_OAK_PLANKS));
      p.set(mid, f2 - 2, (j1 + j2) / 2 - 1, s(Blocks.CHAIN));
      p.set(mid, f2 - 3, (j1 + j2) / 2 - 1, s(Blocks.LANTERN).setValue(net.minecraft.world.level.block.LanternBlock.HANGING, true));
      // Fireplace on the west wall.
      int fj = (j1 + j2) / 2;
      p.fill(i1 + 1, f1, fj - 1, i1 + 1, f1 + 2, fj + 1, brick);
      p.set(i1 + 1, f1, fj, s(Blocks.CAMPFIRE));
      p.set(i1 + 1, f1 + 1, fj, air());
      // Dining table on the east side.
      for (int j = j1 + 2; j < j2 - 2; j++) {
         p.set(i2 - 3, f1, j, s(Blocks.DARK_OAK_FENCE));
         p.set(i2 - 3, f1 + 1, j, s(Blocks.WHITE_CARPET));
         p.set(i2 - 2, f1, j, stairs(Blocks.DARK_OAK_STAIRS, Direction.EAST));
         p.set(i2 - 4, f1, j, stairs(Blocks.DARK_OAK_STAIRS, Direction.WEST));
      }
      // Upstairs: library and bedrooms.
      for (int j = j1 + 1; j < j2; j++) {
         p.set(i1 + 1, f2, j, s(Blocks.BOOKSHELF));
         p.set(i1 + 1, f2 + 1, j, s(Blocks.BOOKSHELF));
      }
      p.bed(i2 - 2, f2, j2 - 3, Blocks.RED_BED, Direction.SOUTH);
      p.bed(i2 - 4, f2, j2 - 3, Blocks.RED_BED, Direction.SOUTH);
      p.hangingLantern(mid - 3, roofH - 2, (j1 + j2) / 2);
      p.hangingLantern(mid + 3, roofH - 2, (j1 + j2) / 2);
      p.hangingLantern(mid - 3, f2 - 2, (j1 + j2) / 2);
      p.hangingLantern(mid + 3, f2 - 2, (j1 + j2) / 2);
   }
}

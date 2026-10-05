package com.example.citybuilder.builders;

import java.util.Random;
import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.BellBlock;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.FenceGateBlock;
import net.minecraft.world.level.block.state.properties.BellAttachType;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

public final class BaseBuilder {
   private BaseBuilder() {
   }

   public static void build(BlockCanvas level, BaseBuilder.Type type, int x, int y, int z, int size) {
      if (size < 3) {
         size = 3;
      }

      switch (type) {
         case HOUSE:
            house(level, x, y, z, size);
            break;
         case FARM:
            farm(level, x, y, z, size);
            break;
         case WAREHOUSE:
            warehouse(level, x, y, z, size);
            break;
         case TOWER:
            tower(level, x, y, z, size);
            break;
         case SHRINE:
            shrine(level, x, y, z, size);
            break;
         case CAFE:
            cafe(level, x, y, z, size);
            break;
         case MANSION:
            mansion(level, x, y, z, size);
            break;
         case DOJO:
            dojo(level, x, y, z, size);
            break;
         case KONBINI:
            konbini(level, x, y, z, size);
            break;
         case HOTSPRING:
            hotspring(level, x, y, z, size);
            break;
         case TEMPLE:
            temple(level, x, y, z, size);
            break;
         case ZAKKYO:
            zakkyo(level, x, y, z, size);
            break;
         case SENTO:
            sento(level, x, y, z, size);
            break;
         case SHIBUYA109:
            shibuya109(level, x, y, z, size);
            break;
         case DEPARTMENT:
            department(level, x, y, z, size);
            break;
         case PARK:
            park(level, x, y, z, size);
            break;
         case KOBAN:
            koban(level, x, y, z, size);
            break;
         case SCHOOL:
            school(level, x, y, z, size);
      }
      BuildUtil.RoofStyle roofStyle = switch (type) {
         case HOUSE, CAFE, KONBINI -> BuildUtil.RoofStyle.GABLE;
         case FARM, WAREHOUSE -> BuildUtil.RoofStyle.NONE;
         case TOWER -> BuildUtil.RoofStyle.SPIRE;
         case SHRINE, DOJO, TEMPLE, SENTO -> BuildUtil.RoofStyle.TILE_HIP;
         case MANSION, HOTSPRING -> BuildUtil.RoofStyle.HIP;
         case ZAKKYO -> BuildUtil.RoofStyle.PENTHOUSE;
         case SHIBUYA109 -> BuildUtil.RoofStyle.NONE;
         case DEPARTMENT -> BuildUtil.RoofStyle.PENTHOUSE;
         case PARK, SCHOOL -> BuildUtil.RoofStyle.NONE;
         case KOBAN -> BuildUtil.RoofStyle.FLAT;
      };
      int pad = 2;

      int height = switch (type) {
         case HOUSE, CAFE, KONBINI -> 10;
         case FARM -> 4;
         case WAREHOUSE -> 12;
         case TOWER -> 30;
         case SHRINE, DOJO, HOTSPRING, TEMPLE, SENTO -> 14;
         case MANSION -> 18;
         case ZAKKYO -> 40;
         case SHIBUYA109 -> 55;
         case DEPARTMENT -> 30;
         case PARK -> 10;
         case KOBAN -> 8;
         case SCHOOL -> 20;
      };
      boolean pilasters = switch (type) {
         case SHIBUYA109, FARM, SHRINE, PARK, KOBAN, HOTSPRING -> false;
         default -> true;
      };
      if (type != BaseBuilder.Type.PARK && type != BaseBuilder.Type.FARM) {
         BuildUtil.decorateBuilding(level, x - pad, y, z - pad, x + size + pad, y + height, z + size + pad, roofStyle, pilasters);
      }

      // Plinth down to the ground so nothing floats on a slope.
      for (int xx = x - pad - 8; xx <= x + size + pad; xx++) {
         for (int zz = z - pad - 10; zz <= z + size + pad; zz++) {
            // Things standing just outside the walls (plates, lanterns, gates) need ground under them.
            if (level.isSet(xx, y + 1, zz) && !level.get(xx, y + 1, zz).isAir() && level.get(xx, y, zz).canBeReplaced()) {
               level.set(xx, y, zz, Blocks.STONE_BRICKS.defaultBlockState());
            }
            if (level.isSet(xx, y, zz) && !level.get(xx, y, zz).isAir()) {
               BuildUtil.foundation(level, xx, y - 1, zz, Blocks.STONE_BRICKS.defaultBlockState());
            }
         }
      }
   }

   private static void rectBorder(BlockCanvas l, int x1, int y, int z1, int x2, int z2, BlockState b) {
      for (int xx = x1; xx <= x2; xx++) {
         BuildUtil.setBlock(l, xx, y, z1, b);
         BuildUtil.setBlock(l, xx, y, z2, b);
      }

      for (int zz = z1; zz <= z2; zz++) {
         BuildUtil.setBlock(l, x1, y, zz, b);
         BuildUtil.setBlock(l, x2, y, zz, b);
      }
   }

   private static void clearArea(BlockCanvas l, int x1, int y1, int z1, int x2, int y2, int z2) {
      BuildUtil.fill(l, x1, y1, z1, x2, y2, z2, BuildUtil.air());
   }

   private static void house(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState wall = Blocks.WHITE_TERRACOTTA.defaultBlockState();
      BlockState log = Blocks.STRIPPED_DARK_OAK_LOG.defaultBlockState();
      BlockState floor = Blocks.SPRUCE_PLANKS.defaultBlockState();
      BlockState tatami = Blocks.YELLOW_WOOL.defaultBlockState();
      BlockState roof = Blocks.DEEPSLATE_TILES.defaultBlockState();
      BlockState paper = Blocks.WHITE_WOOL.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 8, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, Blocks.COBBLESTONE.defaultBlockState());
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x2 - 1, y + 1, z2 - 1, tatami);
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x + 2, y + 1, z2 - 1, floor);
      BuildUtil.fill(level, x, y + 1, z, x, y + 4, z, log);
      BuildUtil.fill(level, x2, y + 1, z, x2, y + 4, z, log);
      BuildUtil.fill(level, x, y + 1, z2, x, y + 4, z2, log);
      BuildUtil.fill(level, x2, y + 1, z2, x2, y + 4, z2, log);
      int cx = (x + x2) / 2;
      BuildUtil.fill(level, cx, y + 1, z, cx, y + 4, z, log);
      BuildUtil.fill(level, cx, y + 1, z2, cx, y + 4, z2, log);

      for (int xx = x + 1; xx <= x2 - 1; xx++) {
         for (int yy = y + 1; yy <= y + 3; yy++) {
            if (xx != cx) {
               BlockState s1 = yy == y + 2 ? paper : wall;
               BuildUtil.setBlock(level, xx, yy, z, s1);
               BuildUtil.setBlock(level, xx, yy, z2, s1);
            }
         }
      }

      for (int zz = z + 1; zz <= z2 - 1; zz++) {
         for (int yyx = y + 1; yyx <= y + 3; yyx++) {
            BlockState s1 = yyx == y + 2 ? paper : wall;
            BuildUtil.setBlock(level, x, yyx, zz, s1);
            BuildUtil.setBlock(level, x2, yyx, zz, s1);
         }
      }

      BuildUtil.fill(level, x, y + 4, z, x2, y + 4, z, log);
      BuildUtil.fill(level, x, y + 4, z2, x2, y + 4, z2, log);
      BuildUtil.fill(level, x, y + 4, z, x, y + 4, z2, log);
      BuildUtil.fill(level, x2, y + 4, z, x2, y + 4, z2, log);

      for (int i = 0; i <= s / 2; i++) {
         int yyx = y + 4 + i;
         BuildUtil.fill(level, x - 1, yyx, z + i, x2 + 1, yyx, z2 - i, roof);
      }

      BuildUtil.setBlock(level, cx, y + 1, z, BuildUtil.air());
      BuildUtil.setBlock(level, cx, y + 2, z, BuildUtil.air());
      BuildUtil.door(level, cx, y + 1, z, Blocks.SPRUCE_DOOR, Direction.NORTH);
      // Irori (sunken hearth) in the middle of the tatami room, with floor cushions.
      int cz = (z + z2) / 2;
      BuildUtil.setBlock(level, cx, y + 1, cz, Blocks.CAMPFIRE.defaultBlockState());
      BuildUtil.setBlock(level, cx + 1, y + 2, cz - 1, Blocks.OAK_PRESSURE_PLATE.defaultBlockState());
      BuildUtil.setBlock(level, cx - 1, y + 2, cz + 1, Blocks.OAK_PRESSURE_PLATE.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 3, z2 - 1, Blocks.WHITE_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, x + 1, y + 2, z + 2, Blocks.LANTERN.defaultBlockState());
      BuildUtil.setBlock(level, x + 1, y + 2, z2 - 2, Blocks.LANTERN.defaultBlockState());
   }

   private static void farm(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState fence = Blocks.OAK_FENCE.defaultBlockState();
      BlockState path = Blocks.DIRT_PATH.defaultBlockState();
      BlockState farmland = Blocks.FARMLAND.defaultBlockState();
      BlockState water = Blocks.WATER.defaultBlockState();
      rectBorder(level, x, y, z, x2, z2, path);

      for (int xx = x; xx <= x2; xx++) {
         BuildUtil.setBlock(level, xx, y + 1, z, fence);
         BuildUtil.setBlock(level, xx, y + 1, z2, fence);
      }

      for (int zz = z; zz <= z2; zz++) {
         BuildUtil.setBlock(level, x, y + 1, zz, fence);
         BuildUtil.setBlock(level, x2, y + 1, zz, fence);
      }

      for (int xx = x + 1; xx <= x2 - 1; xx++) {
         for (int zz = z + 1; zz <= z2 - 1; zz++) {
            int dz = zz - z;
            if (dz % 4 == 0 && xx > x + 1 && xx < x2 - 1) {
               BuildUtil.setBlock(level, xx, y, zz, water);
            } else {
               BuildUtil.setBlock(level, xx, y, zz, farmland);

               CropBlock cropBlock = (CropBlock) switch ((xx - x + (zz - z) / 2) % 4) {
                  case 0 -> Blocks.WHEAT;
                  case 1 -> Blocks.CARROTS;
                  case 2 -> Blocks.POTATOES;
                  default -> Blocks.BEETROOTS;
               };
               BlockState crop = cropBlock.getStateForAge(Math.floorMod(xx * 7 + zz * 3, cropBlock.getMaxAge() + 1));
               BuildUtil.setBlock(level, xx, y + 1, zz, crop);
            }
         }
      }

      int cx = (x + x2) / 2;
      BuildUtil.setBlock(level, cx, y + 1, z, Blocks.OAK_FENCE_GATE.defaultBlockState().setValue(FenceGateBlock.IN_WALL, false));
      int mz = (z + z2) / 2;
      BuildUtil.setBlock(level, cx, y, mz, Blocks.WATER.defaultBlockState());
      rectBorder(level, cx - 1, y, mz - 1, cx + 1, mz + 1, Blocks.COBBLESTONE.defaultBlockState());
      BuildUtil.setBlock(level, cx - 1, y + 1, mz - 1, Blocks.COBBLESTONE_WALL.defaultBlockState());
      BuildUtil.setBlock(level, cx + 1, y + 1, mz - 1, Blocks.COBBLESTONE_WALL.defaultBlockState());
      BuildUtil.setBlock(level, cx - 1, y + 1, mz + 1, Blocks.COBBLESTONE_WALL.defaultBlockState());
      BuildUtil.setBlock(level, cx + 1, y + 1, mz + 1, Blocks.COBBLESTONE_WALL.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 3, mz, Blocks.OAK_PLANKS.defaultBlockState());
      BuildUtil.setBlock(level, x + 2, y + 1, z + 2, Blocks.HAY_BLOCK.defaultBlockState());
      BuildUtil.setBlock(level, x + 2, y + 2, z + 2, Blocks.JACK_O_LANTERN.defaultBlockState());
      BuildUtil.setBlock(level, x2 - 2, y + 1, z + 2, Blocks.COMPOSTER.defaultBlockState());
      BuildUtil.setBlock(level, x2 - 3, y + 1, z + 2, Blocks.COMPOSTER.defaultBlockState());
   }

   private static void warehouse(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      int h = 8;
      BlockState wall = Blocks.IRON_BLOCK.defaultBlockState();
      BlockState trim = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState roof = Blocks.GRAY_CONCRETE.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + h, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, Blocks.STONE.defaultBlockState());
      BuildUtil.hollowBox(level, x, y + 1, z, x2, y + h - 1, z2, wall);

      for (int xx = x; xx <= x2; xx++) {
         BuildUtil.setBlock(level, xx, y + 1, z, trim);
         BuildUtil.setBlock(level, xx, y + 1, z2, trim);
      }

      for (int zz = z; zz <= z2; zz++) {
         BuildUtil.setBlock(level, x, y + 1, zz, trim);
         BuildUtil.setBlock(level, x2, y + 1, zz, trim);
      }

      BuildUtil.fill(level, x, y + h, z, x2, y + h, z2, roof);
      int cx = (x + x2) / 2;
      BuildUtil.fill(level, cx - 2, y + 1, z, cx + 2, y + 4, z, BuildUtil.air());

      for (int xx = cx - 2; xx <= cx + 2; xx++) {
         BuildUtil.setBlock(level, xx, y + 4, z, Blocks.IRON_BARS.defaultBlockState());
      }

      BuildUtil.setBlock(level, cx, y + 1, z2, BuildUtil.air());
      BuildUtil.setBlock(level, cx, y + 2, z2, BuildUtil.air());
      BuildUtil.door(level, cx, y + 1, z2, Blocks.IRON_DOOR, Direction.SOUTH);
      BuildUtil.setBlock(level, cx, y + 1, z2 + 1, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 1, z2 - 1, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());

      for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
         for (int zz = z + 2; zz <= z2 - 3; zz++) {
            BuildUtil.setBlock(level, xx, y + 1, zz, Blocks.BARREL.defaultBlockState());
            BuildUtil.setBlock(level, xx, y + 2, zz, Blocks.BARREL.defaultBlockState());
         }

         BuildUtil.setBlock(level, xx, y + 1, z2 - 2, Blocks.CHEST.defaultBlockState());
      }

      BuildUtil.fill(level, x + 1, y + 1, z2 - 4, x + 4, y + 4, z2 - 1, BuildUtil.air());
      BuildUtil.fill(level, x + 4, y + 1, z2 - 4, x + 4, y + 4, z2 - 1, Blocks.GLASS.defaultBlockState());
      BuildUtil.fill(level, x + 1, y + 1, z2 - 4, x + 4, y + 4, z2 - 4, Blocks.GLASS.defaultBlockState());
      BuildUtil.setBlock(level, x + 2, y + 1, z2 - 2, Blocks.CRAFTING_TABLE.defaultBlockState());
      BuildUtil.setBlock(level, x + 3, y + 1, z2 - 2, Blocks.LOOM.defaultBlockState());

      for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
         for (int zz = z + 2; zz <= z2 - 2; zz += 3) {
            BuildUtil.setBlock(level, xx, y + h - 1, zz, Blocks.SEA_LANTERN.defaultBlockState());
         }
      }
   }

   private static void tower(BlockCanvas level, int x, int y, int z, int s) {
      int size = Math.min(s, 9);
      int x2 = x + size - 1;
      int z2 = z + size - 1;
      int h = 22;
      BlockState wall = Blocks.COBBLESTONE.defaultBlockState();
      BlockState brick = Blocks.STONE_BRICKS.defaultBlockState();
      BlockState top = Blocks.CHISELED_STONE_BRICKS.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + h + 3, z2);
      BuildUtil.fill(level, x - 1, y, z - 1, x2 + 1, y, z2 + 1, brick);
      BuildUtil.hollowBox(level, x, y + 1, z, x2, y + h - 3, z2, wall);

      for (int yy = y + 1; yy <= y + 3; yy++) {
         BuildUtil.hollowBox(level, x, yy, z, x2, yy, z2, brick);
      }

      int fh = (h - 4) / 3;

      for (int f = 1; f < 3; f++) {
         int fy = y + 1 + f * fh;
         BuildUtil.fill(level, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.SPRUCE_PLANKS.defaultBlockState());
         BuildUtil.setBlock(level, x, fy + 2, (z + z2) / 2, BuildUtil.air());
         BuildUtil.setBlock(level, x2, fy + 2, (z + z2) / 2, BuildUtil.air());
         BuildUtil.setBlock(level, (x + x2) / 2, fy + 2, z, BuildUtil.air());
         BuildUtil.setBlock(level, (x + x2) / 2, fy + 2, z2, BuildUtil.air());
      }

      for (int xx = x; xx <= x2; xx++) {
         if ((xx - x) % 2 == 0) {
            BuildUtil.setBlock(level, xx, y + h - 2, z, top);
            BuildUtil.setBlock(level, xx, y + h - 2, z2, top);
         }
      }

      for (int zz = z; zz <= z2; zz++) {
         if ((zz - z) % 2 == 0) {
            BuildUtil.setBlock(level, x, y + h - 2, zz, top);
            BuildUtil.setBlock(level, x2, y + h - 2, zz, top);
         }
      }

      BuildUtil.ladder(level, x + 1, z + 1, y + 1, y + h - 4, Direction.SOUTH);

      int cx = (x + x2) / 2;
      BuildUtil.door(level, cx, y + 1, z, Blocks.DARK_OAK_DOOR, Direction.NORTH);
      BuildUtil.setBlock(level, x, y + h - 2, z, Blocks.CAMPFIRE.defaultBlockState());
      BuildUtil.setBlock(level, x2, y + h - 2, z, Blocks.CAMPFIRE.defaultBlockState());
      BuildUtil.setBlock(level, x, y + h - 2, z2, Blocks.CAMPFIRE.defaultBlockState());
      BuildUtil.setBlock(level, x2, y + h - 2, z2, Blocks.CAMPFIRE.defaultBlockState());
      BuildUtil.fill(level, cx, y + h - 2, (z + z2) / 2, cx, y + h + 2, (z + z2) / 2, Blocks.OAK_FENCE.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + h + 3, (z + z2) / 2, Blocks.RED_WOOL.defaultBlockState());
   }

   private static void shrine(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState stone = Blocks.POLISHED_ANDESITE.defaultBlockState();
      BlockState pillar = Blocks.STRIPPED_DARK_OAK_LOG.defaultBlockState();
      BlockState roof = Blocks.DEEPSLATE_TILES.defaultBlockState();
      BlockState torii = Blocks.CRIMSON_HYPHAE.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 10, z2);
      BuildUtil.fill(level, x - 1, y - 1, z - 1, x2 + 1, y - 1, z2 + 1, stone);
      BuildUtil.fill(level, x, y, z, x2, y, z2, stone);
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x + 1, y + 5, z + 1, pillar);
      BuildUtil.fill(level, x2 - 1, y + 1, z + 1, x2 - 1, y + 5, z + 1, pillar);
      BuildUtil.fill(level, x + 1, y + 1, z2 - 1, x + 1, y + 5, z2 - 1, pillar);
      BuildUtil.fill(level, x2 - 1, y + 1, z2 - 1, x2 - 1, y + 5, z2 - 1, pillar);

      for (int zz = z + 2; zz <= z2 - 2; zz++) {
         BuildUtil.setBlock(level, x + 1, y + 2, zz, Blocks.WHITE_TERRACOTTA.defaultBlockState());
         BuildUtil.setBlock(level, x2 - 1, y + 2, zz, Blocks.WHITE_TERRACOTTA.defaultBlockState());
      }

      for (int xx = x + 2; xx <= x2 - 2; xx++) {
         BuildUtil.setBlock(level, xx, y + 2, z2 - 1, Blocks.WHITE_TERRACOTTA.defaultBlockState());
      }

      int cz = (z + z2) / 2;

      for (int i = 0; i <= s / 2 + 2; i++) {
         int yy = y + 5 + i;
         int shrink = Math.max(0, i - 1);
         BuildUtil.fill(level, x - 2 + i, yy, z + shrink, x2 + 2 - i, yy, z2 - shrink, roof);
      }

      int tx = (x + x2) / 2;

      for (int off : new int[]{-4, -8}) {
         int tz = z + off;
         BuildUtil.fill(level, tx - 3, y + 1, tz, tx - 3, y + 4, tz, torii);
         BuildUtil.fill(level, tx + 3, y + 1, tz, tx + 3, y + 4, tz, torii);
         BuildUtil.fill(level, tx - 4, y + 5, tz, tx + 4, y + 5, tz, torii);
         BuildUtil.fill(level, tx - 3, y + 4, tz, tx + 3, y + 4, tz, torii);
      }

      BuildUtil.setBlock(level, tx, y + 1, z + 2, Blocks.DARK_OAK_PLANKS.defaultBlockState());
      BuildUtil.setBlock(level, tx, y + 1, z + 3, Blocks.DARK_OAK_PLANKS.defaultBlockState());
      BuildUtil.setBlock(level, tx, y + 2, z + 2, Blocks.DARK_OAK_SLAB.defaultBlockState());
      BuildUtil.setBlock(level, x, y + 1, z - 2, Blocks.POLISHED_DIORITE.defaultBlockState());
      BuildUtil.setBlock(level, x, y + 2, z - 2, Blocks.CHISELED_POLISHED_BLACKSTONE.defaultBlockState());
      BuildUtil.setBlock(level, x2, y + 1, z - 2, Blocks.POLISHED_DIORITE.defaultBlockState());
      BuildUtil.setBlock(level, x2, y + 2, z - 2, Blocks.CHISELED_POLISHED_BLACKSTONE.defaultBlockState());
      BuildUtil.setBlock(level, tx - 4, y + 4, z, BuildUtil.hangingLantern(Blocks.LANTERN));
      BuildUtil.setBlock(level, tx + 4, y + 4, z, BuildUtil.hangingLantern(Blocks.LANTERN));
      BuildUtil.fill(level, x + 1, y + 1, z - 3, x + 3, y + 1, z - 1, Blocks.COBBLESTONE.defaultBlockState());
      BuildUtil.setBlock(level, x + 2, y + 1, z - 2, Blocks.WATER.defaultBlockState());
   }

   private static void cafe(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState wall = Blocks.BRICKS.defaultBlockState();
      BlockState trim = Blocks.DARK_OAK_PLANKS.defaultBlockState();
      BlockState glass = Blocks.GLASS.defaultBlockState();
      BlockState roof = Blocks.SPRUCE_PLANKS.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 6, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, Blocks.POLISHED_DIORITE.defaultBlockState());
      BuildUtil.hollowBox(level, x, y + 1, z, x2, y + 4, z2, wall);

      for (int xx = x + 2; xx <= x2 - 2; xx++) {
         BuildUtil.setBlock(level, xx, y + 2, z, glass);
         BuildUtil.setBlock(level, xx, y + 3, z, glass);
         BuildUtil.setBlock(level, xx, y + 2, z2, glass);
         BuildUtil.setBlock(level, xx, y + 3, z2, glass);
      }

      for (int zz = z + 2; zz <= z2 - 2; zz++) {
         BuildUtil.setBlock(level, x, y + 2, zz, glass);
         BuildUtil.setBlock(level, x, y + 3, zz, glass);
         BuildUtil.setBlock(level, x2, y + 2, zz, glass);
         BuildUtil.setBlock(level, x2, y + 3, zz, glass);
      }

      for (int xx = x; xx <= x2; xx++) {
         BuildUtil.setBlock(level, xx, y + 4, z, trim);
         BuildUtil.setBlock(level, xx, y + 4, z2, trim);
      }

      for (int zz = z; zz <= z2; zz++) {
         BuildUtil.setBlock(level, x, y + 4, zz, trim);
         BuildUtil.setBlock(level, x2, y + 4, zz, trim);
      }

      BuildUtil.fill(level, x - 1, y + 5, z - 1, x2 + 1, y + 5, z2 + 1, roof);
      int cx = (x + x2) / 2;
      BuildUtil.setBlock(level, cx, y + 1, z, BuildUtil.air());
      BuildUtil.setBlock(level, cx, y + 2, z, BuildUtil.air());
      BuildUtil.door(level, cx, y + 1, z, Blocks.DARK_OAK_DOOR, Direction.NORTH);
      BuildUtil.wallSign(level, cx, y + 4, z - 1, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH,
         Component.empty(), Component.literal("☕ CAFE"), Component.translatable("citybuilder.sign.cafe"));
      BuildUtil.fill(level, x + 2, y + 1, z2 - 2, x2 - 2, y + 1, z2 - 2, trim);
      BuildUtil.setBlock(level, x + 3, y + 2, z2 - 2, Blocks.FLOWER_POT.defaultBlockState());
      BuildUtil.setBlock(level, x2 - 3, y + 2, z2 - 2, Blocks.BREWING_STAND.defaultBlockState());
      BuildUtil.setBlock(level, (x + x2) / 2, y + 2, z2 - 2, Blocks.CAKE.defaultBlockState());

      for (int i = 0; i < 3; i++) {
         int tx = x + 2 + i * 3;
         if (tx > x2 - 2) {
            break;
         }

         BuildUtil.setBlock(level, tx, y + 1, z + 2, Blocks.OAK_FENCE.defaultBlockState());
         BuildUtil.setBlock(level, tx, y + 2, z + 2, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
         BuildUtil.setBlock(level, tx - 1, y + 1, z + 2, BuildUtil.stairs(Blocks.OAK_STAIRS, Direction.WEST));
      }

      for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
         for (int zz = z + 2; zz <= z2 - 2; zz += 3) {
            BuildUtil.setBlock(level, xx, y + 4, zz, Blocks.LANTERN.defaultBlockState());
         }
      }

      BuildUtil.setBlock(level, cx - 2, y + 1, z - 2, Blocks.OAK_FENCE.defaultBlockState());
      BuildUtil.setBlock(level, cx - 2, y + 2, z - 2, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
      BuildUtil.setBlock(level, cx + 2, y + 1, z - 2, Blocks.OAK_FENCE.defaultBlockState());
      BuildUtil.setBlock(level, cx + 2, y + 2, z - 2, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
   }

   private static void mansion(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState wall = Blocks.WHITE_TERRACOTTA.defaultBlockState();
      BlockState brick = Blocks.POLISHED_ANDESITE.defaultBlockState();
      BlockState roof = Blocks.NETHER_BRICKS.defaultBlockState();
      BlockState floor = Blocks.DARK_OAK_PLANKS.defaultBlockState();
      BlockState carpet = Blocks.RED_WOOL.defaultBlockState();
      int h1 = 5;
      int h2 = 5;
      clearArea(level, x, y + 1, z, x2, y + h1 + h2 + 4, z2);
      BuildUtil.fill(level, x - 1, y, z - 1, x2 + 1, y, z2 + 1, brick);
      BuildUtil.hollowBox(level, x, y + 1, z, x2, y + h1, z2, wall);
      BuildUtil.hollowBox(level, x, y + h1 + 1, z, x2, y + h1 + h2, z2, wall);
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x2 - 1, y + 1, z2 - 1, floor);
      BuildUtil.fill(level, x + 1, y + h1 + 1, z + 1, x2 - 1, y + h1 + 1, z2 - 1, floor);
      BuildUtil.fill(level, x + 2, y + 2, z + 2, x2 - 2, y + 2, z2 - 2, carpet);
      BuildUtil.fill(level, x + 2, y + h1 + 2, z + 2, x2 - 2, y + h1 + 2, z2 - 2, carpet);

      for (int f = 0; f < 2; f++) {
         int by = y + 2 + f * h1;

         for (int xx = x + 2; xx <= x2 - 2; xx += 2) {
            BuildUtil.setBlock(level, xx, by, z, Blocks.GLASS_PANE.defaultBlockState());
            BuildUtil.setBlock(level, xx, by + 1, z, Blocks.GLASS_PANE.defaultBlockState());
            BuildUtil.setBlock(level, xx, by, z2, Blocks.GLASS_PANE.defaultBlockState());
            BuildUtil.setBlock(level, xx, by + 1, z2, Blocks.GLASS_PANE.defaultBlockState());
         }
      }

      int ry = y + h1 + h2 + 1;
      BuildUtil.fill(level, x - 1, ry, z - 1, x2 + 1, ry, z2 + 1, roof);
      BuildUtil.fill(level, x, ry + 1, z, x2, ry + 1, z2, roof);
      BuildUtil.fill(level, x + 1, ry + 2, z + 1, x2 - 1, ry + 2, z2 - 1, roof);
      BuildUtil.fill(level, x + 2, ry, z + 2, x + 2, ry + 3, z + 2, brick);
      int cx = (x + x2) / 2;
      BuildUtil.fill(level, cx - 2, y, z - 2, cx + 2, y, z - 1, brick);
      BuildUtil.fill(level, cx - 1, y + 1, z, cx + 1, y + 3, z, BuildUtil.air());
      BuildUtil.door(level, cx, y + 1, z, Blocks.DARK_OAK_DOOR, Direction.NORTH);
      BuildUtil.fill(level, cx - 2, y + 1, z - 1, cx - 2, y + h1, z - 1, brick);
      BuildUtil.fill(level, cx + 2, y + 1, z - 1, cx + 2, y + h1, z - 1, brick);

      // Staircase to the upper floor, with a stairwell cut through the ceiling.
      int steps = Math.min(h1 + 1, s - 4);
      for (int i = 0; i < steps; i++) {
         BuildUtil.setBlock(level, x2 - 2, y + 1 + i, z2 - 2 - i, BuildUtil.stairs(Blocks.OAK_STAIRS, Direction.NORTH));
         BuildUtil.fill(level, x2 - 2, y + 2 + i, z2 - 2 - i, x2 - 2, y + 4 + i, z2 - 2 - i, BuildUtil.air());
      }

      BuildUtil.fill(level, cx - 1, y + 1, z2 - 1, cx + 1, y + 3, z2 - 1, Blocks.BRICKS.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 1, z2 - 1, Blocks.CAMPFIRE.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + h1 - 1, (z + z2) / 2, Blocks.CHAIN.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + h1 - 2, (z + z2) / 2, BuildUtil.hangingLantern(Blocks.LANTERN));
      BuildUtil.setBlock(level, cx, y + h1 + h2 - 1, (z + z2) / 2, Blocks.CHAIN.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + h1 + h2 - 2, (z + z2) / 2, BuildUtil.hangingLantern(Blocks.LANTERN));
      BuildUtil.setBlock(level, x + 2, y + 2, z + 2, Blocks.BOOKSHELF.defaultBlockState());
      BuildUtil.setBlock(level, x + 2, y + 3, z + 2, Blocks.BOOKSHELF.defaultBlockState());
      BuildUtil.setBlock(level, x2 - 2, y + 2, z + 2, Blocks.BOOKSHELF.defaultBlockState());
      BuildUtil.bed(level, x + 2, y + h1 + 2, z + 3, Blocks.RED_BED, Direction.NORTH);
   }

   private static void dojo(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState log = Blocks.STRIPPED_OAK_LOG.defaultBlockState();
      BlockState wall = Blocks.WHITE_TERRACOTTA.defaultBlockState();
      BlockState tatami = Blocks.YELLOW_WOOL.defaultBlockState();
      BlockState roof = Blocks.DEEPSLATE_TILES.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 8, z2);
      BuildUtil.fill(level, x - 1, y, z - 1, x2 + 1, y, z2 + 1, Blocks.STONE_BRICKS.defaultBlockState());
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x + 1, y + 1, z2 - 1, Blocks.SPRUCE_PLANKS.defaultBlockState());
      BuildUtil.fill(level, x2 - 1, y + 1, z + 1, x2 - 1, y + 1, z2 - 1, Blocks.SPRUCE_PLANKS.defaultBlockState());
      BuildUtil.fill(level, x + 2, y + 1, z + 1, x2 - 2, y + 1, z2 - 1, tatami);

      for (int xx = x; xx <= x2; xx += (s - 1) / 2) {
         for (int zz = z; zz <= z2; zz += (s - 1) / 2) {
            BuildUtil.fill(level, xx, y + 1, zz, xx, y + 5, zz, log);
         }
      }

      for (int xx = x + 1; xx <= x2 - 1; xx++) {
         for (int yy = y + 2; yy <= y + 4; yy++) {
            BuildUtil.setBlock(level, xx, yy, z, wall);
            BuildUtil.setBlock(level, xx, yy, z2, wall);
         }
      }

      for (int zz = z + 1; zz <= z2 - 1; zz++) {
         for (int yy = y + 2; yy <= y + 4; yy++) {
            BuildUtil.setBlock(level, x, yy, zz, wall);
            BuildUtil.setBlock(level, x2, yy, zz, wall);
         }
      }

      BuildUtil.hollowBox(level, x, y + 5, z, x2, y + 5, z2, log);

      for (int i = 0; i <= s / 2; i++) {
         int yy = y + 5 + i;
         BuildUtil.fill(level, x - 1, yy, z + i, x2 + 1, yy, z2 - i, roof);
      }

      int cx = (x + x2) / 2;
      BuildUtil.fill(level, cx - 1, y + 1, z, cx + 1, y + 3, z, BuildUtil.air());
      BuildUtil.setBlock(level, cx - 1, y + 1, z, Blocks.DARK_OAK_DOOR.defaultBlockState()
         .setValue(DoorBlock.FACING, Direction.SOUTH).setValue(DoorBlock.HINGE, DoorHingeSide.RIGHT));
      BuildUtil.setBlock(level, cx + 1, y + 1, z, Blocks.DARK_OAK_DOOR.defaultBlockState()
         .setValue(DoorBlock.FACING, Direction.SOUTH).setValue(DoorBlock.HINGE, DoorHingeSide.LEFT));
      BuildUtil.setBlock(level, cx, y + 3, z2 - 1, Blocks.WHITE_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 2, z2 - 1, Blocks.DARK_OAK_PLANKS.defaultBlockState());

      for (int zz = z + 2; zz <= z2 - 2; zz += 2) {
         BuildUtil.setBlock(level, x + 1, y + 2, zz, Blocks.OAK_FENCE.defaultBlockState());
         BuildUtil.setBlock(level, x + 1, y + 3, zz, Blocks.OAK_FENCE.defaultBlockState());
      }
   }

   private static void konbini(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState wall = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState accent = Blocks.LIME_CONCRETE.defaultBlockState();
      BlockState sign = Blocks.RED_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.GLASS.defaultBlockState();
      BlockState floor = Blocks.SMOOTH_STONE.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 6, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, floor);
      BuildUtil.hollowBox(level, x, y + 1, z, x2, y + 4, z2, wall);

      for (int xx = x + 1; xx <= x2 - 1; xx++) {
         BuildUtil.setBlock(level, xx, y + 2, z, glass);
         BuildUtil.setBlock(level, xx, y + 3, z, glass);
      }

      for (int xx = x; xx <= x2; xx++) {
         BuildUtil.setBlock(level, xx, y + 4, z, accent);
         BuildUtil.setBlock(level, xx, y + 4, z2, accent);
      }

      for (int zz = z; zz <= z2; zz++) {
         BuildUtil.setBlock(level, x, y + 4, zz, accent);
         BuildUtil.setBlock(level, x2, y + 4, zz, accent);
      }

      BuildUtil.fill(level, x, y + 5, z, x2, y + 5, z2, wall);
      int cx = (x + x2) / 2;
      BuildUtil.fill(level, cx - 1, y + 1, z, cx + 1, y + 3, z, BuildUtil.air());
      // Automatic doors: iron doors opened by pressure plates on both sides.
      BuildUtil.setBlock(level, cx - 1, y + 1, z, Blocks.IRON_DOOR.defaultBlockState()
         .setValue(DoorBlock.FACING, Direction.SOUTH).setValue(DoorBlock.HINGE, DoorHingeSide.RIGHT));
      BuildUtil.setBlock(level, cx + 1, y + 1, z, Blocks.IRON_DOOR.defaultBlockState()
         .setValue(DoorBlock.FACING, Direction.SOUTH).setValue(DoorBlock.HINGE, DoorHingeSide.LEFT));
      for (int dx : new int[]{-1, 1}) {
         BuildUtil.setBlock(level, cx + dx, y + 1, z - 1, Blocks.LIGHT_WEIGHTED_PRESSURE_PLATE.defaultBlockState());
         BuildUtil.setBlock(level, cx + dx, y + 1, z + 1, Blocks.LIGHT_WEIGHTED_PRESSURE_PLATE.defaultBlockState());
      }

      for (int xx = cx - 3; xx <= cx + 3; xx++) {
         BuildUtil.setBlock(level, xx, y + 5, z - 1, sign);
      }
      BuildUtil.wallSign(level, cx, y + 5, z - 2, Blocks.BIRCH_WALL_SIGN, Direction.NORTH,
         Component.empty(), Component.translatable("citybuilder.sign.konbini"), Component.literal("24h"));

      BuildUtil.fill(level, cx + 2, y + 1, z + 2, cx + 4, y + 1, z + 2, Blocks.SMOOTH_STONE_SLAB.defaultBlockState());
      BuildUtil.setBlock(level, cx + 3, y + 2, z + 2, Blocks.FURNACE.defaultBlockState());

      for (int zz = z + 3; zz <= z2 - 2; zz += 2) {
         BuildUtil.fill(level, x + 2, y + 1, zz, x2 - 2, y + 1, zz, Blocks.BARREL.defaultBlockState());
         BuildUtil.fill(level, x + 2, y + 2, zz, x2 - 2, y + 2, zz, Blocks.BARREL.defaultBlockState());
      }

      for (int xx = x + 1; xx <= x2 - 1; xx++) {
         BuildUtil.setBlock(level, xx, y + 1, z2 - 1, Blocks.BLUE_ICE.defaultBlockState());
         BuildUtil.setBlock(level, xx, y + 2, z2 - 1, Blocks.GLASS.defaultBlockState());
         BuildUtil.setBlock(level, xx, y + 3, z2 - 1, Blocks.BLUE_ICE.defaultBlockState());
      }

      for (int xx = x + 1; xx <= x2 - 1; xx++) {
         for (int zz = z + 1; zz <= z2 - 1; zz++) {
            if ((xx + zz) % 3 == 0) {
               BuildUtil.setBlock(level, xx, y + 4, zz, Blocks.SEA_LANTERN.defaultBlockState());
            }
         }
      }
   }

   private static void hotspring(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState rock = Blocks.COBBLESTONE.defaultBlockState();
      BlockState mossy = Blocks.MOSSY_COBBLESTONE.defaultBlockState();
      BlockState water = Blocks.WATER.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 5, z2);
      rectBorder(level, x, y, z, x2, z2, rock);
      BuildUtil.fill(level, x + 1, y, z + 1, x2 - 1, y, z2 - 1, mossy);
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x2 - 1, y + 1, z2 - 1, water);

      for (int xx = x; xx <= x2; xx++) {
         BuildUtil.setBlock(level, xx, y + 1, z, rock);
         BuildUtil.setBlock(level, xx, y + 1, z2, rock);
      }

      for (int zz = z; zz <= z2; zz++) {
         BuildUtil.setBlock(level, x, y + 1, zz, rock);
         BuildUtil.setBlock(level, x2, y + 1, zz, rock);
      }

      for (int[] c : new int[][]{{x, z}, {x2, z}, {x, z2}, {x2, z2}}) {
         BuildUtil.setBlock(level, c[0], y + 2, c[1], Blocks.COBBLESTONE_WALL.defaultBlockState());
         BuildUtil.setBlock(level, c[0], y + 3, c[1], Blocks.CARVED_PUMPKIN.defaultBlockState());
         BuildUtil.setBlock(level, c[0], y + 4, c[1], Blocks.COBBLESTONE_SLAB.defaultBlockState());
      }

      int hz1 = z - 5;
      int hz2 = z - 1;
      BuildUtil.fill(level, x, y, hz1, x2, y, hz2, Blocks.SPRUCE_PLANKS.defaultBlockState());
      BuildUtil.hollowBox(level, x, y + 1, hz1, x2, y + 3, hz2, Blocks.SPRUCE_PLANKS.defaultBlockState());
      BuildUtil.fill(level, x, y + 4, hz1, x2, y + 4, hz2, Blocks.DEEPSLATE_TILES.defaultBlockState());
      int cx = (x + x2) / 2;
      BuildUtil.setBlock(level, cx, y + 1, hz2, BuildUtil.air());
      BuildUtil.setBlock(level, cx, y + 2, hz2, BuildUtil.air());
      BuildUtil.setBlock(level, cx, y + 3, hz2, Blocks.RED_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 1, hz1, BuildUtil.air());
      BuildUtil.setBlock(level, cx, y + 2, hz1, BuildUtil.air());
      BuildUtil.door(level, cx, y + 1, hz1, Blocks.SPRUCE_DOOR, Direction.NORTH);
      BuildUtil.fill(level, x + 1, y + 1, hz1 + 1, x2 - 1, y + 2, hz1 + 1, Blocks.BARREL.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 1, hz1 + 1, BuildUtil.air());
      BuildUtil.setBlock(level, cx, y + 2, hz1 + 1, BuildUtil.air());
      BuildUtil.wallSign(level, cx + 1, y + 3, hz1 - 1, Blocks.SPRUCE_WALL_SIGN, Direction.NORTH,
         Component.empty(), Component.translatable("citybuilder.sign.onsen"));
   }

   private static void temple(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState base = Blocks.POLISHED_ANDESITE.defaultBlockState();
      BlockState pillar = Blocks.CRIMSON_HYPHAE.defaultBlockState();
      BlockState wall = Blocks.WHITE_TERRACOTTA.defaultBlockState();
      BlockState roof = Blocks.DEEPSLATE_TILES.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 14, z2);
      BuildUtil.fill(level, x - 2, y, z - 2, x2 + 2, y, z2 + 2, base);
      BuildUtil.fill(level, x - 1, y + 1, z - 1, x2 + 1, y + 1, z2 + 1, base);
      BuildUtil.fill(level, x, y + 2, z, x2, y + 2, z2, base);
      int[] cols = new int[]{x + 1, (x + x2) / 2, x2 - 1};

      for (int cx : cols) {
         BuildUtil.fill(level, cx, y + 3, z + 1, cx, y + 7, z + 1, pillar);
         BuildUtil.fill(level, cx, y + 3, z2 - 1, cx, y + 7, z2 - 1, pillar);
      }

      for (int yy = y + 3; yy <= y + 6; yy++) {
         for (int xx = x + 1; xx <= x2 - 1; xx++) {
            BuildUtil.setBlock(level, xx, yy, z2 - 1, wall);
         }

         for (int zz = z + 2; zz <= z2 - 2; zz++) {
            BuildUtil.setBlock(level, x + 1, yy, zz, wall);
            BuildUtil.setBlock(level, x2 - 1, yy, zz, wall);
         }
      }

      for (int i = 0; i <= s / 2 + 1; i++) {
         int yy = y + 7 + i;
         BuildUtil.fill(level, x - 2 + i, yy, z - 2 + i, x2 + 2 - i, yy, z2 + 2 - i, roof);
      }

      for (int i = 0; i <= s / 3 + 1; i++) {
         int yy = y + 10 + i;
         BuildUtil.fill(level, x + 1 + i, yy, z + 1 + i, x2 - 1 - i, yy, z2 - 1 - i, roof);
      }

      int cx = (x + x2) / 2;
      int cz = (z + z2) / 2;
      BuildUtil.setBlock(level, cx, y + 10 + s / 3 + 2, cz, Blocks.GOLD_BLOCK.defaultBlockState());

      for (int i = 0; i < 3; i++) {
         BuildUtil.fill(level, x - i, y + 2 - i, z - 2 - i, x2 + i, y + 2 - i, z - 2 - i, base);
      }

      BuildUtil.fill(level, x2 + 3, y + 1, z + 2, x2 + 3, y + 4, z + 2, pillar);
      BuildUtil.fill(level, x2 + 5, y + 1, z + 2, x2 + 5, y + 4, z + 2, pillar);
      BuildUtil.fill(level, x2 + 3, y + 4, z + 2, x2 + 5, y + 4, z + 2, pillar);
      BuildUtil.setBlock(level, x2 + 4, y + 3, z + 2, Blocks.BELL.defaultBlockState()
         .setValue(BellBlock.ATTACHMENT, BellAttachType.CEILING).setValue(BellBlock.FACING, Direction.EAST));
      BuildUtil.setBlock(level, cx, y + 3, z2 - 2, Blocks.GOLD_BLOCK.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 4, z2 - 2, Blocks.GOLD_BLOCK.defaultBlockState());
      BuildUtil.setBlock(level, cx - 1, y + 3, z2 - 2, Blocks.LANTERN.defaultBlockState());
      BuildUtil.setBlock(level, cx + 1, y + 3, z2 - 2, Blocks.LANTERN.defaultBlockState());

      for (int off = 3; off <= 9; off += 3) {
         BuildUtil.setBlock(level, x - 2, y + 1, z - off, Blocks.COBBLESTONE_WALL.defaultBlockState());
         BuildUtil.setBlock(level, x - 2, y + 2, z - off, Blocks.CARVED_PUMPKIN.defaultBlockState());
         BuildUtil.setBlock(level, x2 + 2, y + 1, z - off, Blocks.COBBLESTONE_WALL.defaultBlockState());
         BuildUtil.setBlock(level, x2 + 2, y + 2, z - off, Blocks.CARVED_PUMPKIN.defaultBlockState());
      }
   }

   private static void zakkyo(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      long seed = (long)x * 2654435761L ^ (long)z * 1234567891L ^ (long)s * 9876543211L;
      Random rng = new Random(seed);
      int variant = rng.nextInt(6);
      int fh = 4;
      int floors = 4 + rng.nextInt(5);
      BlockState[][] palettes = new BlockState[][]{
         {Blocks.GRAY_CONCRETE.defaultBlockState(), Blocks.POLISHED_DEEPSLATE.defaultBlockState()},
         {Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState(), Blocks.DEEPSLATE_BRICKS.defaultBlockState()},
         {Blocks.WHITE_TERRACOTTA.defaultBlockState(), Blocks.STONE_BRICKS.defaultBlockState()},
         {Blocks.BROWN_TERRACOTTA.defaultBlockState(), Blocks.DARK_OAK_LOG.defaultBlockState()},
         {Blocks.BLACK_CONCRETE.defaultBlockState(), Blocks.POLISHED_BLACKSTONE.defaultBlockState()},
         {Blocks.RED_TERRACOTTA.defaultBlockState(), Blocks.NETHER_BRICKS.defaultBlockState()}
      };
      BlockState wall = palettes[variant][0];
      BlockState beam = palettes[variant][1];

      BlockState glass = switch (rng.nextInt(4)) {
         case 0 -> Blocks.GLASS.defaultBlockState();
         case 1 -> Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState();
         case 2 -> Blocks.TINTED_GLASS.defaultBlockState();
         default -> Blocks.GRAY_STAINED_GLASS.defaultBlockState();
      };
      clearArea(level, x, y + 1, z, x2, y + floors * fh + 3, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, Blocks.STONE_BRICKS.defaultBlockState());

      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         int top = fy + fh - 1;
         BuildUtil.fill(level, x, fy, z, x2, fy, z2, wall);
         BuildUtil.fill(level, x, fy, z, x, top, z, beam);
         BuildUtil.fill(level, x2, fy, z, x2, top, z, beam);
         BuildUtil.fill(level, x, fy, z2, x, top, z2, beam);
         BuildUtil.fill(level, x2, fy, z2, x2, top, z2, beam);

         for (int yy = fy + 1; yy < top; yy++) {
            for (int xx = x + 1; xx <= x2 - 1; xx++) {
               BlockState s1 = (xx - x) % 3 == 0 ? wall : glass;
               BuildUtil.setBlock(level, xx, yy, z, s1);
               BuildUtil.setBlock(level, xx, yy, z2, s1);
            }

            for (int zz = z + 1; zz <= z2 - 1; zz++) {
               BlockState s1 = (zz - z) % 3 == 0 ? wall : glass;
               BuildUtil.setBlock(level, x, yy, zz, s1);
               BuildUtil.setBlock(level, x2, yy, zz, s1);
            }
         }

         BuildUtil.hollowBox(level, x, top, z, x2, top, z2, beam);
      }

      int roofY = y + 1 + floors * fh;
      BuildUtil.fill(level, x, roofY, z, x2, roofY, z2, Blocks.GRAY_CONCRETE.defaultBlockState());
      BuildUtil.fill(level, x + 1, roofY + 1, z + 1, x + 3, roofY + 2, z + 3, Blocks.IRON_BLOCK.defaultBlockState());
      BuildUtil.fill(level, x2 - 3, roofY + 1, z2 - 3, x2 - 1, roofY + 2, z2 - 1, Blocks.IRON_BLOCK.defaultBlockState());
      BuildUtil.setBlock(level, x + 2, roofY + 3, z + 2, Blocks.REDSTONE_LAMP.defaultBlockState());
      BlockState[][] neonSets = new BlockState[][]{
         {
               Blocks.RED_CONCRETE.defaultBlockState(),
               Blocks.YELLOW_CONCRETE.defaultBlockState(),
               Blocks.LIME_CONCRETE.defaultBlockState(),
               Blocks.MAGENTA_CONCRETE.defaultBlockState(),
               Blocks.LIGHT_BLUE_CONCRETE.defaultBlockState(),
               Blocks.ORANGE_CONCRETE.defaultBlockState()
         },
         {
               Blocks.RED_CONCRETE.defaultBlockState(),
               Blocks.ORANGE_CONCRETE.defaultBlockState(),
               Blocks.PINK_CONCRETE.defaultBlockState(),
               Blocks.MAGENTA_CONCRETE.defaultBlockState(),
               Blocks.RED_CONCRETE.defaultBlockState(),
               Blocks.PINK_CONCRETE.defaultBlockState()
         },
         {
               Blocks.BLUE_CONCRETE.defaultBlockState(),
               Blocks.LIGHT_BLUE_CONCRETE.defaultBlockState(),
               Blocks.CYAN_CONCRETE.defaultBlockState(),
               Blocks.BLUE_CONCRETE.defaultBlockState(),
               Blocks.LIGHT_BLUE_CONCRETE.defaultBlockState(),
               Blocks.CYAN_CONCRETE.defaultBlockState()
         }
      };
      BlockState[] neons = neonSets[rng.nextInt(neonSets.length)];

      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         int top = fy + fh - 1;
         BlockState neon = neons[f % neons.length];

         for (int xx = x + 1; xx <= x2 - 1; xx++) {
            BuildUtil.setBlock(level, xx, top, z - 1, neon);
         }

         BuildUtil.setBlock(level, x2 + 1, fy + 1, z + 1, neon);
         BuildUtil.setBlock(level, x2 + 1, fy + 2, z + 1, neon);
      }

      int cx = (x + x2) / 2;
      BuildUtil.fill(level, cx - 1, y + 1, z, cx + 1, y + 3, z, BuildUtil.air());
      BuildUtil.door(level, cx, y + 1, z, Blocks.DARK_OAK_DOOR, Direction.NORTH);

      int[] tenantOrder = new int[floors];
      tenantOrder[0] = rng.nextInt(2);

      for (int f = 1; f < floors; f++) {
         tenantOrder[f] = rng.nextInt(9);
      }

      for (int f = 0; f < floors; f++) {
         zakkyoFloor(level, x, y + 1 + f * fh, z, x2, z2, fh, tenantOrder[f]);
      }

      // Stairwell ladder in the back corner, through every floor and up onto the roof.
      BuildUtil.fill(level, x2 - 2, y + 2, z2 - 2, x2 - 1, roofY - 1, z2 - 1, BuildUtil.air());
      BuildUtil.ladder(level, x2 - 1, z2 - 1, y + 2, roofY - 1, Direction.WEST);
      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         BuildUtil.setBlock(level, x2 - 2, fy, z2 - 2, Blocks.SMOOTH_STONE.defaultBlockState());
         BuildUtil.setBlock(level, x2 - 2, fy, z2 - 1, Blocks.SMOOTH_STONE.defaultBlockState());
      }
   }

   private static void zakkyoFloor(BlockCanvas l, int x, int fy, int z, int x2, int z2, int fh, int tenant) {
      int top = fy + fh - 1;
      int cx = (x + x2) / 2;
      int cz = (z + z2) / 2;
      switch (tenant) {
         case 0:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.SPRUCE_PLANKS.defaultBlockState());
            BuildUtil.fill(l, x + 2, fy, z2 - 2, x2 - 2, fy, z2 - 2, Blocks.DARK_OAK_PLANKS.defaultBlockState());
            BuildUtil.fill(l, x + 2, fy + 1, z2 - 2, x2 - 2, fy + 1, z2 - 2, Blocks.DARK_OAK_SLAB.defaultBlockState());
            BuildUtil.setBlock(l, cx, fy + 1, z2 - 1, Blocks.SMOKER.defaultBlockState());
            BuildUtil.setBlock(l, cx - 1, fy + 1, z2 - 1, Blocks.CAULDRON.defaultBlockState());
            BuildUtil.setBlock(l, cx + 1, fy + 1, z2 - 1, Blocks.FURNACE.defaultBlockState());

            for (int xx = x + 2; xx <= x2 - 2; xx += 2) {
               BuildUtil.setBlock(l, xx, fy + 1, z2 - 3, Blocks.OAK_FENCE.defaultBlockState());
               BuildUtil.setBlock(l, xx, fy + 2, z2 - 3, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
            }

            BuildUtil.setBlock(l, cx, top - 1, z + 1, Blocks.CHAIN.defaultBlockState());
            BuildUtil.setBlock(l, cx, top - 2, z + 1, Blocks.RED_WOOL.defaultBlockState());
            BuildUtil.setBlock(l, cx - 2, top - 1, z + 1, Blocks.CHAIN.defaultBlockState());
            BuildUtil.setBlock(l, cx - 2, top - 2, z + 1, Blocks.RED_WOOL.defaultBlockState());
            BuildUtil.setBlock(l, cx + 2, top - 1, z + 1, Blocks.CHAIN.defaultBlockState());
            BuildUtil.setBlock(l, cx + 2, top - 2, z + 1, Blocks.RED_WOOL.defaultBlockState());
            break;
         case 1:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.DARK_OAK_PLANKS.defaultBlockState());
            int[][] tables = new int[][]{{x + 2, z + 2}, {x2 - 2, z + 2}, {x + 2, z2 - 2}, {x2 - 2, z2 - 2}};

            for (int[] t : tables) {
               BuildUtil.setBlock(l, t[0], fy + 1, t[1], Blocks.OAK_FENCE.defaultBlockState());
               BuildUtil.setBlock(l, t[0], fy + 2, t[1], Blocks.OAK_PRESSURE_PLATE.defaultBlockState());
               BuildUtil.setBlock(l, t[0] - 1, fy + 1, t[1], Blocks.OAK_STAIRS.defaultBlockState());
               BuildUtil.setBlock(l, t[0] + 1, fy + 1, t[1], Blocks.OAK_STAIRS.defaultBlockState());
            }

            BuildUtil.fill(l, x + 2, fy, z2 - 3, x2 - 2, fy, z2 - 3, Blocks.DARK_OAK_PLANKS.defaultBlockState());
            BuildUtil.setBlock(l, cx, fy + 1, z2 - 2, Blocks.BREWING_STAND.defaultBlockState());

            for (int xx = x + 2; xx <= x2 - 2; xx += 2) {
               BuildUtil.setBlock(l, xx, fy + 1, z2 - 1, Blocks.BARREL.defaultBlockState());
            }

            BuildUtil.setBlock(l, cx, top - 1, cz, Blocks.LANTERN.defaultBlockState());
            break;
         case 2:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.GRAY_WOOL.defaultBlockState());

            for (int zzx = z + 2; zzx <= z2 - 2; zzx += 2) {
               for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
                  BuildUtil.setBlock(l, xx, fy + 1, zzx, Blocks.OAK_PLANKS.defaultBlockState());
                  BuildUtil.setBlock(l, xx + 1, fy + 1, zzx, Blocks.OAK_PLANKS.defaultBlockState());
                  BuildUtil.setBlock(l, xx, fy + 2, zzx, Blocks.DAYLIGHT_DETECTOR.defaultBlockState());
               }
            }

            BuildUtil.setBlock(l, x + 1, fy + 1, z + 1, Blocks.FLOWER_POT.defaultBlockState());
            BuildUtil.setBlock(l, x2 - 1, fy + 1, z + 1, Blocks.FLOWER_POT.defaultBlockState());
            BuildUtil.fill(l, x + 1, fy + 1, z2 - 1, x + 2, fy + 2, z2 - 1, Blocks.WHITE_CONCRETE.defaultBlockState());

            for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
               for (int zzx = z + 2; zzx <= z2 - 2; zzx += 3) {
                  BuildUtil.setBlock(l, xx, top - 1, zzx, Blocks.SEA_LANTERN.defaultBlockState());
               }
            }
            break;
         case 3:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.PURPLE_WOOL.defaultBlockState());
            BuildUtil.fill(l, cx, fy, z + 1, cx, fy, z2 - 1, Blocks.BLACK_WOOL.defaultBlockState());

            for (int side : new int[]{-1, 1}) {
               for (int k = 0; k < 2; k++) {
                  int rx1 = side < 0 ? x + 1 : cx + 1;
                  int rx2 = side < 0 ? cx - 1 : x2 - 1;
                  int rz1 = z + 1 + k * 3;
                  int rz2 = rz1 + 2;
                  if (rz2 <= z2 - 1) {
                     BuildUtil.fill(l, rx1, fy + 1, rz2, rx2, top - 1, rz2, Blocks.PURPLE_TERRACOTTA.defaultBlockState());
                     BuildUtil.fill(l, rx1 + 1, fy + 1, rz1 + 1, rx2 - 1, fy + 1, rz1 + 1, Blocks.RED_WOOL.defaultBlockState());
                     BuildUtil.setBlock(l, (rx1 + rx2) / 2, fy + 1, (rz1 + rz2) / 2, Blocks.OAK_PLANKS.defaultBlockState());
                     BuildUtil.setBlock(l, (rx1 + rx2) / 2, fy + 2, rz1, Blocks.BLACK_CONCRETE.defaultBlockState());
                     BuildUtil.setBlock(l, (rx1 + rx2) / 2, fy + 3, rz1, Blocks.BLACK_CONCRETE.defaultBlockState());
                     BuildUtil.setBlock(l, (rx1 + rx2) / 2, top - 1, (rz1 + rz2) / 2, Blocks.REDSTONE_LAMP.defaultBlockState());
                  }
               }
            }
            break;
         case 4:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.BLACK_WOOL.defaultBlockState());
            BuildUtil.fill(l, x + 2, fy + 1, z + 2, x2 - 2, fy + 1, z + 2, Blocks.POLISHED_DEEPSLATE.defaultBlockState());
            BuildUtil.fill(l, x + 2, fy + 1, z + 2, x + 2, fy + 1, z2 - 2, Blocks.POLISHED_DEEPSLATE.defaultBlockState());
            BuildUtil.fill(l, x + 1, fy + 1, z + 1, x2 - 1, fy + 1, z + 1, Blocks.OAK_PLANKS.defaultBlockState());

            for (int xx = x + 2; xx <= x2 - 2; xx++) {
               BuildUtil.setBlock(l, xx, fy + 2, z + 1, Blocks.BREWING_STAND.defaultBlockState());
            }

            for (int xx = x + 3; xx <= x2 - 2; xx += 2) {
               BuildUtil.setBlock(l, xx, fy + 1, z + 3, Blocks.OAK_FENCE.defaultBlockState());
               BuildUtil.setBlock(l, xx, fy + 2, z + 3, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
            }

            BuildUtil.setBlock(l, x2 - 2, fy + 1, z2 - 2, Blocks.OAK_FENCE.defaultBlockState());
            BuildUtil.setBlock(l, x2 - 2, fy + 2, z2 - 2, Blocks.OAK_PRESSURE_PLATE.defaultBlockState());
            BuildUtil.setBlock(l, cx, top - 1, cz, Blocks.END_ROD.defaultBlockState());
            BuildUtil.setBlock(l, x + 1, top - 1, z + 1, Blocks.REDSTONE_LAMP.defaultBlockState());
            break;
         case 5:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.WHITE_WOOL.defaultBlockState());
            BuildUtil.fill(l, x + 1, fy + 1, z + 1, x + 3, fy + 1, z + 1, Blocks.QUARTZ_BLOCK.defaultBlockState());
            BuildUtil.setBlock(l, x + 2, fy + 2, z + 1, Blocks.OAK_SIGN.defaultBlockState());

            for (int i = 0; i < 3; i++) {
               int bx = x + 2 + i * 2;
               if (bx >= x2 - 1) {
                  break;
               }

               BuildUtil.bed(l, bx, fy + 1, z2 - 3, Blocks.WHITE_BED, Direction.SOUTH);
            }

            for (int i = 1; i < 3; i++) {
               int sx = x + 1 + i * 2;
               if (sx >= x2 - 1) {
                  break;
               }

               BuildUtil.fill(l, sx, fy + 1, z2 - 4, sx, top - 1, z2 - 1, Blocks.WHITE_WOOL.defaultBlockState());
            }

            for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
               BuildUtil.setBlock(l, xx, top - 1, cz, Blocks.SEA_LANTERN.defaultBlockState());
            }
            break;
         case 6:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.BLACK_WOOL.defaultBlockState());

            for (int side : new int[]{0, 1}) {
               int rowZ = side == 0 ? z + 1 : z2 - 1;

               for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
                  int sign = side == 0 ? 1 : -1;
                  BuildUtil.fill(l, xx, fy + 1, rowZ, xx, top - 1, rowZ + sign, Blocks.DARK_OAK_PLANKS.defaultBlockState());
                  BuildUtil.setBlock(l, xx + 1, fy + 1, rowZ, Blocks.OAK_PLANKS.defaultBlockState());
                  BuildUtil.setBlock(l, xx + 1, fy + 2, rowZ, Blocks.BLACK_CONCRETE.defaultBlockState());
                  BuildUtil.setBlock(l, xx + 1, fy + 1, rowZ + sign, Blocks.OAK_STAIRS.defaultBlockState());
               }
            }

            BuildUtil.fill(l, cx - 1, fy + 1, cz, cx + 1, fy + 1, cz, Blocks.IRON_BLOCK.defaultBlockState());
            BuildUtil.setBlock(l, cx, fy + 2, cz, Blocks.CAULDRON.defaultBlockState());

            for (int xx = x + 2; xx <= x2 - 2; xx += 4) {
               BuildUtil.setBlock(l, xx, top, cz, Blocks.SOUL_LANTERN.defaultBlockState());
            }
            break;
         case 7:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.WHITE_TERRACOTTA.defaultBlockState());
            BuildUtil.fill(l, cx, fy, z + 1, cx, fy, z2 - 1, Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState());

            for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
               for (int zz = z + 2; zz <= z2 - 2; zz += 4) {
                  if (xx != cx) {
                     BuildUtil.setBlock(l, xx, fy + 1, zz, Blocks.IRON_BARS.defaultBlockState());
                     BuildUtil.setBlock(l, xx, fy + 2, zz, Blocks.IRON_BARS.defaultBlockState());

                     BlockState cloth = switch ((xx + zz) % 5) {
                        case 0 -> Blocks.PINK_WOOL.defaultBlockState();
                        case 1 -> Blocks.MAGENTA_WOOL.defaultBlockState();
                        case 2 -> Blocks.LIGHT_BLUE_WOOL.defaultBlockState();
                        case 3 -> Blocks.WHITE_WOOL.defaultBlockState();
                        default -> Blocks.PURPLE_WOOL.defaultBlockState();
                     };
                     BuildUtil.setBlock(l, xx - 1, fy + 1, zz, cloth);
                     BuildUtil.setBlock(l, xx + 1, fy + 1, zz, cloth);
                  }
               }
            }

            BuildUtil.fill(l, cx - 1, fy + 1, z + 1, cx + 1, fy + 1, z + 1, Blocks.QUARTZ_BLOCK.defaultBlockState());
            for (int yy = fy + 1; yy <= top - 1; yy++) {
               BuildUtil.fill(l, x + 1, yy, z2 - 3, x + 3, yy, z2 - 3, Blocks.PINK_TERRACOTTA.defaultBlockState());
               BuildUtil.setBlock(l, x + 1, yy, z2 - 2, Blocks.PINK_TERRACOTTA.defaultBlockState());
               BuildUtil.setBlock(l, x + 3, yy, z2 - 2, Blocks.PINK_TERRACOTTA.defaultBlockState());
            }
            BuildUtil.setBlock(l, x + 2, fy + 1, z2 - 2, BuildUtil.air());
            BuildUtil.setBlock(l, x + 2, fy + 2, z2 - 2, BuildUtil.air());
            BuildUtil.door(l, x + 2, fy + 1, z2 - 3, Blocks.OAK_DOOR, Direction.NORTH);

            for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
               for (int zzx = z + 2; zzx <= z2 - 2; zzx += 3) {
                  BuildUtil.setBlock(l, xx, top - 1, zzx, Blocks.PEARLESCENT_FROGLIGHT.defaultBlockState());
               }
            }
            break;
         case 8:
            BuildUtil.fill(l, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState());
            BuildUtil.fill(l, x + 1, fy + 1, z + 2, x + 3, fy + 1, z + 2, Blocks.QUARTZ_BLOCK.defaultBlockState());
            BuildUtil.setBlock(l, x + 2, fy + 2, z + 2, Blocks.OAK_SIGN.defaultBlockState());

            for (int zz = z + 4; zz <= z2 - 2; zz += 2) {
               BuildUtil.setBlock(l, x + 1, fy + 1, zz, Blocks.OAK_STAIRS.defaultBlockState());
               BuildUtil.setBlock(l, x + 2, fy + 1, zz, Blocks.OAK_STAIRS.defaultBlockState());
            }

            for (int i = 0; i < 2; i++) {
               int ux = cx + 1 + i * 3;
               if (ux >= x2 - 1) {
                  break;
               }

               BuildUtil.fill(l, ux + 2, fy + 1, z + 1, ux + 2, top - 1, z2 - 2, Blocks.WHITE_TERRACOTTA.defaultBlockState());
               BuildUtil.bed(l, ux, fy + 1, cz, Blocks.WHITE_BED, Direction.EAST);
               BuildUtil.setBlock(l, ux, top - 1, cz, Blocks.SEA_LANTERN.defaultBlockState());
               BuildUtil.setBlock(l, ux, fy + 1, cz - 1, Blocks.IRON_BLOCK.defaultBlockState());
               BuildUtil.setBlock(l, ux, fy + 2, cz - 1, Blocks.IRON_BARS.defaultBlockState());
            }

            for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
               for (int zz = z + 2; zz <= z2 - 2; zz += 3) {
                  BuildUtil.setBlock(l, xx, top, zz, Blocks.WHITE_CONCRETE.defaultBlockState());
               }
            }

            BuildUtil.setBlock(l, cx, fy + 2, z, Blocks.LIME_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(l, cx - 1, fy + 2, z, Blocks.LIME_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(l, cx + 1, fy + 2, z, Blocks.LIME_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(l, cx, fy + 1, z, Blocks.LIME_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(l, cx, fy + 3, z, Blocks.LIME_CONCRETE.defaultBlockState());
      }
   }

   private static void sento(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      BlockState wall = Blocks.WHITE_TERRACOTTA.defaultBlockState();
      BlockState roof = Blocks.DEEPSLATE_TILES.defaultBlockState();
      BlockState beam = Blocks.STRIPPED_DARK_OAK_LOG.defaultBlockState();
      BlockState tile = Blocks.LIGHT_BLUE_CONCRETE.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 10, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, Blocks.STONE_BRICKS.defaultBlockState());
      BuildUtil.hollowBox(level, x, y + 1, z, x2, y + 5, z2, wall);
      int cx = (x + x2) / 2;

      for (int i = 0; i <= 2; i++) {
         BuildUtil.fill(level, cx - 3 + i, y + 5 + i, z - 1 - i, cx + 3 - i, y + 5 + i, z - 1 - i, roof);
      }

      for (int i = 0; i <= s / 2 + 1; i++) {
         int yy = y + 6 + i;
         BuildUtil.fill(level, x - 1, yy, z + i, x2 + 1, yy, z2 - i, roof);
      }

      BuildUtil.fill(level, x2 - 1, y + 6, z2 - 1, x2 - 1, y + 12, z2 - 1, Blocks.BRICKS.defaultBlockState());
      BuildUtil.setBlock(level, x2 - 1, y + 13, z2 - 1, Blocks.CAMPFIRE.defaultBlockState());
      BuildUtil.fill(level, cx - 1, y + 1, z, cx + 1, y + 3, z, BuildUtil.air());
      BuildUtil.setBlock(level, cx - 1, y + 3, z, Blocks.RED_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 3, z, Blocks.RED_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, cx + 1, y + 3, z, Blocks.RED_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 5, z - 1, Blocks.YELLOW_CONCRETE.defaultBlockState());
      BuildUtil.setBlock(level, cx - 1, y + 5, z - 1, Blocks.YELLOW_CONCRETE.defaultBlockState());
      BuildUtil.setBlock(level, cx + 1, y + 5, z - 1, Blocks.YELLOW_CONCRETE.defaultBlockState());
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x2 - 1, y + 1, z2 - 1, Blocks.SPRUCE_PLANKS.defaultBlockState());
      BuildUtil.fill(level, cx - 1, y + 1, z + 3, cx + 1, y + 1, z + 3, Blocks.DARK_OAK_PLANKS.defaultBlockState());
      BuildUtil.fill(level, cx - 1, y + 2, z + 3, cx + 1, y + 2, z + 3, Blocks.DARK_OAK_SLAB.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 3, z + 3, Blocks.LANTERN.defaultBlockState());
      BuildUtil.fill(level, cx, y + 1, z + 4, cx, y + 4, z2 - 1, wall);

      for (int side : new int[]{-1, 1}) {
         int px1 = side < 0 ? x + 1 : cx + 1;
         int px2 = side < 0 ? cx - 1 : x2 - 1;
         int pz1 = z + 4;
         int pz2 = z2 - 1;
         int mid = (pz1 + pz2) / 2;
         BuildUtil.fill(level, px1, y + 1, pz1, px2, y + 1, mid, Blocks.SPRUCE_PLANKS.defaultBlockState());

         for (int xx = px1 + 1; xx <= px2 - 1; xx++) {
            BuildUtil.setBlock(level, xx, y + 1, pz1 + 1, Blocks.BARREL.defaultBlockState());
            BuildUtil.setBlock(level, xx, y + 2, pz1 + 1, Blocks.BARREL.defaultBlockState());
         }

         BuildUtil.fill(level, px1 + 1, y + 1, mid - 1, px2 - 1, y + 1, mid - 1, Blocks.SPRUCE_SLAB.defaultBlockState());
         BlockState noren = side < 0 ? Blocks.BLUE_WOOL.defaultBlockState() : Blocks.RED_WOOL.defaultBlockState();

         for (int xx = px1; xx <= px2; xx++) {
            BuildUtil.setBlock(level, xx, y + 3, mid, noren);
         }

         BuildUtil.fill(level, px1, y + 1, mid + 1, px2, y + 1, pz2, tile);
         int bx1 = px1 + 1;
         int bx2 = px2 - 1;
         int bz1 = pz2 - 3;
         int bz2 = pz2 - 1;
         BuildUtil.fill(level, bx1 - 1, y, bz1 - 1, bx2 + 1, y, bz2 + 1, Blocks.STONE.defaultBlockState());
         BuildUtil.fill(level, bx1, y + 1, bz1, bx2, y + 1, bz2, Blocks.WATER.defaultBlockState());
         BuildUtil.fill(level, bx1 - 1, y + 1, bz1 - 1, bx2 + 1, y + 1, bz1 - 1, Blocks.SMOOTH_STONE.defaultBlockState());
         BuildUtil.fill(level, bx1 - 1, y + 1, bz2 + 1, bx2 + 1, y + 1, bz2 + 1, Blocks.SMOOTH_STONE.defaultBlockState());
         BuildUtil.setBlock(level, bx1 - 1, y + 1, bz1, Blocks.SMOOTH_STONE.defaultBlockState());
         BuildUtil.setBlock(level, bx2 + 1, y + 1, bz1, Blocks.SMOOTH_STONE.defaultBlockState());
         BuildUtil.setBlock(level, bx1 - 1, y + 1, bz2, Blocks.SMOOTH_STONE.defaultBlockState());
         BuildUtil.setBlock(level, bx2 + 1, y + 1, bz2, Blocks.SMOOTH_STONE.defaultBlockState());

         for (int xx = px1 + 1; xx <= px2 - 1; xx += 2) {
            int zz = mid + 2;
            BuildUtil.setBlock(level, xx, y + 1, zz, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
            BuildUtil.setBlock(level, xx, y + 2, zz + 1, Blocks.IRON_TRAPDOOR.defaultBlockState());
            BuildUtil.setBlock(level, xx, y + 3, zz + 1, Blocks.CAULDRON.defaultBlockState());
         }

         int wallZ = pz2 + 1;
         if (wallZ < z2) {
            for (int xx = px1; xx <= px2; xx++) {
               BuildUtil.setBlock(level, xx, y + 2, wallZ, Blocks.LIGHT_BLUE_CONCRETE.defaultBlockState());
               BuildUtil.setBlock(level, xx, y + 3, wallZ, Blocks.LIGHT_BLUE_CONCRETE.defaultBlockState());
               BuildUtil.setBlock(level, xx, y + 4, wallZ, Blocks.LIGHT_BLUE_CONCRETE.defaultBlockState());
            }

            int fcx = (px1 + px2) / 2;
            BuildUtil.setBlock(level, fcx, y + 3, wallZ, Blocks.WHITE_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(level, fcx - 1, y + 2, wallZ, Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(level, fcx + 1, y + 2, wallZ, Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(level, fcx - 2, y + 2, wallZ, Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(level, fcx + 2, y + 2, wallZ, Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState());
         }

         BuildUtil.setBlock(level, (px1 + px2) / 2, y + 4, mid + 2, Blocks.SEA_LANTERN.defaultBlockState());
         BuildUtil.setBlock(level, (px1 + px2) / 2, y + 4, pz1 + 2, Blocks.SEA_LANTERN.defaultBlockState());
      }
   }

   private static void shibuya109(BlockCanvas level, int x, int y, int z, int s) {
      int r = Math.max(7, s / 2);
      int cx = x + r;
      int cz = z + r;
      int floors = 7;
      int fh = 4;
      BlockState wall = Blocks.PINK_CONCRETE.defaultBlockState();
      BlockState trim = Blocks.MAGENTA_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.WHITE_STAINED_GLASS.defaultBlockState();
      BlockState slab = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      clearArea(level, cx - r - 2, y + 1, cz - r - 2, cx + r + 2, y + floors * fh + 8, cz + r + 2);
      fillCircle(level, cx, cz, r + 1, y, Blocks.SMOOTH_STONE.defaultBlockState());

      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         int top = fy + fh - 1;
         fillCircle(level, cx, cz, r, fy, slab);

         for (int yy = fy + 1; yy < top; yy++) {
            ringCircle(level, cx, cz, r, yy, (yy - fy) % 2 == 0 ? glass : wall);
         }

         ringCircle(level, cx, cz, r, top, trim);
         shibuya109Floor(level, cx, cz, r, fy, fh, f);
      }

      int signY = y + 1 + 2 * fh;
      drawDigit(level, cx - 4, signY, cz - r - 1, 1);
      drawDigit(level, cx, signY, cz - r - 1, 0);
      drawDigit(level, cx + 4, signY, cz - r - 1, 9);

      for (int dx = -2; dx <= 2; dx++) {
         BuildUtil.setBlock(level, cx + dx, y + 1, cz - r, BuildUtil.air());
         BuildUtil.setBlock(level, cx + dx, y + 2, cz - r, BuildUtil.air());
         BuildUtil.setBlock(level, cx + dx, y + 3, cz - r, BuildUtil.air());
      }

      int roofY = y + 1 + floors * fh;
      fillCircle(level, cx, cz, r, roofY, slab);
      BuildUtil.fill(level, cx, roofY + 1, cz, cx, roofY + 5, cz, Blocks.MAGENTA_CONCRETE.defaultBlockState());
      BuildUtil.setBlock(level, cx, roofY + 6, cz, Blocks.REDSTONE_LAMP.defaultBlockState());
      ringCircle(level, cx, cz, r, roofY + 1, Blocks.IRON_BARS.defaultBlockState());

      // Spiral staircase around the central column, from the ground floor up onto the roof.
      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         BuildUtil.fill(level, cx - 2, fy + 1, cz - 2, cx + 2, fy + fh - 2, cz + 2, BuildUtil.air());
      }
      BuildUtil.spiralStair(level, cx, cz, y + 2, roofY, Blocks.QUARTZ_STAIRS, Blocks.MAGENTA_CONCRETE.defaultBlockState());
   }

   private static void shibuya109Floor(BlockCanvas l, int cx, int cz, int r, int fy, int fh, int floor) {
      int top = fy + fh - 1;
      BlockState[] rackColors = new BlockState[]{
         Blocks.PINK_WOOL.defaultBlockState(),
         Blocks.MAGENTA_WOOL.defaultBlockState(),
         Blocks.LIGHT_BLUE_WOOL.defaultBlockState(),
         Blocks.PURPLE_WOOL.defaultBlockState(),
         Blocks.WHITE_WOOL.defaultBlockState(),
         Blocks.YELLOW_WOOL.defaultBlockState(),
         Blocks.LIME_WOOL.defaultBlockState()
      };
      BlockState rack = rackColors[floor % rackColors.length];

      for (int dx = -r + 2; dx <= r - 2; dx += 2) {
         for (int dz = -r + 2; dz <= r - 2; dz += 2) {
            if (Math.abs(dx) + Math.abs(dz) >= 2) {
               int dist2 = dx * dx + dz * dz;
               if (dist2 <= (r - 1) * (r - 1)) {
                  BuildUtil.setBlock(l, cx + dx, fy + 1, cz + dz, Blocks.STRIPPED_BIRCH_LOG.defaultBlockState());
                  BuildUtil.setBlock(l, cx + dx, fy + 2, cz + dz, rack);
               }
            }
         }
      }

      BuildUtil.setBlock(l, cx + r - 2, fy + 2, cz, Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState());
      BuildUtil.setBlock(l, cx + r - 2, fy + 3, cz, Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState());
      BuildUtil.setBlock(l, cx - r + 2, fy + 2, cz, Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState());
      BuildUtil.setBlock(l, cx - r + 2, fy + 3, cz, Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState());
      BuildUtil.fill(l, cx + 3, fy + 1, cz - r + 2, cx + 5, fy + 1, cz - r + 2, Blocks.QUARTZ_BLOCK.defaultBlockState());
      BuildUtil.setBlock(l, cx + 4, fy + 2, cz - r + 2, Blocks.FURNACE.defaultBlockState());

      for (int dx = -r + 3; dx <= r - 3; dx += 3) {
         for (int dzx = -r + 3; dzx <= r - 3; dzx += 3) {
            if (dx * dx + dzx * dzx <= (r - 2) * (r - 2)) {
               BuildUtil.setBlock(l, cx + dx, top - 1, cz + dzx, Blocks.GLOWSTONE.defaultBlockState());
            }
         }
      }
   }

   private static void fillCircle(BlockCanvas l, int cx, int cz, int r, int y, BlockState b) {
      for (int dx = -r; dx <= r; dx++) {
         for (int dz = -r; dz <= r; dz++) {
            if (dx * dx + dz * dz <= r * r) {
               BuildUtil.setBlock(l, cx + dx, y, cz + dz, b);
            }
         }
      }
   }

   private static void ringCircle(BlockCanvas l, int cx, int cz, int r, int y, BlockState b) {
      for (int dx = -r; dx <= r; dx++) {
         for (int dz = -r; dz <= r; dz++) {
            int d2 = dx * dx + dz * dz;
            if (d2 <= r * r && d2 > (r - 1) * (r - 1)) {
               BuildUtil.setBlock(l, cx + dx, y, cz + dz, b);
            }
         }
      }
   }

   private static void drawDigit(BlockCanvas l, int x0, int y0, int wallZ, int digit) {
      String[][] digits = new String[][]{
         {"111", "1.1", "1.1", "1.1", "111"},
         {".1.", "11.", ".1.", ".1.", "111"},
         {"111", "..1", "111", "1..", "111"},
         {"111", "..1", "111", "..1", "111"},
         {"1.1", "1.1", "111", "..1", "..1"},
         {"111", "1..", "111", "..1", "111"},
         {"111", "1..", "111", "1.1", "111"},
         {"111", "..1", "..1", "..1", "..1"},
         {"111", "1.1", "111", "1.1", "111"},
         {"111", "1.1", "111", "..1", "111"}
      };
      BlockState on = Blocks.RED_CONCRETE.defaultBlockState();
      String[] g = digits[digit % 10];

      for (int row = 0; row < 5; row++) {
         String line = g[row];

         for (int col = 0; col < 3; col++) {
            if (line.charAt(col) == '1') {
               BuildUtil.setBlock(l, x0 - 1 + col, y0 + (4 - row), wallZ, on);
            }
         }
      }
   }

   private static void department(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      int floors = 5;
      int fh = 5;
      BlockState wall = Blocks.QUARTZ_BLOCK.defaultBlockState();
      BlockState trim = Blocks.POLISHED_ANDESITE.defaultBlockState();
      BlockState glass = Blocks.GLASS.defaultBlockState();
      BlockState slab = Blocks.SMOOTH_QUARTZ.defaultBlockState();
      BlockState carpet = Blocks.RED_WOOL.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + floors * fh + 8, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, trim);

      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         int top = fy + fh - 1;
         BuildUtil.fill(level, x, fy, z, x2, fy, z2, slab);
         BuildUtil.fill(level, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, carpet);
         BuildUtil.hollowBox(level, x, fy, z, x2, top, z2, wall);

         for (int yy = fy + 2; yy <= top - 1; yy++) {
            for (int xx = x + 2; xx <= x2 - 2; xx++) {
               boolean pillar = (xx - x) % 5 == 0;
               if (!pillar) {
                  BuildUtil.setBlock(level, xx, yy, z, glass);
                  BuildUtil.setBlock(level, xx, yy, z2, glass);
               }
            }

            for (int zz = z + 2; zz <= z2 - 2; zz++) {
               boolean pillar = (zz - z) % 5 == 0;
               if (!pillar) {
                  BuildUtil.setBlock(level, x, yy, zz, glass);
                  BuildUtil.setBlock(level, x2, yy, zz, glass);
               }
            }
         }

         departmentFloor(level, x, fy, z, x2, z2, fh, f);
      }

      int cx = (x + x2) / 2;
      int cz = (z + z2) / 2;

      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         BuildUtil.fill(level, cx - 2, fy, cz - 2, cx + 2, fy + fh - 1, cz + 2, BuildUtil.air());

         for (int xxx = cx - 2; xxx <= cx + 2; xxx++) {
            for (int zzx = cz - 2; zzx <= cz + 2; zzx++) {
               boolean edge = xxx == cx - 2 || xxx == cx + 2 || zzx == cz - 2 || zzx == cz + 2;
               if (edge) {
                  BuildUtil.setBlock(level, xxx, fy, zzx, slab);
               }

               if (edge) {
                  BuildUtil.setBlock(level, xxx, fy + 1, zzx, Blocks.IRON_BARS.defaultBlockState());
               }
            }
         }
      }

      // Escalators (as stairs) on both sides of the atrium: up towards the south, down towards the north.
      for (int f = 0; f < floors - 1; f++) {
         int fy = y + 1 + f * fh;

         for (int i = 0; i < fh; i++) {
            BuildUtil.setBlock(level, cx + 3, fy + 1 + i, cz - 2 + i, BuildUtil.stairs(Blocks.POLISHED_ANDESITE_STAIRS, Direction.SOUTH));
            BuildUtil.fill(level, cx + 3, fy + 2 + i, cz - 2 + i, cx + 3, fy + 4 + i, cz - 2 + i, BuildUtil.air());
            BuildUtil.setBlock(level, cx - 3, fy + 1 + i, cz + 2 - i, BuildUtil.stairs(Blocks.POLISHED_ANDESITE_STAIRS, Direction.NORTH));
            BuildUtil.fill(level, cx - 3, fy + 2 + i, cz + 2 - i, cx - 3, fy + 4 + i, cz + 2 - i, BuildUtil.air());
         }
      }

      int roofY = y + 1 + floors * fh;
      BuildUtil.fill(level, x, roofY, z, x2, roofY, z2, slab);
      BuildUtil.hollowBox(level, x, roofY + 1, z, x2, roofY + 1, z2, Blocks.IRON_BARS.defaultBlockState());
      BuildUtil.fill(level, x + 2, roofY, z + 2, x2 - 2, roofY, z2 - 2, Blocks.GRASS_BLOCK.defaultBlockState());
      BuildUtil.fill(level, cx - 1, roofY, cz - 1, cx + 1, roofY, cz + 1, Blocks.STONE.defaultBlockState());
      BuildUtil.setBlock(level, cx, roofY, cz, Blocks.WATER.defaultBlockState());
      BuildUtil.setBlock(level, cx, roofY + 1, cz, Blocks.SMOOTH_STONE_SLAB.defaultBlockState());

      for (int[] p : new int[][]{{x + 3, z + 3}, {x2 - 3, z + 3}, {x + 3, z2 - 3}, {x2 - 3, z2 - 3}}) {
         BuildUtil.setBlock(level, p[0], roofY + 1, p[1], Blocks.OAK_LOG.defaultBlockState());
         BuildUtil.setBlock(level, p[0], roofY + 2, p[1], Blocks.OAK_LOG.defaultBlockState());
         BuildUtil.setBlock(level, p[0], roofY + 3, p[1], Blocks.OAK_LEAVES.defaultBlockState());

         for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
               BuildUtil.setBlock(level, p[0] + dx, roofY + 4, p[1] + dz, Blocks.OAK_LEAVES.defaultBlockState());
            }
         }
      }

      for (int[] p : new int[][]{{cx - 3, cz}, {cx + 3, cz}, {cx, cz - 3}, {cx, cz + 3}}) {
         BuildUtil.setBlock(level, p[0], roofY + 1, p[1], Blocks.OAK_STAIRS.defaultBlockState());
      }

      BuildUtil.fill(level, x + 1, roofY + 1, z + 1, x + 2, roofY + 3, z + 1, Blocks.RED_CONCRETE.defaultBlockState());
      BuildUtil.setBlock(level, x + 1, roofY + 4, z + 1, Blocks.YELLOW_CONCRETE.defaultBlockState());
      BuildUtil.fill(level, cx - 2, y + 1, z, cx + 2, y + 4, z, BuildUtil.air());
      BuildUtil.fill(level, cx - 3, y + 5, z - 2, cx + 3, y + 5, z, trim);
      BuildUtil.fill(level, cx - 3, y + floors * fh - 1, z - 1, cx + 3, y + floors * fh - 1, z - 1, Blocks.RED_CONCRETE.defaultBlockState());
      BuildUtil.fill(level, cx - 3, y + floors * fh, z - 1, cx + 3, y + floors * fh, z - 1, Blocks.GOLD_BLOCK.defaultBlockState());
   }

   private static void departmentFloor(BlockCanvas l, int x, int fy, int z, int x2, int z2, int fh, int floor) {
      int top = fy + fh - 1;
      int cx = (x + x2) / 2;
      int cz = (z + z2) / 2;
      switch (floor) {
         case 0:
            for (int ix = x + 2; ix <= x2 - 2; ix += 5) {
               for (int izxxxx = z + 2; izxxxx <= z2 - 2; izxxxx += 5) {
                  if (Math.abs(ix - cx) >= 4 || Math.abs(izxxxx - cz) >= 4) {
                     BuildUtil.fill(l, ix, fy + 1, izxxxx, ix + 1, fy + 1, izxxxx + 1, Blocks.QUARTZ_BLOCK.defaultBlockState());
                     BuildUtil.setBlock(l, ix, fy + 2, izxxxx, Blocks.FLOWER_POT.defaultBlockState());
                     BuildUtil.setBlock(l, ix + 1, fy + 2, izxxxx + 1, Blocks.BREWING_STAND.defaultBlockState());
                  }
               }
            }
            break;
         case 1:
            BlockState[] racks = new BlockState[]{
               Blocks.PINK_WOOL.defaultBlockState(), Blocks.RED_WOOL.defaultBlockState(), Blocks.WHITE_WOOL.defaultBlockState(), Blocks.MAGENTA_WOOL.defaultBlockState()
            };
            int i = 0;

            for (int ix = x + 2; ix <= x2 - 2; ix += 3) {
               for (int izxxx = z + 2; izxxx <= z2 - 2; izxxx += 3) {
                  if (Math.abs(ix - cx) >= 4 || Math.abs(izxxx - cz) >= 4) {
                     BuildUtil.setBlock(l, ix, fy + 1, izxxx, Blocks.STRIPPED_BIRCH_LOG.defaultBlockState());
                     BuildUtil.setBlock(l, ix, fy + 2, izxxx, racks[i++ % racks.length]);
                  }
               }
            }
            break;
         case 2:
            for (int ix = x + 2; ix <= x2 - 2; ix += 3) {
               for (int izxx = z + 2; izxx <= z2 - 2; izxx += 3) {
                  if (Math.abs(ix - cx) >= 4 || Math.abs(izxx - cz) >= 4) {
                     BuildUtil.setBlock(l, ix, fy + 1, izxx, Blocks.STRIPPED_BIRCH_LOG.defaultBlockState());
                     BuildUtil.setBlock(l, ix, fy + 2, izxx, Blocks.BLACK_WOOL.defaultBlockState());
                  }
               }
            }

            for (int ix = x + 2; ix <= x + 6; ix += 2) {
               BuildUtil.setBlock(l, ix, fy + 2, z + 1, Blocks.BLACK_CONCRETE.defaultBlockState());
               BuildUtil.setBlock(l, ix, fy + 3, z + 1, Blocks.BLACK_CONCRETE.defaultBlockState());
            }
            break;
         case 3:
            for (int ix = x + 2; ix <= x2 - 2; ix += 3) {
               for (int izx = z + 2; izx <= z2 - 2; izx += 4) {
                  if (Math.abs(ix - cx) >= 4 || Math.abs(izx - cz) >= 4) {
                     BuildUtil.fill(l, ix, fy + 1, izx, ix + 1, fy + 1, izx + 1, Blocks.BLUE_ICE.defaultBlockState());
                     BuildUtil.fill(l, ix, fy + 2, izx, ix + 1, fy + 2, izx + 1, Blocks.GLASS.defaultBlockState());
                  }
               }
            }

            BuildUtil.fill(l, x + 2, fy + 1, z2 - 2, x + 5, fy + 1, z2 - 1, Blocks.DARK_OAK_PLANKS.defaultBlockState());
            BuildUtil.setBlock(l, x + 3, fy + 2, z2 - 2, Blocks.SMOKER.defaultBlockState());
            BuildUtil.setBlock(l, x + 4, fy + 2, z2 - 2, Blocks.CAKE.defaultBlockState());
            break;
         case 4:
            for (int ix = x + 3; ix <= x2 - 3; ix += 4) {
               for (int iz = z + 3; iz <= z2 - 3; iz += 4) {
                  if (Math.abs(ix - cx) >= 4 || Math.abs(iz - cz) >= 4) {
                     BuildUtil.setBlock(l, ix, fy + 1, iz, Blocks.OAK_FENCE.defaultBlockState());
                     BuildUtil.setBlock(l, ix, fy + 2, iz, Blocks.OAK_PRESSURE_PLATE.defaultBlockState());
                     BuildUtil.setBlock(l, ix - 1, fy + 1, iz, Blocks.OAK_STAIRS.defaultBlockState());
                     BuildUtil.setBlock(l, ix + 1, fy + 1, iz, Blocks.OAK_STAIRS.defaultBlockState());
                  }
               }
            }

            BuildUtil.fill(l, x + 2, fy + 1, z + 1, x2 - 2, fy + 1, z + 1, Blocks.SMOOTH_STONE.defaultBlockState());

            for (int ix = x + 3; ix <= x2 - 3; ix += 3) {
               BuildUtil.setBlock(l, ix, fy + 2, z + 1, Blocks.FURNACE.defaultBlockState());
               BuildUtil.setBlock(l, ix + 1, fy + 2, z + 1, Blocks.SMOKER.defaultBlockState());
            }
      }

      for (int ix = x + 2; ix <= x2 - 2; ix += 4) {
         for (int izxxxxx = z + 2; izxxxxx <= z2 - 2; izxxxxx += 4) {
            if (Math.abs(ix - cx) >= 3 || Math.abs(izxxxxx - cz) >= 3) {
               BuildUtil.setBlock(l, ix, top - 1, izxxxxx, Blocks.GLOWSTONE.defaultBlockState());
            }
         }
      }
   }


   private static void park(BlockCanvas level, int x, int y, int z, int s) {
      int x2 = x + s - 1;
      int z2 = z + s - 1;
      int cx = (x + x2) / 2;
      int cz = (z + z2) / 2;
      clearArea(level, x, y + 1, z, x2, y + 10, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, Blocks.GRASS_BLOCK.defaultBlockState());
      BlockState path = Blocks.DIRT_PATH.defaultBlockState();
      BlockState hedge = Blocks.OAK_LEAVES.defaultBlockState();

      // Hedge round the edge with an opening in the middle of every side.
      for (int xx = x; xx <= x2; xx++) {
         for (int zz = z; zz <= z2; zz++) {
            boolean edge = xx == x || xx == x2 || zz == z || zz == z2;
            boolean gate = Math.abs(xx - cx) <= 1 || Math.abs(zz - cz) <= 1;
            if (edge && !gate) {
               BuildUtil.setBlock(level, xx, y + 1, zz, hedge);
            }
            if (Math.abs(xx - cx) <= 1 || Math.abs(zz - cz) <= 1) {
               BuildUtil.setBlock(level, xx, y, zz, path);
            }
         }
      }

      // Fountain in the middle.
      int r = Math.max(2, Math.min(3, s / 6));
      for (int dx = -r; dx <= r; dx++) {
         for (int dz = -r; dz <= r; dz++) {
            boolean rim = Math.abs(dx) == r || Math.abs(dz) == r;
            BuildUtil.setBlock(level, cx + dx, y, cz + dz, Blocks.STONE_BRICKS.defaultBlockState());
            BuildUtil.setBlock(level, cx + dx, y + 1, cz + dz, rim ? Blocks.STONE_BRICK_SLAB.defaultBlockState()
               .setValue(net.minecraft.world.level.block.SlabBlock.WATERLOGGED, false) : Blocks.WATER.defaultBlockState());
         }
      }
      BuildUtil.fill(level, cx, y + 1, cz, cx, y + 2, cz, Blocks.CHISELED_QUARTZ_BLOCK.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 3, cz, Blocks.SEA_LANTERN.defaultBlockState());

      // Cherry trees in each quarter, with benches and lamps along the paths.
      int q = Math.max(3, s / 4);
      for (int[] c : new int[][]{{x + q, z + q}, {x2 - q, z + q}, {x + q, z2 - q}, {x2 - q, z2 - q}}) {
         if (Math.abs(c[0] - cx) > 2 && Math.abs(c[1] - cz) > 2) {
            sakura(level, c[0], y + 1, c[1]);
         }
      }
      for (int d = r + 2; d < s / 2 - 1; d += 4) {
         BuildUtil.setBlock(level, cx - 2, y + 1, cz - d, BuildUtil.stairs(Blocks.SPRUCE_STAIRS, Direction.WEST));
         BuildUtil.setBlock(level, cx + 2, y + 1, cz + d, BuildUtil.stairs(Blocks.SPRUCE_STAIRS, Direction.EAST));
         BuildUtil.fill(level, cx + 2, y + 1, cz - d, cx + 2, y + 3, cz - d, Blocks.DARK_OAK_FENCE.defaultBlockState());
         BuildUtil.setBlock(level, cx + 2, y + 4, cz - d, Blocks.LANTERN.defaultBlockState());
         BuildUtil.fill(level, cx - 2, y + 1, cz + d, cx - 2, y + 3, cz + d, Blocks.DARK_OAK_FENCE.defaultBlockState());
         BuildUtil.setBlock(level, cx - 2, y + 4, cz + d, Blocks.LANTERN.defaultBlockState());
      }

      // Flower beds and a sandpit.
      BlockState[] flowers = {Blocks.RED_TULIP.defaultBlockState(), Blocks.POPPY.defaultBlockState(), Blocks.DANDELION.defaultBlockState(),
         Blocks.CORNFLOWER.defaultBlockState(), Blocks.OXEYE_DAISY.defaultBlockState(), Blocks.ALLIUM.defaultBlockState()};
      for (int xx = x + 2; xx <= x2 - 2; xx++) {
         for (int zz = z + 2; zz <= z2 - 2; zz++) {
            boolean onPath = Math.abs(xx - cx) <= 2 || Math.abs(zz - cz) <= 2;
            if (!onPath && level.get(xx, y + 1, zz).isAir() && Math.floorMod(xx * 7 + zz * 13, 11) == 0) {
               BuildUtil.setBlock(level, xx, y + 1, zz, flowers[Math.floorMod(xx + zz, flowers.length)]);
            }
         }
      }
      if (s >= 14) {
         BuildUtil.fill(level, x2 - 4, y, z + 2, x2 - 2, y, z + 4, Blocks.SAND.defaultBlockState());
         BuildUtil.fill(level, x2 - 4, y + 1, z + 2, x2 - 2, y + 1, z + 4, BuildUtil.air());
      }
   }

   private static void sakura(BlockCanvas level, int x, int y, int z) {
      BlockState log = Blocks.CHERRY_LOG.defaultBlockState();
      BlockState leaves = Blocks.CHERRY_LEAVES.defaultBlockState();
      BuildUtil.fill(level, x, y, z, x, y + 3, z, log);
      for (int dx = -2; dx <= 2; dx++) {
         for (int dz = -2; dz <= 2; dz++) {
            for (int dy = 3; dy <= 5; dy++) {
               int d = dx * dx + dz * dz + (dy - 4) * (dy - 4) * 2;
               if (d <= 6 && level.get(x + dx, y + dy, z + dz).isAir()) {
                  BuildUtil.setBlock(level, x + dx, y + dy, z + dz, leaves);
               }
            }
         }
      }
      BuildUtil.setBlock(level, x, y + 4, z, log);
   }

   private static void koban(BlockCanvas level, int x, int y, int z, int s) {
      int size = Math.max(7, Math.min(s, 10));
      int x2 = x + size - 1;
      int z2 = z + size - 1;
      int cx = (x + x2) / 2;
      BlockState wall = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState trim = Blocks.GRAY_CONCRETE.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + 7, z2);
      BuildUtil.fill(level, x, y, z, x2, y, z2, Blocks.SMOOTH_STONE.defaultBlockState());
      BuildUtil.hollowBox(level, x, y + 1, z, x2, y + 4, z2, wall);
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x2 - 1, y + 1, z2 - 1, Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState());
      BuildUtil.fill(level, x, y + 5, z, x2, y + 5, z2, trim);
      BuildUtil.fill(level, x - 1, y + 5, z - 1, x2 + 1, y + 5, z - 1, trim);
      for (int xx = x + 1; xx <= x2 - 1; xx++) {
         if (xx != cx) {
            BuildUtil.setBlock(level, xx, y + 3, z, Blocks.GLASS_PANE.defaultBlockState());
         }
      }
      BuildUtil.door(level, cx, y + 1, z, Blocks.IRON_DOOR, Direction.NORTH);
      BuildUtil.setBlock(level, cx, y + 1, z - 1, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 2, z + 1, BuildUtil.air());
      BuildUtil.setBlock(level, cx, y + 1, z + 1, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
      // Red lamp over the door, the symbol of a koban.
      BuildUtil.setBlock(level, cx, y + 4, z - 1, Blocks.REDSTONE_LAMP.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 6, z, Blocks.RED_STAINED_GLASS.defaultBlockState());
      BuildUtil.wallSign(level, cx + 1, y + 4, z - 1, Blocks.BIRCH_WALL_SIGN, Direction.NORTH,
         Component.empty(), Component.translatable("citybuilder.sign.koban"), Component.literal("KOBAN"));
      // Desk, chair and a map of the area on the wall.
      BuildUtil.fill(level, x + 2, y + 2, z2 - 2, x2 - 2, y + 2, z2 - 2, Blocks.SPRUCE_PLANKS.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 2, z2 - 1, BuildUtil.stairs(Blocks.SPRUCE_STAIRS, Direction.SOUTH));
      BuildUtil.setBlock(level, x + 1, y + 2, z + 2, Blocks.CARTOGRAPHY_TABLE.defaultBlockState());
      BuildUtil.setBlock(level, x2 - 1, y + 2, z + 2, Blocks.CHEST.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + 4, (z + z2) / 2, Blocks.SEA_LANTERN.defaultBlockState());
   }

   private static void school(BlockCanvas level, int x, int y, int z, int s) {
      int size = Math.max(16, s);
      int x2 = x + size - 1;
      int z2 = z + size - 1;
      int depth = 7;
      int bz1 = z2 - depth + 1;
      int floors = 3;
      int fh = 4;
      int cx = (x + x2) / 2;
      BlockState wall = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState band = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.GLASS.defaultBlockState();
      clearArea(level, x, y + 1, z, x2, y + floors * fh + 6, z2);

      // Sports ground with a running track line, goal and the school gate.
      BuildUtil.fill(level, x, y, z, x2, y, bz1 - 1, Blocks.COARSE_DIRT.defaultBlockState());
      for (int xx = x + 2; xx <= x2 - 2; xx++) {
         BuildUtil.setBlock(level, xx, y, z + 2, Blocks.WHITE_CONCRETE.defaultBlockState());
         BuildUtil.setBlock(level, xx, y, bz1 - 3, Blocks.WHITE_CONCRETE.defaultBlockState());
      }
      for (int zz = z + 2; zz <= bz1 - 3; zz++) {
         BuildUtil.setBlock(level, x + 2, y, zz, Blocks.WHITE_CONCRETE.defaultBlockState());
         BuildUtil.setBlock(level, x2 - 2, y, zz, Blocks.WHITE_CONCRETE.defaultBlockState());
      }
      for (int xx = x; xx <= x2; xx++) {
         if (Math.abs(xx - cx) > 1) {
            BuildUtil.setBlock(level, xx, y + 1, z, Blocks.IRON_BARS.defaultBlockState());
            BuildUtil.setBlock(level, xx, y + 2, z, Blocks.IRON_BARS.defaultBlockState());
         }
      }
      BuildUtil.fill(level, cx - 2, y + 1, z, cx - 2, y + 3, z, Blocks.STONE_BRICKS.defaultBlockState());
      BuildUtil.fill(level, cx + 2, y + 1, z, cx + 2, y + 3, z, Blocks.STONE_BRICKS.defaultBlockState());
      BuildUtil.wallSign(level, cx - 2, y + 2, z - 1, Blocks.SPRUCE_WALL_SIGN, Direction.NORTH,
         Component.empty(), Component.literal(StationBuilder.defaultName(x, z)), Component.translatable("citybuilder.sign.school"));
      BuildUtil.fill(level, x + 1, y + 1, z + 1, x + 1, y + 9, z + 1, Blocks.IRON_BARS.defaultBlockState());
      BuildUtil.setBlock(level, x + 1, y + 9, z + 2, Blocks.WHITE_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, x + 1, y + 8, z + 2, Blocks.RED_WOOL.defaultBlockState());

      // The school building along the back of the plot.
      for (int f = 0; f < floors; f++) {
         int fy = y + f * fh;
         BuildUtil.fill(level, x, fy, bz1, x2, fy, z2, f == 0 ? Blocks.STONE_BRICKS.defaultBlockState() : band);
         BuildUtil.fill(level, x + 1, fy, bz1 + 1, x2 - 1, fy, z2 - 1, Blocks.OAK_PLANKS.defaultBlockState());
         for (int yy = fy + 1; yy < fy + fh; yy++) {
            for (int xx = x; xx <= x2; xx++) {
               boolean pillar = (xx - x) % 4 == 0;
               BlockState st = pillar || yy == fy + 1 ? wall : glass;
               BuildUtil.setBlock(level, xx, yy, bz1, st);
               BuildUtil.setBlock(level, xx, yy, z2, st);
            }
            for (int zz = bz1; zz <= z2; zz++) {
               BuildUtil.setBlock(level, x, yy, zz, wall);
               BuildUtil.setBlock(level, x2, yy, zz, wall);
            }
         }
         // Classroom partitions with blackboards and desks, corridor along the back.
         for (int xx = x + 6; xx < x2 - 1; xx += 6) {
            BuildUtil.fill(level, xx, fy + 1, bz1 + 1, xx, fy + fh - 1, z2 - 3, wall);
            BuildUtil.setBlock(level, xx, fy + 1, z2 - 3, BuildUtil.air());
            BuildUtil.setBlock(level, xx, fy + 2, z2 - 3, BuildUtil.air());
         }
         for (int xx = x + 2; xx <= x2 - 2; xx += 2) {
            if ((xx - x) % 6 != 0) {
               BuildUtil.setBlock(level, xx, fy + 1, bz1 + 2, Blocks.BIRCH_FENCE.defaultBlockState());
               BuildUtil.setBlock(level, xx, fy + 2, bz1 + 2, Blocks.BIRCH_PRESSURE_PLATE.defaultBlockState());
               BuildUtil.setBlock(level, xx, fy + 1, bz1 + 3, BuildUtil.stairs(Blocks.BIRCH_STAIRS, Direction.SOUTH));
            }
         }
         for (int xx = x + 3; xx <= x2 - 3; xx += 6) {
            BuildUtil.setBlock(level, xx, fy + fh - 1, bz1 + 3, Blocks.SEA_LANTERN.defaultBlockState());
         }
      }
      int roofY = y + floors * fh;
      BuildUtil.fill(level, x, roofY, bz1, x2, roofY, z2, band);
      for (int xx = x; xx <= x2; xx++) {
         BuildUtil.setBlock(level, xx, roofY + 1, bz1, Blocks.IRON_BARS.defaultBlockState());
         BuildUtil.setBlock(level, xx, roofY + 1, z2, Blocks.IRON_BARS.defaultBlockState());
      }
      // Clock on the front.
      BuildUtil.fill(level, cx - 1, roofY + 1, bz1, cx + 1, roofY + 3, bz1, Blocks.WHITE_CONCRETE.defaultBlockState());
      BuildUtil.setBlock(level, cx, roofY + 2, bz1 - 1, Blocks.BLACK_CONCRETE.defaultBlockState());
      BuildUtil.setBlock(level, cx, roofY + 3, bz1 - 1, Blocks.BLACK_CONCRETE.defaultBlockState());
      BuildUtil.setBlock(level, cx + 1, roofY + 2, bz1 - 1, Blocks.BLACK_CONCRETE.defaultBlockState());
      // Entrance and the stairwell ladder.
      BuildUtil.fill(level, cx - 1, y + 1, bz1, cx + 1, y + 2, bz1, BuildUtil.air());
      BuildUtil.door(level, cx, y + 1, bz1, Blocks.BIRCH_DOOR, Direction.NORTH);
      BuildUtil.ladder(level, x2 - 1, z2 - 1, y + 1, roofY - 1, Direction.WEST);
   }

   public static enum Type {
      HOUSE,
      FARM,
      WAREHOUSE,
      TOWER,
      SHRINE,
      CAFE,
      MANSION,
      DOJO,
      KONBINI,
      HOTSPRING,
      TEMPLE,
      ZAKKYO,
      SENTO,
      SHIBUYA109,
      DEPARTMENT,
      PARK,
      KOBAN,
      SCHOOL;
   }
}

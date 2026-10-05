package com.example.citybuilder.builders;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

public final class SkyscraperBuilder {
   private SkyscraperBuilder() {
   }

   public static void build(BlockCanvas level, SkyscraperBuilder.Type type, int x, int y, int z, int width, int depth, int floors, int floorHeight) {
      if (width < 5) {
         width = 5;
      }

      if (depth < 5) {
         depth = 5;
      }

      if (floors < 2) {
         floors = 2;
      }

      if (floorHeight < 3) {
         floorHeight = 3;
      }

      switch (type) {
         case MODERN:
            buildModern(level, x, y, z, width, depth, floors, floorHeight);
            break;
         case TWIN:
            buildTwin(level, x, y, z, width, depth, floors, floorHeight);
            break;
         case PYRAMID:
            buildPyramid(level, x, y, z, width, depth, floors, floorHeight);
            break;
         case RESIDENTIAL:
            buildResidential(level, x, y, z, width, depth, floors, floorHeight);
            break;
         case HOTEL:
            buildHotel(level, x, y, z, width, depth, floors, floorHeight);
            break;
         case GOOGLE:
            buildGoogle(level, x, y, z, width, depth, floors, floorHeight);
      }
      BuildUtil.RoofStyle roofStyle = switch (type) {
         case MODERN -> BuildUtil.RoofStyle.SPIRE;
         case TWIN -> BuildUtil.RoofStyle.SPIRE;
         case PYRAMID -> BuildUtil.RoofStyle.NONE;
         case RESIDENTIAL -> BuildUtil.RoofStyle.PENTHOUSE;
         case HOTEL -> BuildUtil.RoofStyle.PENTHOUSE;
         case GOOGLE -> BuildUtil.RoofStyle.PENTHOUSE;
      };
      int totalHeight = floors * floorHeight + 10;
      int pad = 3;
      BuildUtil.decorateBuilding(level, x - pad, y, z - pad, x + width + pad, y + totalHeight, z + depth + pad, roofStyle);

      for (int xx = x - pad; xx <= x + width + pad; xx++) {
         for (int zz = z - pad; zz <= z + depth + pad; zz++) {
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

   public static void build(BlockCanvas level, int x, int y, int z, int width, int depth, int floors, int floorHeight) {
      build(level, SkyscraperBuilder.Type.MODERN, x, y, z, width, depth, floors, floorHeight);
   }

   private static void buildModern(BlockCanvas level, int x, int y, int z, int width, int depth, int floors, int floorHeight) {
      BlockState frame = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState slabBlock = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState();
      BlockState darkGlass = Blocks.TINTED_GLASS.defaultBlockState();
      BlockState fin = Blocks.POLISHED_DEEPSLATE.defaultBlockState();
      BlockState pillar = Blocks.POLISHED_ANDESITE.defaultBlockState();
      BlockState podiumWall = Blocks.STONE_BRICKS.defaultBlockState();
      BlockState lamp = Blocks.SEA_LANTERN.defaultBlockState();
      BlockState light = Blocks.GLOWSTONE.defaultBlockState();
      BlockState roof = Blocks.GRAY_CONCRETE.defaultBlockState();
      BlockState crown = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState floorMat = Blocks.POLISHED_DIORITE.defaultBlockState();
      BlockState carpet = Blocks.GRAY_WOOL.defaultBlockState();
      BlockState partition = Blocks.WHITE_TERRACOTTA.defaultBlockState();
      int podiumFloors = Math.max(2, floors / 6);
      int midSetback = Math.max(podiumFloors + 2, floors / 3);
      int highSetback = Math.max(midSetback + 2, floors * 2 / 3);
      int totalHeight = 1 + floors * floorHeight + 6;
      BuildUtil.fill(level, x - 2, y + 1, z - 2, x + width + 1, y + totalHeight, z + depth + 1, BuildUtil.air());
      int pX1 = x - 2;
      int pZ1 = z - 2;
      int pX2 = x + width + 1;
      int pZ2 = z + depth + 1;
      int podiumTopY = y + podiumFloors * floorHeight;
      buildPodium(level, pX1, y, pZ1, pX2, podiumTopY, pZ2, podiumWall, glass, pillar, slabBlock, floorMat, light);
      int t1x1 = x;
      int t1z1 = z;
      int t1x2 = x + width - 1;
      int t1z2 = z + depth - 1;
      int t2x1 = x + 1;
      int t2z1 = z + 1;
      int t2x2 = x + width - 2;
      int t2z2 = z + depth - 2;
      int t3x1 = x + 2;
      int t3z1 = z + 2;
      int t3x2 = x + width - 3;
      int t3z2 = z + depth - 3;

      for (int f = podiumFloors; f < floors; f++) {
         int fy = y + 1 + f * floorHeight;
         int top = fy + floorHeight - 1;
         int ax1;
         int az1;
         int ax2;
         int az2;
         if (f < midSetback) {
            ax1 = t1x1;
            az1 = t1z1;
            ax2 = t1x2;
            az2 = t1z2;
         } else if (f < highSetback) {
            ax1 = t2x1;
            az1 = t2z1;
            ax2 = t2x2;
            az2 = t2z2;
         } else {
            ax1 = t3x1;
            az1 = t3z1;
            ax2 = t3x2;
            az2 = t3z2;
         }

         buildFloor(level, ax1, fy, az1, ax2, top, az2, slabBlock, glass, fin, pillar, light, floorMat, carpet, partition, frame, f);
         if (f == midSetback) {
            buildTerrace(level, t1x1, fy, t1z1, t1x2, t1z2, ax1, az1, ax2, az2);
         } else if (f == highSetback) {
            buildTerrace(level, t2x1, fy, t2z1, t2x2, t2z2, ax1, az1, ax2, az2);
         }
      }

      int crownBaseY = y + 1 + floors * floorHeight;
      buildCrown(level, t3x1, crownBaseY, t3z1, t3x2, t3z2, crown, darkGlass, lamp, frame, roof);
      int entranceX = (pX1 + pX2) / 2;
      Facilities.towerCore(level, x, y, z, width, depth, podiumTopY, crownBaseY);

      for (int dx = -2; dx <= 2; dx++) {
         for (int yy = y + 1; yy <= y + 4; yy++) {
            BuildUtil.setBlock(level, entranceX + dx, yy, pZ1, BuildUtil.air());
         }
      }

      for (int dx = -3; dx <= 3; dx++) {
         BuildUtil.setBlock(level, entranceX + dx, y + 5, pZ1, frame);
         BuildUtil.setBlock(level, entranceX + dx, y + 5, pZ1 - 1, frame);
      }

      BuildUtil.fill(level, entranceX - 2, y + 1, pZ1 + 6, entranceX + 2, y + 1, pZ1 + 6, Blocks.DARK_OAK_PLANKS.defaultBlockState());
      BuildUtil.fill(level, entranceX - 2, y + 2, pZ1 + 6, entranceX + 2, y + 2, pZ1 + 6, Blocks.DARK_OAK_SLAB.defaultBlockState());
   }

   private static void buildPodium(
      BlockCanvas level,
      int x1,
      int y,
      int z1,
      int x2,
      int topY,
      int z2,
      BlockState wall,
      BlockState glass,
      BlockState pillar,
      BlockState slab,
      BlockState floorMat,
      BlockState light
   ) {
      BuildUtil.fill(level, x1, y, z1, x2, y, z2, floorMat);

      for (int yy = y + 1; yy <= topY; yy++) {
         for (int xx = x1; xx <= x2; xx++) {
            boolean isPillar = (xx - x1) % 4 == 0 || xx == x1 || xx == x2;
            BlockState s = isPillar ? pillar : glass;
            if (yy == y + 1 && !isPillar) {
               s = wall;
            }

            BuildUtil.setBlock(level, xx, yy, z1, s);
            BuildUtil.setBlock(level, xx, yy, z2, s);
         }

         for (int zz = z1; zz <= z2; zz++) {
            boolean isPillar = (zz - z1) % 4 == 0 || zz == z1 || zz == z2;
            BlockState s = isPillar ? pillar : glass;
            if (yy == y + 1 && !isPillar) {
               s = wall;
            }

            BuildUtil.setBlock(level, x1, yy, zz, s);
            BuildUtil.setBlock(level, x2, yy, zz, s);
         }
      }

      int height = topY - y;
      int podiumFloors = Math.max(2, height / 5);
      int fh = height / podiumFloors;

      for (int i = 1; i < podiumFloors; i++) {
         int fy = y + i * fh;
         BuildUtil.fill(level, x1 + 1, fy, z1 + 1, x2 - 1, fy, z2 - 1, slab);
      }

      BuildUtil.fill(level, x1, topY, z1, x2, topY, z2, slab);

      for (int xx = x1 + 3; xx <= x2 - 3; xx += 4) {
         for (int zz = z1 + 3; zz <= z2 - 3; zz += 4) {
            BuildUtil.setBlock(level, xx, y + fh - 1, zz, light);
         }
      }
   }

   private static void buildFloor(
      BlockCanvas level,
      int x1,
      int fy,
      int z1,
      int x2,
      int topY,
      int z2,
      BlockState slab,
      BlockState glass,
      BlockState fin,
      BlockState pillar,
      BlockState light,
      BlockState floorMat,
      BlockState carpet,
      BlockState partition,
      BlockState frame,
      int floorIndex
   ) {
      BuildUtil.fill(level, x1, fy, z1, x2, fy, z2, floorMat);
      BuildUtil.fill(level, x1 + 1, fy, z1 + 1, x2 - 1, fy, z2 - 1, carpet);
      BuildUtil.fill(level, x1, fy, z1, x1, topY, z1, pillar);
      BuildUtil.fill(level, x2, fy, z1, x2, topY, z1, pillar);
      BuildUtil.fill(level, x1, fy, z2, x1, topY, z2, pillar);
      BuildUtil.fill(level, x2, fy, z2, x2, topY, z2, pillar);

      for (int yy = fy + 1; yy < topY; yy++) {
         for (int xx = x1 + 1; xx <= x2 - 1; xx++) {
            boolean isFin = (xx - x1) % 3 == 0;
            BlockState s = isFin ? fin : glass;
            BuildUtil.setBlock(level, xx, yy, z1, s);
            BuildUtil.setBlock(level, xx, yy, z2, s);
         }

         for (int zz = z1 + 1; zz <= z2 - 1; zz++) {
            boolean isFin = (zz - z1) % 3 == 0;
            BlockState s = isFin ? fin : glass;
            BuildUtil.setBlock(level, x1, yy, zz, s);
            BuildUtil.setBlock(level, x2, yy, zz, s);
         }
      }

      BuildUtil.hollowBox(level, x1, topY, z1, x2, topY, z2, frame);
      int cx = (x1 + x2) / 2;
      int cz = (z1 + z2) / 2;
      Facilities.elevatorHall(level, cx, fy, cz, topY);

      for (int xx = x1 + 2; xx <= cx - 2; xx++) {
         BuildUtil.setBlock(level, xx, fy + 1, cz - 2, partition);
         BuildUtil.setBlock(level, xx, fy + 2, cz - 2, partition);
      }

      for (int zz = cz + 2; zz <= z2 - 2; zz++) {
         BuildUtil.setBlock(level, cx + 2, fy + 1, zz, partition);
         BuildUtil.setBlock(level, cx + 2, fy + 2, zz, partition);
      }

      for (int xx = x1 + 2; xx <= x2 - 2; xx += 3) {
         for (int zz = z1 + 2; zz <= z2 - 2; zz += 3) {
            if (Math.abs(xx - cx) > 1 || Math.abs(zz - cz) > 1) {
               BuildUtil.setBlock(level, xx, topY - 1, zz, light);
            }
         }
      }

      int deskX = x1 + 3;
      int deskZ = z1 + 3;
      if (deskX + 1 <= x2 - 2 && deskZ <= z2 - 2) {
         BuildUtil.setBlock(level, deskX, fy + 1, deskZ, Blocks.OAK_PLANKS.defaultBlockState());
         BuildUtil.setBlock(level, deskX + 1, fy + 1, deskZ, Blocks.OAK_PLANKS.defaultBlockState());
      }

      int deskX2 = x2 - 4;
      int deskZ2 = z2 - 4;
      if (deskX2 - 1 >= x1 + 1 && deskZ2 >= z1 + 1) {
         BuildUtil.setBlock(level, deskX2, fy + 1, deskZ2, Blocks.OAK_PLANKS.defaultBlockState());
         BuildUtil.setBlock(level, deskX2 - 1, fy + 1, deskZ2, Blocks.OAK_PLANKS.defaultBlockState());
      }
   }

   private static void buildTerrace(BlockCanvas level, int outX1, int y, int outZ1, int outX2, int outZ2, int inX1, int inZ1, int inX2, int inZ2) {
      BlockState deck = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState rail = Blocks.IRON_BARS.defaultBlockState();
      BlockState planter = Blocks.GRASS_BLOCK.defaultBlockState();

      for (int xx = outX1; xx <= outX2; xx++) {
         for (int zz = outZ1; zz <= outZ2; zz++) {
            boolean insideTower = xx >= inX1 && xx <= inX2 && zz >= inZ1 && zz <= inZ2;
            if (!insideTower) {
               BuildUtil.setBlock(level, xx, y, zz, deck);
               boolean edge = xx == outX1 || xx == outX2 || zz == outZ1 || zz == outZ2;
               if (edge) {
                  BuildUtil.setBlock(level, xx, y + 1, zz, rail);
               }
            }
         }
      }

      BuildUtil.setBlock(level, outX1 + 1, y, outZ1 + 1, planter);
      BuildUtil.setBlock(level, outX1 + 1, y + 1, outZ1 + 1, Blocks.AZALEA.defaultBlockState());
      BuildUtil.setBlock(level, outX2 - 1, y, outZ2 - 1, planter);
      BuildUtil.setBlock(level, outX2 - 1, y + 1, outZ2 - 1, Blocks.AZALEA.defaultBlockState());
   }

   private static void buildCrown(
      BlockCanvas level, int x1, int y, int z1, int x2, int z2, BlockState crown, BlockState darkGlass, BlockState lamp, BlockState frame, BlockState roof
   ) {
      BuildUtil.fill(level, x1, y, z1, x2, y, z2, roof);
      int machineH = 4;
      int mx1 = x1 + 1;
      int mz1 = z1 + 1;
      int mx2 = x2 - 1;
      int mz2 = z2 - 1;
      BuildUtil.fill(level, mx1, y + 1, mz1, mx2, y + machineH, mz2, darkGlass);
      BuildUtil.hollowBox(level, mx1, y + 1, mz1, mx2, y + machineH, mz2, crown);
      BuildUtil.fill(level, mx1 + 1, y + 2, mz1 + 1, mx2 - 1, y + machineH - 1, mz2 - 1, BuildUtil.air());
      BuildUtil.fill(level, mx1, y + machineH + 1, mz1, mx2, y + machineH + 1, mz2, crown);
      int cx = (x1 + x2) / 2;
      int cz = (z1 + z2) / 2;
      BuildUtil.fill(level, cx, y + machineH + 2, cz, cx, y + machineH + 6, cz, Blocks.IRON_BARS.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + machineH + 7, cz, Blocks.REDSTONE_LAMP.defaultBlockState());
      BuildUtil.setBlock(level, x1, y + machineH + 2, z1, lamp);
      BuildUtil.setBlock(level, x2, y + machineH + 2, z1, lamp);
      BuildUtil.setBlock(level, x1, y + machineH + 2, z2, lamp);
      BuildUtil.setBlock(level, x2, y + machineH + 2, z2, lamp);
      BuildUtil.hollowBox(level, x1, y + 1, z1, x2, y + 1, z2, frame);
   }

   private static void buildTwin(BlockCanvas level, int x, int y, int z, int width, int depth, int floors, int floorHeight) {
      int towerW = Math.max(6, (width - 4) / 2);
      int gap = width - towerW * 2;
      if (gap < 3) {
         gap = 3;
      }

      int aX2 = x + towerW - 1;
      int bX1 = aX2 + gap + 1;
      int bX2 = bX1 + towerW - 1;
      BlockState glass = Blocks.CYAN_STAINED_GLASS.defaultBlockState();
      BlockState dark = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState frame = Blocks.POLISHED_DEEPSLATE.defaultBlockState();
      BlockState slab = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState light = Blocks.GLOWSTONE.defaultBlockState();
      int totalH = floors * floorHeight + 8;
      BuildUtil.fill(level, x - 1, y + 1, z - 1, bX2 + 1, y + totalH, z + depth, BuildUtil.air());
      buildSlenderTower(level, x, y, z, towerW, depth, floors, floorHeight, glass, dark, frame, slab, light);
      buildSlenderTower(level, bX1, y, z, towerW, depth, floors, floorHeight, glass, dark, frame, slab, light);
      int bridgeY = y + 1 + (floors - 2) * floorHeight;
      int bridgeH = floorHeight;
      BuildUtil.fill(level, aX2 + 1, bridgeY, z + 1, bX1 - 1, bridgeY, z + depth - 2, slab);
      BuildUtil.fill(level, aX2 + 1, bridgeY + floorHeight, z + 1, bX1 - 1, bridgeY + floorHeight, z + depth - 2, slab);

      for (int yy = bridgeY + 1; yy < bridgeY + bridgeH; yy++) {
         for (int xx = aX2 + 1; xx <= bX1 - 1; xx++) {
            BuildUtil.setBlock(level, xx, yy, z + 1, glass);
            BuildUtil.setBlock(level, xx, yy, z + depth - 2, glass);
         }
      }

      BuildUtil.setBlock(level, aX2 + 1, bridgeY, z + 1, frame);
      BuildUtil.setBlock(level, bX1 - 1, bridgeY, z + 1, frame);
      BuildUtil.setBlock(level, aX2 + 1, bridgeY + bridgeH, z + 1, frame);
      BuildUtil.setBlock(level, bX1 - 1, bridgeY + bridgeH, z + 1, frame);
      // Doorways from both towers onto the skybridge.
      int midZ = z + depth / 2;
      BuildUtil.fill(level, aX2, bridgeY + 1, midZ - 1, aX2, bridgeY + 2, midZ + 1, BuildUtil.air());
      BuildUtil.fill(level, bX1, bridgeY + 1, midZ - 1, bX1, bridgeY + 2, midZ + 1, BuildUtil.air());
   }

   private static void buildSlenderTower(
      BlockCanvas level,
      int x,
      int y,
      int z,
      int width,
      int depth,
      int floors,
      int fh,
      BlockState glass,
      BlockState dark,
      BlockState frame,
      BlockState slab,
      BlockState light
   ) {
      int x2 = x + width - 1;
      int z2 = z + depth - 1;
      BuildUtil.fill(level, x, y, z, x2, y, z2, frame);

      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         int top = fy + fh - 1;
         BuildUtil.fill(level, x, fy, z, x2, fy, z2, slab);
         BuildUtil.fill(level, x, fy, z, x, top, z, dark);
         BuildUtil.fill(level, x2, fy, z, x2, top, z, dark);
         BuildUtil.fill(level, x, fy, z2, x, top, z2, dark);
         BuildUtil.fill(level, x2, fy, z2, x2, top, z2, dark);

         for (int yy = fy + 1; yy < top; yy++) {
            for (int xx = x + 1; xx <= x2 - 1; xx++) {
               BlockState s = (xx - x) % 3 == 0 ? dark : glass;
               BuildUtil.setBlock(level, xx, yy, z, s);
               BuildUtil.setBlock(level, xx, yy, z2, s);
            }

            for (int zz = z + 1; zz <= z2 - 1; zz++) {
               BlockState s = (zz - z) % 3 == 0 ? dark : glass;
               BuildUtil.setBlock(level, x, yy, zz, s);
               BuildUtil.setBlock(level, x2, yy, zz, s);
            }
         }

         for (int xx = x + 2; xx <= x2 - 2; xx += 3) {
            for (int zz = z + 2; zz <= z2 - 2; zz += 3) {
               BuildUtil.setBlock(level, xx, top - 1, zz, light);
            }
         }
      }

      int roofY = y + 1 + floors * fh;
      BuildUtil.fill(level, x, roofY, z, x2, roofY, z2, Blocks.GRAY_CONCRETE.defaultBlockState());
      BuildUtil.hollowBox(level, x, roofY + 1, z, x2, roofY + 1, z2, frame);
      int cx = (x + x2) / 2;
      int cz = (z + z2) / 2;
      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         Facilities.elevatorShaftStop(level, cx, fy, cz, fy + fh - 1);
      }
      BuildUtil.fill(level, cx - 1, y + 2, z, cx + 1, y + 3, z, BuildUtil.air());
      BuildUtil.fill(level, cx, roofY + 1, cz, cx, roofY + 6, cz, Blocks.IRON_BARS.defaultBlockState());
      BuildUtil.setBlock(level, cx, roofY + 7, cz, Blocks.REDSTONE_LAMP.defaultBlockState());
   }

   private static void buildPyramid(BlockCanvas level, int x, int y, int z, int width, int depth, int floors, int fh) {
      BlockState glass = Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState();
      BlockState dark = Blocks.POLISHED_BLACKSTONE.defaultBlockState();
      BlockState slab = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState frame = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState light = Blocks.GLOWSTONE.defaultBlockState();
      int totalH = floors * fh + 8;
      BuildUtil.fill(level, x - 1, y + 1, z - 1, x + width, y + totalH, z + depth, BuildUtil.air());
      BuildUtil.fill(level, x, y, z, x + width - 1, y, z + depth - 1, frame);
      int stages = 4;
      int perStage = Math.max(2, floors / stages);

      for (int f = 0; f < floors; f++) {
         int stage = Math.min(stages - 1, f / perStage);
         int x1 = x + stage;
         int x2 = x + width - 1 - stage;
         int z1 = z + stage;
         int z2 = z + depth - 1 - stage;
         if (x2 - x1 < 5 || z2 - z1 < 5) {
            x2 = x1 + 5;
            z2 = z1 + 5;
         }

         int fy = y + 1 + f * fh;
         int top = fy + fh - 1;
         BuildUtil.fill(level, x1, fy, z1, x2, fy, z2, slab);
         BuildUtil.fill(level, x1, fy, z1, x1, top, z1, dark);
         BuildUtil.fill(level, x2, fy, z1, x2, top, z1, dark);
         BuildUtil.fill(level, x1, fy, z2, x1, top, z2, dark);
         BuildUtil.fill(level, x2, fy, z2, x2, top, z2, dark);

         for (int yy = fy + 1; yy < top; yy++) {
            for (int xx = x1 + 1; xx <= x2 - 1; xx++) {
               BuildUtil.setBlock(level, xx, yy, z1, glass);
               BuildUtil.setBlock(level, xx, yy, z2, glass);
            }

            for (int zz = z1 + 1; zz <= z2 - 1; zz++) {
               BuildUtil.setBlock(level, x1, yy, zz, glass);
               BuildUtil.setBlock(level, x2, yy, zz, glass);
            }
         }

         if (f > 0 && f % perStage == 0) {
            BuildUtil.hollowBox(level, x1 - 1, fy - 1, z1 - 1, x2 + 1, fy - 1, z2 + 1, frame);
         }

         int cx = x + (width - 1) / 2;
         int cz = z + (depth - 1) / 2;
         if (cx >= x1 + 1 && cx <= x2 - 1 && cz >= z1 + 1 && cz <= z2 - 1) {
            Facilities.elevatorShaftStop(level, cx, fy, cz, top);
         }

         for (int xx = x1 + 2; xx <= x2 - 2; xx += 3) {
            for (int zz = z1 + 2; zz <= z2 - 2; zz += 3) {
               BuildUtil.setBlock(level, xx, top - 1, zz, light);
            }
         }
      }

      int topY = y + 1 + floors * fh;
      int tcx = x + width / 2;
      int tcz = z + depth / 2;
      BuildUtil.fill(level, tcx, topY, tcz, tcx, topY + 6, tcz, Blocks.IRON_BARS.defaultBlockState());
      BuildUtil.setBlock(level, tcx, topY + 7, tcz, Blocks.REDSTONE_LAMP.defaultBlockState());
      BuildUtil.fill(level, tcx - 1, y + 1, z, tcx + 1, y + 3, z, BuildUtil.air());
   }

   private static void buildResidential(BlockCanvas level, int x, int y, int z, int width, int depth, int floors, int fh) {
      BlockState wall = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.GLASS.defaultBlockState();
      BlockState balcony = Blocks.IRON_BARS.defaultBlockState();
      BlockState slab = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState floorMat = Blocks.OAK_PLANKS.defaultBlockState();
      BlockState partition = Blocks.WHITE_TERRACOTTA.defaultBlockState();
      BlockState light = Blocks.GLOWSTONE.defaultBlockState();
      int x2 = x + width - 1;
      int z2 = z + depth - 1;
      int totalH = floors * fh + 5;
      BuildUtil.fill(level, x - 2, y + 1, z - 2, x2 + 2, y + totalH, z2 + 2, BuildUtil.air());
      BuildUtil.fill(level, x, y, z, x2, y, z2, slab);

      for (int f = 0; f < floors; f++) {
         int fy = y + 1 + f * fh;
         int top = fy + fh - 1;
         BuildUtil.fill(level, x, fy, z, x2, fy, z2, slab);
         BuildUtil.fill(level, x + 1, fy, z + 1, x2 - 1, fy, z2 - 1, floorMat);

         for (int xx = x; xx <= x2; xx++) {
            for (int yy = fy + 1; yy <= top; yy++) {
               boolean pillar = xx == x || xx == x2 || (xx - x) % 4 == 0;
               BlockState s = pillar ? wall : (yy - fy >= 2 ? glass : wall);
               BuildUtil.setBlock(level, xx, yy, z, s);
               BuildUtil.setBlock(level, xx, yy, z2, s);
            }
         }

         for (int zz = z; zz <= z2; zz++) {
            for (int yy = fy + 1; yy <= top; yy++) {
               boolean pillar = zz == z || zz == z2 || (zz - z) % 4 == 0;
               BlockState s = pillar ? wall : (yy - fy >= 2 ? glass : wall);
               BuildUtil.setBlock(level, x, yy, zz, s);
               BuildUtil.setBlock(level, x2, yy, zz, s);
            }
         }

         for (int xx = x + 1; xx <= x2 - 1; xx++) {
            BuildUtil.setBlock(level, xx, fy, z - 1, slab);
            BuildUtil.setBlock(level, xx, fy + 1, z - 1, balcony);
         }

         BuildUtil.setBlock(level, x, fy, z - 1, slab);
         BuildUtil.setBlock(level, x, fy + 1, z - 1, balcony);
         BuildUtil.setBlock(level, x2, fy, z - 1, slab);
         BuildUtil.setBlock(level, x2, fy + 1, z - 1, balcony);
         int sep = Math.max(4, width / 4);
         // Apartments along the front, a corridor along the back wall.
         int corridorZ = z2 - 3;

         for (int sx = x + sep; sx < x2; sx += sep) {
            BuildUtil.fill(level, sx, fy + 1, z + 1, sx, top - 1, corridorZ, partition);
         }

         BuildUtil.fill(level, x + 1, fy + 1, corridorZ, x2 - 1, top - 1, corridorZ, partition);

         for (int sx = x + 1; sx + sep - 2 <= x2 - 1; sx += sep) {
            int rx = sx + 1;
            int rz = z + 2;
            if (rz + 1 < corridorZ) {
               BuildUtil.bed(level, rx, fy + 1, rz + 1, Blocks.RED_BED, Direction.NORTH);
            }
            int doorX = Math.min(sx + sep / 2, x2 - 1);
            if (doorX != sx + sep && level.get(doorX, fy + 1, corridorZ).is(partition.getBlock())) {
               BuildUtil.door(level, doorX, fy + 1, corridorZ, Blocks.OAK_DOOR, Direction.SOUTH);
            }
         }

         Facilities.elevatorShaftStop(level, (x + x2) / 2, fy, z2 - 2, top);

         int cz = (z + z2) / 2;

         for (int xx = x + 1; xx <= x2 - 1; xx += 3) {
            BuildUtil.setBlock(level, xx, top - 1, cz, light);
         }
      }

      int cx = (x + x2) / 2;
      BuildUtil.fill(level, cx - 1, y + 1, z, cx + 1, y + 3, z, BuildUtil.air());
      // Lobby passage from the entrance through the apartments to the corridor and elevator.
      BuildUtil.fill(level, cx - 1, y + 2, z + 1, cx + 1, y + 3, z2 - 2, BuildUtil.air());
      BuildUtil.fill(level, cx - 1, y + 1, z + 1, cx + 1, y + 1, z2 - 2, floorMat);
      BuildUtil.setBlock(level, cx, y + 1, z2 - 2, com.example.citybuilder.blocks.ModBlocks.ELEVATOR.get().defaultBlockState());
      BuildUtil.ladder(level, x2 - 1, z2 - 1, y + 2, y + floors * fh, Direction.WEST);
      int roofY = y + 1 + floors * fh;
      BuildUtil.fill(level, x, roofY, z, x2, roofY, z2, slab);
      BuildUtil.hollowBox(level, x + 2, roofY + 1, z + 2, x + 5, roofY + 4, z + 5, Blocks.CYAN_TERRACOTTA.defaultBlockState());
      BuildUtil.setBlock(level, x2, roofY + 2, z2, Blocks.SEA_LANTERN.defaultBlockState());
      BuildUtil.setBlock(level, x, roofY + 2, z2, Blocks.SEA_LANTERN.defaultBlockState());
      BuildUtil.setBlock(level, x2, roofY + 2, z, Blocks.SEA_LANTERN.defaultBlockState());
   }

   private static void buildHotel(BlockCanvas level, int x, int y, int z, int width, int depth, int floors, int fh) {
      BlockState podium = Blocks.SMOOTH_SANDSTONE.defaultBlockState();
      BlockState wall = Blocks.QUARTZ_BLOCK.defaultBlockState();
      BlockState glass = Blocks.GLASS.defaultBlockState();
      BlockState dark = Blocks.DEEPSLATE_TILES.defaultBlockState();
      BlockState slab = Blocks.SMOOTH_QUARTZ.defaultBlockState();
      BlockState carpet = Blocks.RED_WOOL.defaultBlockState();
      BlockState floorMat = Blocks.POLISHED_DIORITE.defaultBlockState();
      BlockState light = Blocks.GLOWSTONE.defaultBlockState();
      int x2 = x + width - 1;
      int z2 = z + depth - 1;
      int totalH = floors * fh + 10;
      BuildUtil.fill(level, x - 2, y + 1, z - 2, x2 + 2, y + totalH, z2 + 2, BuildUtil.air());
      int podiumH = 3 * fh;
      BuildUtil.fill(level, x - 2, y, z - 2, x2 + 2, y, z2 + 2, podium);
      BuildUtil.hollowBox(level, x - 2, y + 1, z - 2, x2 + 2, y + podiumH, z2 + 2, podium);

      for (int xx = x - 1; xx <= x2 + 1; xx++) {
         for (int yy = y + 2; yy <= y + podiumH - 1; yy++) {
            BuildUtil.setBlock(level, xx, yy, z - 2, glass);
         }
      }

      BuildUtil.fill(level, x - 2, y + podiumH + 1, z - 2, x2 + 2, y + podiumH + 1, z2 + 2, slab);
      int cx = (x + x2) / 2;

      for (int dx = -3; dx <= 3; dx++) {
         BuildUtil.setBlock(level, cx + dx, y + podiumH + 2, z - 3, dark);
         BuildUtil.setBlock(level, cx + dx, y + podiumH + 2, z - 4, dark);
      }

      BuildUtil.fill(level, cx - 2, y + 1, z - 2, cx + 2, y + 4, z - 2, BuildUtil.air());
      BuildUtil.fill(level, x, y + 1, z, x2, y + 1, z2, floorMat);
      BuildUtil.fill(level, x + 2, y + 1, z + 2, x2 - 2, y + 1, z2 - 2, carpet);
      BuildUtil.fill(level, cx - 3, y + 1, z2 - 2, cx + 3, y + 1, z2 - 2, dark);
      BuildUtil.fill(level, cx - 3, y + 2, z2 - 2, cx + 3, y + 2, z2 - 2, Blocks.SMOOTH_QUARTZ_SLAB.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + fh - 1, (z + z2) / 2, Blocks.CHAIN.defaultBlockState());
      BuildUtil.setBlock(level, cx, y + fh - 2, (z + z2) / 2, Blocks.SEA_LANTERN.defaultBlockState());
      int tx1 = x + 2;
      int tx2 = x2 - 2;
      int tz1 = z + 2;
      int tz2 = z2 - 2;
      int towerFloors = floors - 3;

      for (int f = 0; f < towerFloors; f++) {
         int fy = y + podiumH + 2 + f * fh;
         int top = fy + fh - 1;
         BuildUtil.fill(level, tx1, fy, tz1, tx2, fy, tz2, slab);
         BuildUtil.fill(level, tx1 + 1, fy, tz1 + 1, tx2 - 1, fy, tz2 - 1, carpet);

         for (int yy = fy + 1; yy <= top; yy++) {
            for (int xx = tx1; xx <= tx2; xx++) {
               boolean rib = (xx - tx1) % 2 == 0;
               BlockState s = rib ? wall : glass;
               BuildUtil.setBlock(level, xx, yy, tz1, s);
               BuildUtil.setBlock(level, xx, yy, tz2, s);
            }

            for (int zz = tz1; zz <= tz2; zz++) {
               boolean rib = (zz - tz1) % 2 == 0;
               BlockState s = rib ? wall : glass;
               BuildUtil.setBlock(level, tx1, yy, zz, s);
               BuildUtil.setBlock(level, tx2, yy, zz, s);
            }
         }

         int cxT = (tx1 + tx2) / 2;

         for (int zz = tz1 + 3; zz <= tz2 - 1; zz += 3) {
            BuildUtil.fill(level, tx1 + 1, fy + 1, zz, tx2 - 1, top - 1, zz, Blocks.QUARTZ_BLOCK.defaultBlockState());
         }

         // Central corridor with a door into every room on both sides.
         BuildUtil.fill(level, cxT - 1, fy + 1, tz1 + 1, cxT + 1, top - 1, tz2 - 1, Blocks.QUARTZ_BLOCK.defaultBlockState());
         BuildUtil.fill(level, cxT, fy + 1, tz1 + 1, cxT, top - 1, tz2 - 1, BuildUtil.air());

         for (int zz = tz1 + 1; zz + 1 <= tz2 - 1; zz += 3) {
            if (cxT - 1 > tx1 + 1) {
               BuildUtil.door(level, cxT - 1, fy + 1, zz + 1, Blocks.DARK_OAK_DOOR, Direction.EAST);
               if (tx1 + 2 < cxT - 2) {
                  BuildUtil.bed(level, tx1 + 2, fy + 1, zz + 1, Blocks.WHITE_BED, Direction.WEST);
               }
            }
            if (cxT + 1 < tx2 - 1) {
               BuildUtil.door(level, cxT + 1, fy + 1, zz + 1, Blocks.DARK_OAK_DOOR, Direction.WEST);
               if (tx2 - 2 > cxT + 2) {
                  BuildUtil.bed(level, tx2 - 2, fy + 1, zz + 1, Blocks.WHITE_BED, Direction.EAST);
               }
            }
         }

         Facilities.elevatorShaftStop(level, cxT, fy, tz1 + 1, top);

         for (int zzx = tz1 + 1; zzx <= tz2 - 1; zzx += 3) {
            BuildUtil.setBlock(level, cxT, top - 1, zzx, light);
         }
      }

      int roofY = y + podiumH + 2 + towerFloors * fh;
      // Lobby elevator that takes guests up into the tower.
      BuildUtil.setBlock(level, cx, y + 1, tz1 + 1, com.example.citybuilder.blocks.ModBlocks.ELEVATOR.get().defaultBlockState());
      BuildUtil.fill(level, cx, y + podiumH, tz1 + 1, cx, y + podiumH + 1, tz1 + 1, BuildUtil.air());
      BuildUtil.fill(level, tx1, roofY, tz1, tx2, roofY, tz2, slab);
      BuildUtil.hollowBox(level, tx1, roofY + 1, tz1, tx2, roofY + 1, tz2, Blocks.IRON_BARS.defaultBlockState());
      BuildUtil.fill(level, tx1 + 2, roofY + 1, tz1 + 2, tx2 - 2, roofY + 1, tz1 + 2, Blocks.DARK_OAK_PLANKS.defaultBlockState());
      BuildUtil.setBlock(level, (tx1 + tx2) / 2, roofY + 2, tz1 + 2, Blocks.BREWING_STAND.defaultBlockState());
      BuildUtil.setBlock(level, tx1, roofY + 3, tz1, Blocks.REDSTONE_LAMP.defaultBlockState());
      BuildUtil.setBlock(level, tx2, roofY + 3, tz1, Blocks.REDSTONE_LAMP.defaultBlockState());
      BuildUtil.setBlock(level, tx1, roofY + 3, tz2, Blocks.REDSTONE_LAMP.defaultBlockState());
      BuildUtil.setBlock(level, tx2, roofY + 3, tz2, Blocks.REDSTONE_LAMP.defaultBlockState());
   }

   private static void buildGoogle(BlockCanvas level, int x, int y, int z, int width, int depth, int floors, int floorHeight) {
      BlockState frame = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState slabBlock = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.GLASS.defaultBlockState();
      BlockState darkGlass = Blocks.TINTED_GLASS.defaultBlockState();
      BlockState fin = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState pillar = Blocks.QUARTZ_PILLAR.defaultBlockState();
      BlockState podiumWall = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState lamp = Blocks.SEA_LANTERN.defaultBlockState();
      BlockState light = Blocks.SEA_LANTERN.defaultBlockState();
      BlockState roof = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState crown = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState floorMat = Blocks.POLISHED_DIORITE.defaultBlockState();
      BlockState gBlue = Blocks.BLUE_WOOL.defaultBlockState();
      BlockState gRed = Blocks.RED_WOOL.defaultBlockState();
      BlockState gYellow = Blocks.YELLOW_WOOL.defaultBlockState();
      BlockState gGreen = Blocks.GREEN_WOOL.defaultBlockState();
      BlockState[] gColors = new BlockState[]{gBlue, gRed, gYellow, gBlue, gGreen, gRed};
      BlockState partition = Blocks.WHITE_STAINED_GLASS.defaultBlockState();
      int podiumFloors = Math.max(2, floors / 6);
      int midSetback = Math.max(podiumFloors + 2, floors / 3);
      int highSetback = Math.max(midSetback + 2, floors * 2 / 3);
      int totalHeight = 1 + floors * floorHeight + 6;
      BuildUtil.fill(level, x - 2, y + 1, z - 2, x + width + 1, y + totalHeight, z + depth + 1, BuildUtil.air());
      int pX1 = x - 2;
      int pZ1 = z - 2;
      int pX2 = x + width + 1;
      int pZ2 = z + depth + 1;
      int podiumTopY = y + podiumFloors * floorHeight;
      buildPodium(level, pX1, y, pZ1, pX2, podiumTopY, pZ2, podiumWall, glass, pillar, slabBlock, floorMat, light);
      buildGoogleLobby(level, pX1, y, pZ1, pX2, pZ2, gColors);
      int t1x1 = x;
      int t1z1 = z;
      int t1x2 = x + width - 1;
      int t1z2 = z + depth - 1;
      int t2x1 = x + 1;
      int t2z1 = z + 1;
      int t2x2 = x + width - 2;
      int t2z2 = z + depth - 2;
      int t3x1 = x + 2;
      int t3z1 = z + 2;
      int t3x2 = x + width - 3;
      int t3z2 = z + depth - 3;

      for (int f = podiumFloors; f < floors; f++) {
         int fy = y + 1 + f * floorHeight;
         int top = fy + floorHeight - 1;
         int ax1;
         int az1;
         int ax2;
         int az2;
         if (f < midSetback) {
            ax1 = t1x1;
            az1 = t1z1;
            ax2 = t1x2;
            az2 = t1z2;
         } else if (f < highSetback) {
            ax1 = t2x1;
            az1 = t2z1;
            ax2 = t2x2;
            az2 = t2z2;
         } else {
            ax1 = t3x1;
            az1 = t3z1;
            ax2 = t3x2;
            az2 = t3z2;
         }

         buildGoogleFloor(level, ax1, fy, az1, ax2, top, az2, slabBlock, glass, fin, pillar, light, floorMat, partition, frame, f, gColors);
         if (f == midSetback) {
            buildTerrace(level, t1x1, fy, t1z1, t1x2, t1z2, ax1, az1, ax2, az2);
         } else if (f == highSetback) {
            buildTerrace(level, t2x1, fy, t2z1, t2x2, t2z2, ax1, az1, ax2, az2);
         }
      }

      int crownBaseY = y + 1 + floors * floorHeight;
      buildCrown(level, t3x1, crownBaseY, t3z1, t3x2, t3z2, crown, darkGlass, lamp, frame, roof);
      int entranceX = (pX1 + pX2) / 2;
      Facilities.towerCore(level, x, y, z, width, depth, podiumTopY, crownBaseY);

      for (int dx = -2; dx <= 2; dx++) {
         for (int yy = y + 1; yy <= y + 4; yy++) {
            BuildUtil.setBlock(level, entranceX + dx, yy, pZ1, BuildUtil.air());
         }
      }

      for (int dx = -4; dx <= 4; dx++) {
         BuildUtil.setBlock(level, entranceX + dx, y + 5, pZ1, frame);
         BuildUtil.setBlock(level, entranceX + dx, y + 5, pZ1 - 1, frame);
      }

      int signY = y + 6;
      BuildUtil.setBlock(level, entranceX - 4, signY, pZ1 - 1, gBlue);
      BuildUtil.setBlock(level, entranceX - 3, signY, pZ1 - 1, gRed);
      BuildUtil.setBlock(level, entranceX - 2, signY, pZ1 - 1, gYellow);
      BuildUtil.setBlock(level, entranceX - 1, signY, pZ1 - 1, gBlue);
      BuildUtil.setBlock(level, entranceX, signY, pZ1 - 1, gGreen);
      BuildUtil.setBlock(level, entranceX + 1, signY, pZ1 - 1, gRed);

      for (int dx = -4; dx <= 1; dx++) {
         BuildUtil.setBlock(level, entranceX + dx, signY - 1, pZ1 - 1, Blocks.GLOWSTONE.defaultBlockState());
      }

      BuildUtil.fill(level, entranceX - 2, y + 1, pZ1 + 6, entranceX + 2, y + 1, pZ1 + 6, Blocks.WHITE_CONCRETE.defaultBlockState());
      BuildUtil.fill(level, entranceX - 2, y + 2, pZ1 + 6, entranceX + 2, y + 2, pZ1 + 6, Blocks.SMOOTH_QUARTZ_SLAB.defaultBlockState());
      BuildUtil.setBlock(level, entranceX, y + 3, pZ1 + 6, darkGlass);
   }

   private static void buildGoogleLobby(BlockCanvas level, int pX1, int y, int pZ1, int pX2, int pZ2, BlockState[] gColors) {
      for (int xx = pX1 + 1; xx <= pX2 - 1; xx++) {
         for (int zz = pZ1 + 1; zz <= pZ2 - 1; zz++) {
            int idx = Math.floorMod(xx + zz * 3, gColors.length);
            BuildUtil.setBlock(level, xx, y, zz, gColors[idx]);
         }
      }

      BlockState sofa = Blocks.RED_WOOL.defaultBlockState();
      BuildUtil.setBlock(level, pX1 + 2, y + 1, pZ1 + 3, sofa);
      BuildUtil.setBlock(level, pX1 + 3, y + 1, pZ1 + 3, sofa);
      BuildUtil.setBlock(level, pX2 - 2, y + 1, pZ1 + 3, Blocks.BLUE_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, pX2 - 3, y + 1, pZ1 + 3, Blocks.BLUE_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, pX1 + 2, y + 1, pZ2 - 3, Blocks.YELLOW_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, pX1 + 3, y + 1, pZ2 - 3, Blocks.YELLOW_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, pX2 - 2, y + 1, pZ2 - 3, Blocks.GREEN_WOOL.defaultBlockState());
      BuildUtil.setBlock(level, pX2 - 3, y + 1, pZ2 - 3, Blocks.GREEN_WOOL.defaultBlockState());
      int cxL = (pX1 + pX2) / 2;
      int czL = (pZ1 + pZ2) / 2;
      BuildUtil.setBlock(level, cxL, y + 1, czL, Blocks.FLOWER_POT.defaultBlockState());
      BuildUtil.fill(level, pX1 + 2, y + 1, pZ2 - 4, pX1 + 3, y + 1, pZ2 - 4, Blocks.OAK_PLANKS.defaultBlockState());
      BuildUtil.setBlock(level, pX1 + 2, y + 2, pZ2 - 4, Blocks.CAKE.defaultBlockState());
      BuildUtil.setBlock(level, pX1 + 3, y + 2, pZ2 - 4, Blocks.BREWING_STAND.defaultBlockState());
   }

   private static void buildGoogleFloor(
      BlockCanvas level,
      int x1,
      int fy,
      int z1,
      int x2,
      int topY,
      int z2,
      BlockState slab,
      BlockState glass,
      BlockState fin,
      BlockState pillar,
      BlockState light,
      BlockState floorMat,
      BlockState partition,
      BlockState frame,
      int floorIndex,
      BlockState[] gColors
   ) {
      BuildUtil.fill(level, x1, fy, z1, x2, fy, z2, floorMat);

      for (int xx = x1 + 1; xx <= x2 - 1; xx++) {
         for (int zz = z1 + 1; zz <= z2 - 1; zz++) {
            int px = Math.floorDiv(xx - x1, 3);
            int pz = Math.floorDiv(zz - z1, 3);
            int idx = Math.floorMod(px + pz + floorIndex, gColors.length);
            BuildUtil.setBlock(level, xx, fy, zz, gColors[idx]);
         }
      }

      BuildUtil.fill(level, x1, fy, z1, x1, topY, z1, pillar);
      BuildUtil.fill(level, x2, fy, z1, x2, topY, z1, pillar);
      BuildUtil.fill(level, x1, fy, z2, x1, topY, z2, pillar);
      BuildUtil.fill(level, x2, fy, z2, x2, topY, z2, pillar);

      for (int yy = fy + 1; yy < topY; yy++) {
         for (int xx = x1 + 1; xx <= x2 - 1; xx++) {
            boolean isFin = (xx - x1) % 4 == 0;
            BlockState s = isFin ? fin : glass;
            BuildUtil.setBlock(level, xx, yy, z1, s);
            BuildUtil.setBlock(level, xx, yy, z2, s);
         }

         for (int zz = z1 + 1; zz <= z2 - 1; zz++) {
            boolean isFin = (zz - z1) % 4 == 0;
            BlockState s = isFin ? fin : glass;
            BuildUtil.setBlock(level, x1, yy, zz, s);
            BuildUtil.setBlock(level, x2, yy, zz, s);
         }
      }

      BuildUtil.hollowBox(level, x1, topY, z1, x2, topY, z2, frame);
      int cx = (x1 + x2) / 2;
      int cz = (z1 + z2) / 2;
      Facilities.elevatorHall(level, cx, fy, cz, topY);

      int mx1 = x1 + 2;
      int mz1 = z1 + 2;
      int mx2 = Math.min(x2 - 2, mx1 + 3);
      int mz2 = Math.min(z2 - 2, mz1 + 3);
      if (mx2 > mx1 + 1 && mz2 > mz1 + 1) {
         for (int yy = fy + 1; yy <= fy + 3 && yy < topY; yy++) {
            for (int xx = mx1; xx <= mx2; xx++) {
               BuildUtil.setBlock(level, xx, yy, mz1, partition);
               BuildUtil.setBlock(level, xx, yy, mz2, partition);
            }

            for (int zz = mz1; zz <= mz2; zz++) {
               BuildUtil.setBlock(level, mx1, yy, zz, partition);
               BuildUtil.setBlock(level, mx2, yy, zz, partition);
            }
         }

         BuildUtil.setBlock(level, mx1 + 1, fy + 1, mz2, BuildUtil.air());
         BuildUtil.setBlock(level, mx1 + 1, fy + 2, mz2, BuildUtil.air());
         BuildUtil.fill(level, mx1 + 1, fy + 1, mz1 + 1, mx2 - 1, fy + 1, mz2 - 1, Blocks.OAK_PLANKS.defaultBlockState());
         BuildUtil.setBlock(level, mx1 + 1, fy + 2, mz1 + 1, Blocks.REDSTONE_LAMP.defaultBlockState());
      }

      int nx2 = x2 - 2;
      int nz2 = z2 - 2;
      int nx1 = Math.max(x1 + 2, nx2 - 2);
      int nz1 = Math.max(z1 + 2, nz2 - 2);
      if (nx2 > nx1 + 1 && nz2 > nz1 + 1 && (nx1 > mx2 + 1 || nz1 > mz2 + 1)) {
         for (int yy = fy + 1; yy <= fy + 3 && yy < topY; yy++) {
            for (int xx = nx1; xx <= nx2; xx++) {
               BuildUtil.setBlock(level, xx, yy, nz1, partition);
               BuildUtil.setBlock(level, xx, yy, nz2, partition);
            }

            for (int zz = nz1; zz <= nz2; zz++) {
               BuildUtil.setBlock(level, nx1, yy, zz, partition);
               BuildUtil.setBlock(level, nx2, yy, zz, partition);
            }
         }

         BuildUtil.setBlock(level, nx1, fy + 1, nz1 + 1, BuildUtil.air());
         BuildUtil.setBlock(level, nx1, fy + 2, nz1 + 1, BuildUtil.air());
         BuildUtil.setBlock(level, nx1 + 1, fy + 2, nz1 + 1, Blocks.WHITE_CONCRETE.defaultBlockState());
         BuildUtil.setBlock(level, nx2 - 1, fy + 1, nz2 - 1, Blocks.OAK_PLANKS.defaultBlockState());
      }

      int bx = x1 + 2;
      if (bx <= x2 - 2 && cz <= z2 - 2) {
         BuildUtil.setBlock(level, bx, fy + 1, cz, Blocks.RED_WOOL.defaultBlockState());
         BuildUtil.setBlock(level, bx + 1, fy + 1, cz, Blocks.YELLOW_WOOL.defaultBlockState());
         BuildUtil.setBlock(level, bx, fy + 1, cz + 1, Blocks.BLUE_WOOL.defaultBlockState());
         BuildUtil.setBlock(level, bx + 1, fy + 1, cz + 1, Blocks.GREEN_WOOL.defaultBlockState());
      }

      for (int row = 0; row < 2; row++) {
         int deskZ = z1 + 3 + row * 3;
         int deskXStart = cx + 2;
         int deskXEnd = x2 - 2;
         if (deskZ < z2 - 2 && deskXStart < deskXEnd) {
            for (int xx = deskXStart; xx <= deskXEnd - 1; xx += 2) {
               BuildUtil.setBlock(level, xx, fy + 1, deskZ, Blocks.BIRCH_PLANKS.defaultBlockState());
               BuildUtil.setBlock(level, xx + 1, fy + 1, deskZ, Blocks.BIRCH_PLANKS.defaultBlockState());
               BuildUtil.setBlock(level, xx, fy + 2, deskZ, Blocks.BLACK_STAINED_GLASS.defaultBlockState());
            }
         }
      }

      int kx = x1 + 2;
      int kz = z2 - 3;
      if (kx + 2 <= x2 - 2 && kz >= z1 + 1) {
         BuildUtil.fill(level, kx, fy + 1, kz, kx + 2, fy + 1, kz, Blocks.OAK_PLANKS.defaultBlockState());
         BuildUtil.setBlock(level, kx, fy + 2, kz, Blocks.CAKE.defaultBlockState());
         BuildUtil.setBlock(level, kx + 1, fy + 2, kz, Blocks.BREWING_STAND.defaultBlockState());
         BuildUtil.setBlock(level, kx + 2, fy + 2, kz, Blocks.CHEST.defaultBlockState());
      }

      for (int xx = x1 + 2; xx <= x2 - 2; xx += 3) {
         for (int zz = z1 + 2; zz <= z2 - 2; zz += 3) {
            if (Math.abs(xx - cx) > 1 || Math.abs(zz - cz) > 1) {
               BuildUtil.setBlock(level, xx, topY - 1, zz, light);
            }
         }
      }
   }

   public static enum Type {
      MODERN,
      TWIN,
      PYRAMID,
      RESIDENTIAL,
      HOTEL,
      GOOGLE;
   }
}

package com.example.citybuilder.builders;

import com.example.citybuilder.blocks.ModBlocks;
import com.example.citybuilder.blocks.TrafficLightBlock;
import com.example.citybuilder.engine.BlockCanvas;
import java.util.function.IntPredicate;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChainBlock;
import net.minecraft.world.level.block.StandingSignBlock;
import net.minecraft.world.level.block.state.BlockState;

public final class RoadBuilder {
   private static final IntPredicate NEVER = i -> false;

   private RoadBuilder() {
   }

   public static void build(BlockCanvas level, RoadBuilder.Type type, int x, int y, int z, int length, RoadBuilder.Axis axis) {
      build(level, type, x, y, z, length, axis, NEVER);
   }

   /**
    * Lays a road starting at (x, z) running {@code length} blocks along {@code axis}; (x, z) is on the centre line.
    * {@code quiet} marks offsets along the road (for example intersections) where no trees, lamps or medians
    * should be placed so crossing traffic is not blocked.
    */
   public static void build(BlockCanvas level, RoadBuilder.Type type, int x, int y, int z, int length, RoadBuilder.Axis axis, IntPredicate quiet) {
      if (length < 5) {
         length = 5;
      }

      switch (type) {
         case JAPANESE -> buildJapanese(level, x, y, z, length, axis, quiet);
         case HIGHWAY -> buildHighway(level, x, y, z, length, axis, quiet);
         case LOCAL -> buildLocal(level, x, y, z, length, axis, quiet);
         case PEDESTRIAN -> buildPedestrian(level, x, y, z, length, axis, quiet);
         case SHOTENGAI -> buildShotengai(level, x, y, z, length, axis, quiet);
      }
   }

   /** Half of the full width a road occupies, including sidewalks and roadside decorations. */
   public static int halfWidth(RoadBuilder.Type type) {
      return switch (type) {
         case JAPANESE -> 7;
         case HIGHWAY -> 11;
         case LOCAL -> 4;
         case PEDESTRIAN -> 6;
         case SHOTENGAI -> 6;
      };
   }

   /** Whether motor traffic uses this road (and so its intersections get traffic lights). */
   public static boolean hasTraffic(RoadBuilder.Type type) {
      return type == Type.JAPANESE || type == Type.HIGHWAY || type == Type.LOCAL;
   }

   private static int[] pos(int x, int z, int i, int w, RoadBuilder.Axis axis) {
      return axis == RoadBuilder.Axis.X ? new int[]{x + i, z + w} : new int[]{x + w, z + i};
   }

   /** Direction pointing from the centre line towards the side {@code sign} (-1 or +1). */
   private static Direction side(RoadBuilder.Axis axis, int sign) {
      if (axis == Axis.X) {
         return sign < 0 ? Direction.NORTH : Direction.SOUTH;
      }
      return sign < 0 ? Direction.WEST : Direction.EAST;
   }

   private static boolean near(IntPredicate quiet, int i, int margin) {
      for (int d = -margin; d <= margin; d++) {
         if (quiet.test(i + d)) {
            return true;
         }
      }
      return false;
   }

   private static void surface(BlockCanvas level, int[] p, int y, BlockState s, int clearHeight) {
      BuildUtil.setBlock(level, p[0], y, p[1], s);
      BuildUtil.fill(level, p[0], y + 1, p[1], p[0], y + clearHeight, p[1], BuildUtil.air());
      BuildUtil.foundation(level, p[0], y - 1, p[1], Blocks.STONE.defaultBlockState());
   }

   private static void buildJapanese(BlockCanvas level, int x, int y, int z, int length, RoadBuilder.Axis axis, IntPredicate quiet) {
      int halfWidth = 7;
      BlockState asphalt = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState line = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState yellowLine = Blocks.YELLOW_CONCRETE.defaultBlockState();
      BlockState curb = Blocks.STONE.defaultBlockState();
      BlockState sidewalk = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState median = Blocks.GRASS_BLOCK.defaultBlockState();
      BlockState lamp = Blocks.SEA_LANTERN.defaultBlockState();

      for (int i = 0; i < length; i++) {
         boolean q = near(quiet, i, 1);
         for (int w = -halfWidth; w <= halfWidth; w++) {
            int[] p = pos(x, z, i, w, axis);
            int abs = Math.abs(w);
            BlockState surface;
            if (abs == 0) {
               surface = q ? asphalt : median;
            } else if (abs <= 5) {
               surface = asphalt;
            } else if (abs == 6) {
               surface = curb;
            } else {
               surface = sidewalk;
            }

            if (abs == 3) {
               surface = i % 3 != 0 ? line : asphalt;
            }

            if (abs == 5) {
               surface = yellowLine;
            }

            surface(level, p, y, surface, 3);
         }

         if (q) {
            continue;
         }

         if (i % 3 == 0) {
            int[] px = pos(x, z, i, 0, axis);
            BuildUtil.setBlock(level, px[0], y + 1, px[1], Blocks.AZALEA.defaultBlockState());
         }

         if (i % 18 == 0 && !near(quiet, i, 2)) {
            int[] pL = pos(x, z, i, -7, axis);
            int[] pR = pos(x, z, i, 7, axis);
            placeTree(level, pL[0], y + 1, pL[1]);
            placeTree(level, pR[0], y + 1, pR[1]);
         }

         if (i % 10 == 5) {
            int[] pL = pos(x, z, i, -7, axis);
            int[] pR = pos(x, z, i, 7, axis);
            placeLamp(level, pL[0], y + 1, pL[1], lamp);
            placeLamp(level, pR[0], y + 1, pR[1], lamp);
         }
      }
   }

   private static void buildHighway(BlockCanvas level, int x, int y, int z, int length, RoadBuilder.Axis axis, IntPredicate quiet) {
      int halfWidth = 11;
      BlockState asphalt = Blocks.GRAY_CONCRETE.defaultBlockState();
      BlockState line = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState shoulder = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState curb = Blocks.STONE.defaultBlockState();
      BlockState median = Blocks.IRON_BARS.defaultBlockState();
      BlockState medianBase = Blocks.COBBLESTONE_WALL.defaultBlockState();
      BlockState guardrail = Blocks.IRON_BARS.defaultBlockState();

      for (int i = 0; i < length; i++) {
         boolean q = near(quiet, i, 1);
         for (int w = -halfWidth; w <= halfWidth; w++) {
            int[] p = pos(x, z, i, w, axis);
            int abs = Math.abs(w);
            BlockState surface;
            if (abs <= 1) {
               surface = q ? asphalt : Blocks.COBBLESTONE.defaultBlockState();
            } else if (abs <= 9) {
               surface = asphalt;
            } else if (abs == 10) {
               surface = shoulder;
            } else {
               surface = curb;
            }

            if ((abs == 4 || abs == 6) && i % 3 != 0) {
               surface = line;
            }

            if (abs == 9) {
               surface = line;
            }

            surface(level, p, y, surface, 4);
         }

         if (q) {
            continue;
         }

         int[] cA = pos(x, z, i, 0, axis);
         BuildUtil.setBlock(level, cA[0], y + 1, cA[1], medianBase);
         BuildUtil.setBlock(level, cA[0], y + 2, cA[1], median);
         int[] gL = pos(x, z, i, -11, axis);
         int[] gR = pos(x, z, i, 11, axis);
         BuildUtil.setBlock(level, gL[0], y + 1, gL[1], guardrail);
         BuildUtil.setBlock(level, gR[0], y + 1, gR[1], guardrail);
         if (i % 15 == 7) {
            placeHighwayLamp(level, gL[0], y + 1, gL[1]);
            placeHighwayLamp(level, gR[0], y + 1, gR[1]);
         }

         if (i % 50 == 25) {
            // Overhead direction board on the median.
            BuildUtil.setBlock(level, cA[0], y + 3, cA[1], Blocks.GREEN_CONCRETE.defaultBlockState());
            BuildUtil.setBlock(level, cA[0], y + 4, cA[1], Blocks.GREEN_CONCRETE.defaultBlockState());
         }
      }
   }

   private static void buildLocal(BlockCanvas level, int x, int y, int z, int length, RoadBuilder.Axis axis, IntPredicate quiet) {
      int halfWidth = 4;
      BlockState asphalt = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState line = Blocks.YELLOW_CONCRETE.defaultBlockState();
      BlockState curb = Blocks.STONE.defaultBlockState();
      BlockState sidewalk = Blocks.SMOOTH_STONE.defaultBlockState();

      for (int i = 0; i < length; i++) {
         boolean q = near(quiet, i, 0);
         for (int w = -halfWidth; w <= halfWidth; w++) {
            int[] p = pos(x, z, i, w, axis);
            int abs = Math.abs(w);
            BlockState surface;
            if (abs <= 2) {
               surface = asphalt;
            } else if (abs == 3) {
               surface = curb;
            } else {
               surface = sidewalk;
            }

            if (abs == 0 && i % 4 < 2 && !q) {
               surface = line;
            }

            surface(level, p, y, surface, 3);
         }

         if (near(quiet, i, 2)) {
            continue;
         }

         if (i % 25 == 10) {
            int[] px = pos(x, z, i, -4, axis);
            placeUtilityPole(level, px[0], y + 1, px[1]);
         }

         if (i % 25 == 3) {
            int[] px = pos(x, z, i, 4, axis);
            placeTree(level, px[0], y + 1, px[1]);
         }

         if (i % 25 == 17) {
            // Red post box on the sidewalk.
            int[] px = pos(x, z, i, -4, axis);
            BuildUtil.setBlock(level, px[0], y + 1, px[1], Blocks.RED_TERRACOTTA.defaultBlockState());
            BuildUtil.setBlock(level, px[0], y + 2, px[1], Blocks.RED_CONCRETE.defaultBlockState());
         }

         if (i % 25 == 21) {
            placeVendingMachine(level, pos(x, z, i, 4, axis), y + 1);
         }
      }
   }

   private static void buildPedestrian(BlockCanvas level, int x, int y, int z, int length, RoadBuilder.Axis axis, IntPredicate quiet) {
      int halfWidth = 6;
      BlockState stone = Blocks.STONE_BRICKS.defaultBlockState();
      BlockState stoneAlt = Blocks.CHISELED_STONE_BRICKS.defaultBlockState();
      BlockState border = Blocks.POLISHED_ANDESITE.defaultBlockState();
      BlockState planter = Blocks.GRASS_BLOCK.defaultBlockState();

      for (int i = 0; i < length; i++) {
         for (int w = -halfWidth; w <= halfWidth; w++) {
            int[] p = pos(x, z, i, w, axis);
            int abs = Math.abs(w);
            BlockState surface;
            if (abs == halfWidth) {
               surface = border;
            } else if (Math.floorMod(i + w, 2) == 0) {
               surface = stone;
            } else {
               surface = stoneAlt;
            }

            surface(level, p, y, surface, 3);
         }

         if (near(quiet, i, 2)) {
            continue;
         }

         if (i % 6 == 3) {
            int[] p = pos(x, z, i, 0, axis);
            BuildUtil.setBlock(level, p[0], y, p[1], planter);

            BlockState flower = switch (i / 6 % 4) {
               case 0 -> Blocks.POPPY.defaultBlockState();
               case 1 -> Blocks.DANDELION.defaultBlockState();
               case 2 -> Blocks.BLUE_ORCHID.defaultBlockState();
               default -> Blocks.AZURE_BLUET.defaultBlockState();
            };
            BuildUtil.setBlock(level, p[0], y + 1, p[1], flower);
         }

         if (i % 10 == 5) {
            // Benches facing the walkway.
            int[] pL = pos(x, z, i, -4, axis);
            int[] pR = pos(x, z, i, 4, axis);
            BuildUtil.setBlock(level, pL[0], y + 1, pL[1], BuildUtil.stairs(Blocks.OAK_STAIRS, side(axis, -1)));
            BuildUtil.setBlock(level, pR[0], y + 1, pR[1], BuildUtil.stairs(Blocks.OAK_STAIRS, side(axis, 1)));
         }

         if (i % 12 == 0) {
            int[] pL = pos(x, z, i, -5, axis);
            int[] pR = pos(x, z, i, 5, axis);
            placeTree(level, pL[0], y + 1, pL[1]);
            placeTree(level, pR[0], y + 1, pR[1]);
         }

         if (i % 16 == 4) {
            int[] p = pos(x, z, i, -5, axis);
            placeLamp(level, p[0], y + 1, p[1], Blocks.LANTERN.defaultBlockState());
         }

         if (i % 16 == 12) {
            int[] p = pos(x, z, i, 5, axis);
            placeLamp(level, p[0], y + 1, p[1], Blocks.LANTERN.defaultBlockState());
         }
      }
   }

   private static void buildShotengai(BlockCanvas level, int x, int y, int z, int length, RoadBuilder.Axis axis, IntPredicate quiet) {
      int halfWidth = 5;
      BlockState path = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState pathAlt = Blocks.ANDESITE.defaultBlockState();
      BlockState pillar = Blocks.STRIPPED_DARK_OAK_LOG.defaultBlockState();
      BlockState beam = Blocks.DARK_OAK_PLANKS.defaultBlockState();
      BlockState roof = Blocks.WHITE_STAINED_GLASS.defaultBlockState();
      BlockState chochin = Blocks.RED_WOOL.defaultBlockState();
      int ridge = y + 6 + halfWidth - 1;

      for (int i = 0; i < length; i++) {
         for (int w = -halfWidth; w <= halfWidth; w++) {
            int[] p = pos(x, z, i, w, axis);
            int abs = Math.abs(w);
            BlockState surface = abs == halfWidth ? pathAlt : path;
            surface(level, p, y, surface, 5);
         }

         // The arcade roof spans intersections too, so crossing streets stay covered.
         for (int w = -halfWidth + 1; w <= halfWidth - 1; w++) {
            int[] p = pos(x, z, i, w, axis);
            int rh = y + 6 + (halfWidth - 1 - Math.abs(w));
            BuildUtil.setBlock(level, p[0], rh, p[1], roof);
         }

         int[] pC = pos(x, z, i, 0, axis);
         BuildUtil.setBlock(level, pC[0], ridge, pC[1], beam);

         boolean q = near(quiet, i, 0);
         int[] pLb = pos(x, z, i, -halfWidth, axis);
         int[] pRb = pos(x, z, i, halfWidth, axis);
         if (!q) {
            BuildUtil.setBlock(level, pLb[0], y + 5, pLb[1], beam);
            BuildUtil.setBlock(level, pRb[0], y + 5, pRb[1], beam);
         }

         if (near(quiet, i, 1)) {
            continue;
         }

         if (i % 4 == 0) {
            BuildUtil.fill(level, pLb[0], y + 1, pLb[1], pLb[0], y + 5, pLb[1], pillar);
            BuildUtil.fill(level, pRb[0], y + 1, pRb[1], pRb[0], y + 5, pRb[1], pillar);
         }

         if (i % 4 == 2) {
            // Paper lantern hanging from the ridge on a chain.
            BuildUtil.fill(level, pC[0], y + 5, pC[1], pC[0], ridge - 1, pC[1], Blocks.CHAIN.defaultBlockState().setValue(ChainBlock.AXIS, Direction.Axis.Y));
            BuildUtil.setBlock(level, pC[0], y + 4, pC[1], chochin);
            BuildUtil.setBlock(level, pC[0], y + 3, pC[1], BuildUtil.hangingLantern(Blocks.LANTERN));
         }

         if (i % 8 == 4) {
            // Shop-front barrels with a standing sign on top, facing the arcade.
            int[] pL = pos(x, z, i, -halfWidth - 1, axis);
            int[] pR = pos(x, z, i, halfWidth + 1, axis);
            BuildUtil.setBlock(level, pL[0], y + 1, pL[1], Blocks.BARREL.defaultBlockState());
            BuildUtil.setBlock(level, pR[0], y + 1, pR[1], Blocks.BARREL.defaultBlockState());
            BuildUtil.setBlock(level, pL[0], y + 2, pL[1], sign(side(axis, 1)));
            BuildUtil.setBlock(level, pR[0], y + 2, pR[1], sign(side(axis, -1)));
         }
      }
   }

   private static BlockState sign(Direction facing) {
      int rotation = switch (facing) {
         case SOUTH -> 0;
         case WEST -> 4;
         case NORTH -> 8;
         default -> 12;
      };
      return Blocks.OAK_SIGN.defaultBlockState().setValue(StandingSignBlock.ROTATION, rotation);
   }

   /**
    * Paints an intersection: plain asphalt, zebra crossings on all four sides, optional diagonal
    * "scramble" stripes, and traffic lights on the four corners.
    */
   public static void intersection(BlockCanvas l, int x1, int y, int z1, int x2, int z2, boolean scramble, boolean lights, boolean arcade) {
      BlockState asphalt = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState white = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState sidewalk = Blocks.SMOOTH_STONE.defaultBlockState();
      int w = x2 - x1 + 1;
      int d = z2 - z1 + 1;
      int band = Math.max(2, Math.min(3, Math.min(w, d) / 5));

      for (int x = x1; x <= x2; x++) {
         for (int z = z1; z <= z2; z++) {
            int dx = x - x1;
            int dz = z - z1;
            boolean nearX = dx < band || x2 - x < band;
            boolean nearZ = dz < band || z2 - z < band;
            BlockState s;
            if (nearX && nearZ) {
               s = sidewalk;
            } else if (nearZ) {
               s = dx % 2 == 0 ? white : asphalt;
            } else if (nearX) {
               s = dz % 2 == 0 ? white : asphalt;
            } else {
               s = asphalt;
            }
            if (scramble && !nearX && !nearZ) {
               // Diagonal crossings corner to corner.
               int a = dx * (d - 1) - dz * (w - 1);
               int b = dx * (d - 1) - (d - 1 - dz) * (w - 1);
               int tol = (int) Math.round(1.6 * Math.hypot(w - 1, d - 1));
               if ((Math.abs(a) <= tol || Math.abs(b) <= tol) && (dx + dz) % 2 == 0) {
                  s = white;
               }
            }
            BuildUtil.setBlock(l, x, y, z, s);
            int clear = arcade ? 4 : 10;
            BuildUtil.fill(l, x, y + 1, z, x, y + clear, z, BuildUtil.air());
         }
      }

      if (lights) {
         placeSignal(l, x1, y, z1, Direction.NORTH);
         placeSignal(l, x2, y, z1, Direction.EAST);
         placeSignal(l, x2, y, z2, Direction.SOUTH);
         placeSignal(l, x1, y, z2, Direction.WEST);
      }
   }

   private static void placeSignal(BlockCanvas l, int x, int y, int z, Direction facing) {
      BlockState pole = Blocks.IRON_BARS.defaultBlockState();
      for (int i = 1; i <= 3; i++) {
         BuildUtil.setBlock(l, x, y + i, z, pole);
      }
      BuildUtil.setBlock(l, x, y + 4, z, ModBlocks.TRAFFIC_LIGHT.get().defaultBlockState().setValue(TrafficLightBlock.FACING, facing));
   }

   private static void placeVendingMachine(BlockCanvas l, int[] p, int y) {
      BuildUtil.setBlock(l, p[0], y, p[1], Blocks.WHITE_CONCRETE.defaultBlockState());
      BuildUtil.setBlock(l, p[0], y + 1, p[1], Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState());
      BuildUtil.setBlock(l, p[0], y + 2, p[1], Blocks.SEA_LANTERN.defaultBlockState());
   }

   private static void placeTree(BlockCanvas level, int x, int y, int z) {
      BlockState log = Blocks.OAK_LOG.defaultBlockState();
      BlockState leaves = Blocks.OAK_LEAVES.defaultBlockState();

      for (int i = 0; i < 4; i++) {
         BuildUtil.setBlock(level, x, y + i, z, log);
      }

      for (int dx = -1; dx <= 1; dx++) {
         for (int dz = -1; dz <= 1; dz++) {
            BuildUtil.setBlock(level, x + dx, y + 3, z + dz, leaves);
            BuildUtil.setBlock(level, x + dx, y + 4, z + dz, leaves);
         }
      }

      BuildUtil.setBlock(level, x, y + 5, z, leaves);
      BuildUtil.setBlock(level, x, y + 3, z, log);
   }

   private static void placeLamp(BlockCanvas level, int x, int y, int z, BlockState lamp) {
      BlockState pole = Blocks.IRON_BARS.defaultBlockState();

      for (int i = 0; i < 4; i++) {
         BuildUtil.setBlock(level, x, y + i, z, pole);
      }

      BuildUtil.setBlock(level, x, y + 4, z, lamp);
   }

   private static void placeHighwayLamp(BlockCanvas level, int x, int y, int z) {
      BlockState pole = Blocks.IRON_BARS.defaultBlockState();

      for (int i = 0; i < 6; i++) {
         BuildUtil.setBlock(level, x, y + i, z, pole);
      }

      BuildUtil.setBlock(level, x, y + 6, z, Blocks.GLOWSTONE.defaultBlockState());
   }

   private static void placeUtilityPole(BlockCanvas level, int x, int y, int z) {
      Block wood = Blocks.STRIPPED_SPRUCE_LOG;

      for (int i = 0; i < 6; i++) {
         BuildUtil.setBlock(level, x, y + i, z, wood.defaultBlockState());
      }

      BuildUtil.setBlock(level, x, y + 6, z, Blocks.GRAY_CONCRETE.defaultBlockState());
   }

   public static enum Axis {
      X,
      Z;
   }

   public static enum Type {
      JAPANESE,
      HIGHWAY,
      LOCAL,
      PEDESTRIAN,
      SHOTENGAI;
   }
}

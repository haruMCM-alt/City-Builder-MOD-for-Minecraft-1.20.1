package com.example.citybuilder.builders;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.RailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.RailShape;

public final class RailBuilder {
   private RailBuilder() {
   }

   public static void build(BlockCanvas l, RailBuilder.Type type, int x, int y, int z, int length, RailBuilder.Axis axis) {
      if (length < 10) {
         length = 10;
      }

      switch (type) {
         case STANDARD:
            standard(l, x, y, z, length, axis, 0);
            break;
         case SHINKANSEN:
            shinkansen(l, x, y, z, length, axis);
            break;
         case METRO:
            metro(l, x, y, z, length, axis);
            break;
         case ELEVATED:
            elevated(l, x, y, z, length, axis);
      }
   }

   /**
    * A closed rectangular loop through the four corners (x1, z1) and (x2, z2). The four sides are laid
    * first without decorations near the corners, then the corners get curved rails, so trains run round
    * the loop forever.
    */
   public static void buildLoop(BlockCanvas l, RailBuilder.Type type, int x1, int y, int z1, int x2, int z2) {
      int lenX = x2 - x1 - 1;
      int lenZ = z2 - z1 - 1;
      int quiet = 5;
      standard(l, x1 + 1, y, z1, lenX, Axis.X, quiet);
      standard(l, x1 + 1, y, z2, lenX, Axis.X, quiet);
      standard(l, x1, y, z1 + 1, lenZ, Axis.Z, quiet);
      standard(l, x2, y, z1 + 1, lenZ, Axis.Z, quiet);
      corner(l, x1, y, z1, RailShape.SOUTH_EAST);
      corner(l, x2, y, z1, RailShape.SOUTH_WEST);
      corner(l, x2, y, z2, RailShape.NORTH_WEST);
      corner(l, x1, y, z2, RailShape.NORTH_EAST);
   }

   private static void corner(BlockCanvas l, int x, int y, int z, RailShape shape) {
      BlockState gravel = Blocks.GRAVEL.defaultBlockState();
      // The two directions the track leaves this corner in; those blocks belong to the straight sections.
      int ax = shape == RailShape.SOUTH_EAST || shape == RailShape.NORTH_EAST ? 1 : -1;
      int az = shape == RailShape.SOUTH_EAST || shape == RailShape.SOUTH_WEST ? 1 : -1;
      for (int dx = -2; dx <= 2; dx++) {
         for (int dz = -2; dz <= 2; dz++) {
            boolean onTrack = dz == 0 && dx * ax > 0 || dx == 0 && dz * az > 0;
            if (onTrack) {
               continue;
            }
            BuildUtil.foundation(l, x + dx, y - 2, z + dz, Blocks.STONE.defaultBlockState());
            BuildUtil.setBlock(l, x + dx, y - 1, z + dz, gravel);
            BuildUtil.fill(l, x + dx, y, z + dz, x + dx, y + 2, z + dz, BuildUtil.air());
         }
      }
      BuildUtil.setBlock(l, x, y, z, Blocks.STONE.defaultBlockState());
      BuildUtil.setBlock(l, x, y + 1, z, Blocks.RAIL.defaultBlockState().setValue(RailBlock.SHAPE, shape));
   }

   private static int dx(RailBuilder.Axis a, int i) {
      return a == RailBuilder.Axis.X ? i : 0;
   }

   private static int dz(RailBuilder.Axis a, int i) {
      return a == RailBuilder.Axis.Z ? i : 0;
   }

   private static int sx(RailBuilder.Axis a, int i) {
      return a == RailBuilder.Axis.X ? 0 : i;
   }

   private static int sz(RailBuilder.Axis a, int i) {
      return a == RailBuilder.Axis.Z ? 0 : i;
   }

   private static BlockState railAlong(RailBuilder.Axis a) {
      RailShape shape = a == RailBuilder.Axis.X ? RailShape.EAST_WEST : RailShape.NORTH_SOUTH;
      return (BlockState)Blocks.RAIL.defaultBlockState().setValue(RailBlock.SHAPE, shape);
   }

   private static BlockState poweredRailAlong(RailBuilder.Axis a, boolean powered) {
      RailShape shape = a == RailBuilder.Axis.X ? RailShape.EAST_WEST : RailShape.NORTH_SOUTH;
      return (BlockState)((BlockState)Blocks.POWERED_RAIL.defaultBlockState().setValue(PoweredRailBlock.SHAPE, shape)).setValue(BlockStateProperties.POWERED, powered);
   }

   private static void standard(BlockCanvas l, int x, int y, int z, int length, RailBuilder.Axis a, int quiet) {
      BlockState gravel = Blocks.GRAVEL.defaultBlockState();
      BlockState stone = Blocks.STONE.defaultBlockState();
      BlockState sleeper = Blocks.DARK_OAK_LOG.defaultBlockState();
      BlockState fence = Blocks.IRON_BARS.defaultBlockState();
      BlockState lampPost = Blocks.COBBLESTONE_WALL.defaultBlockState();
      BlockState lantern = BuildUtil.hangingLantern(Blocks.LANTERN);
      BlockState redstoneBlock = Blocks.REDSTONE_BLOCK.defaultBlockState();

      for (int i = 0; i < length; i++) {
         int bx = x + dx(a, i);
         int bz = z + dz(a, i);

         boolean decorate = i >= quiet && i < length - quiet;

         for (int s = -3; s <= 3; s++) {
            // Embankment under the ballast so the line never floats over dips.
            BuildUtil.foundation(l, bx + sx(a, s), y - 2, bz + sz(a, s), Blocks.STONE.defaultBlockState());
         }

         for (int s = -2; s <= 2; s++) {
            BuildUtil.setBlock(l, bx + sx(a, s), y - 1, bz + sz(a, s), gravel);
            BuildUtil.setBlock(l, bx + sx(a, s), y, bz + sz(a, s), BuildUtil.air());
            BuildUtil.setBlock(l, bx + sx(a, s), y + 1, bz + sz(a, s), BuildUtil.air());
            BuildUtil.setBlock(l, bx + sx(a, s), y + 2, bz + sz(a, s), BuildUtil.air());
         }

         if (i % 2 == 0) {
            BuildUtil.setBlock(l, bx + sx(a, -1), y, bz + sz(a, -1), sleeper);
            BuildUtil.setBlock(l, bx + sx(a, 1), y, bz + sz(a, 1), sleeper);
            BuildUtil.setBlock(l, bx, y, bz, sleeper);
         } else {
            BuildUtil.setBlock(l, bx, y, bz, stone);
         }

         boolean power = i % 8 == 0;
         if (power) {
            BuildUtil.setBlock(l, bx, y, bz, redstoneBlock);
         }

         BuildUtil.setBlock(l, bx, y + 1, bz, power ? poweredRailAlong(a, true) : railAlong(a));
         if (!decorate) {
            continue;
         }

         if (i % 10 != 9) {
            BuildUtil.setBlock(l, bx + sx(a, -3), y + 1, bz + sz(a, -3), fence);
            BuildUtil.setBlock(l, bx + sx(a, 3), y + 1, bz + sz(a, 3), fence);
         }

         BuildUtil.setBlock(l, bx + sx(a, -3), y, bz + sz(a, -3), stone);
         BuildUtil.setBlock(l, bx + sx(a, 3), y, bz + sz(a, 3), stone);
         if (i % 15 == 7) {
            int sideSign = i / 15 % 2 == 0 ? -4 : 4;

            for (int h = 0; h <= 4; h++) {
               BuildUtil.setBlock(l, bx + sx(a, sideSign), y + h, bz + sz(a, sideSign), lampPost);
            }

            int armDir = sideSign > 0 ? -1 : 1;

            for (int arm = 1; arm <= 2; arm++) {
               BuildUtil.setBlock(l, bx + sx(a, sideSign + armDir * arm), y + 4, bz + sz(a, sideSign + armDir * arm), lampPost);
            }

            BuildUtil.setBlock(l, bx + sx(a, sideSign + armDir * 2), y + 3, bz + sz(a, sideSign + armDir * 2), lantern);
         }
      }
   }

   private static void shinkansen(BlockCanvas l, int x, int y, int z, int length, RailBuilder.Axis a) {
      BlockState concrete = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState edge = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState sleeper = Blocks.DEEPSLATE_TILES.defaultBlockState();
      BlockState fence = Blocks.IRON_BARS.defaultBlockState();
      BlockState pier = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState pierTop = Blocks.STONE_BRICKS.defaultBlockState();
      BlockState redstoneBlock = Blocks.REDSTONE_BLOCK.defaultBlockState();
      BlockState lantern = Blocks.SEA_LANTERN.defaultBlockState();
      int deckY = y + 8;

      for (int i = 0; i < length; i++) {
         int bx = x + dx(a, i);
         int bz = z + dz(a, i);
         if (i % 12 == 0) {
            for (int s = -1; s <= 1; s++) {
               for (int t = -1; t <= 1; t++) {
                  BuildUtil.foundation(l, bx + sx(a, s) + (a == RailBuilder.Axis.X ? t : 0), y - 1, bz + sz(a, s) + (a == RailBuilder.Axis.Z ? t : 0), pier);
               }
            }

            for (int dy = 0; dy < 8; dy++) {
               for (int s = -1; s <= 1; s++) {
                  for (int t = -1; t <= 1; t++) {
                     if (a == RailBuilder.Axis.X) {
                        BuildUtil.setBlock(l, bx + t, y + dy, bz + s, pier);
                     } else {
                        BuildUtil.setBlock(l, bx + s, y + dy, bz + t, pier);
                     }
                  }
               }
            }

            for (int s = -2; s <= 2; s++) {
               for (int tx = -2; tx <= 2; tx++) {
                  BuildUtil.setBlock(l, bx + sx(a, s) + (a == RailBuilder.Axis.X ? tx : 0), y + 7, bz + sz(a, s) + (a == RailBuilder.Axis.Z ? tx : 0), pierTop);
               }
            }
         }

         for (int s = -3; s <= 3; s++) {
            BlockState b = Math.abs(s) == 3 ? edge : concrete;
            BuildUtil.setBlock(l, bx + sx(a, s), deckY, bz + sz(a, s), b);
         }

         BuildUtil.setBlock(l, bx + sx(a, -1), deckY + 1, bz + sz(a, -1), i % 2 == 0 ? sleeper : concrete);
         BuildUtil.setBlock(l, bx + sx(a, 1), deckY + 1, bz + sz(a, 1), i % 2 == 0 ? sleeper : concrete);
         BuildUtil.setBlock(l, bx, deckY + 1, bz, i % 6 == 0 ? redstoneBlock : sleeper);
         boolean power = i % 6 == 0;
         BuildUtil.setBlock(l, bx, deckY + 2, bz, power ? poweredRailAlong(a, true) : railAlong(a));
         BuildUtil.setBlock(l, bx + sx(a, -3), deckY + 1, bz + sz(a, -3), concrete);
         BuildUtil.setBlock(l, bx + sx(a, 3), deckY + 1, bz + sz(a, 3), concrete);
         BuildUtil.setBlock(l, bx + sx(a, -3), deckY + 2, bz + sz(a, -3), fence);
         BuildUtil.setBlock(l, bx + sx(a, 3), deckY + 2, bz + sz(a, 3), fence);
         if (i % 8 == 4) {
            BuildUtil.setBlock(l, bx + sx(a, -3), deckY + 3, bz + sz(a, -3), lantern);
            BuildUtil.setBlock(l, bx + sx(a, 3), deckY + 3, bz + sz(a, 3), lantern);
         }
      }
   }

   private static void metro(BlockCanvas l, int x, int y, int z, int length, RailBuilder.Axis a) {
      BlockState wall = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState ceil = Blocks.STONE_BRICKS.defaultBlockState();
      BlockState sleeper = Blocks.DARK_OAK_LOG.defaultBlockState();
      BlockState lamp = Blocks.SEA_LANTERN.defaultBlockState();
      BlockState redstoneBlock = Blocks.REDSTONE_BLOCK.defaultBlockState();
      BlockState cable = Blocks.BLACK_CONCRETE.defaultBlockState();

      for (int i = 0; i < length; i++) {
         int bx = x + dx(a, i);
         int bz = z + dz(a, i);

         for (int s = -3; s <= 3; s++) {
            BuildUtil.setBlock(l, bx + sx(a, s), y - 1, bz + sz(a, s), wall);

            for (int h = 0; h <= 4; h++) {
               boolean edge = Math.abs(s) == 3 || h == 4;
               if (edge) {
                  BuildUtil.setBlock(l, bx + sx(a, s), y + h, bz + sz(a, s), h == 4 ? ceil : wall);
               } else {
                  BuildUtil.setBlock(l, bx + sx(a, s), y + h, bz + sz(a, s), BuildUtil.air());
               }
            }
         }

         if (i % 2 == 0) {
            BuildUtil.setBlock(l, bx, y, bz, sleeper);
         }

         boolean power = i % 8 == 0;
         if (power) {
            BuildUtil.setBlock(l, bx, y, bz, redstoneBlock);
         }

         BuildUtil.setBlock(l, bx, y + 1, bz, power ? poweredRailAlong(a, true) : railAlong(a));
         BuildUtil.setBlock(l, bx + sx(a, -3), y + 2, bz + sz(a, -3), cable);
         BuildUtil.setBlock(l, bx + sx(a, 3), y + 2, bz + sz(a, 3), cable);
         if (i % 8 == 0) {
            BuildUtil.setBlock(l, bx, y + 4, bz, lamp);
         }
      }
   }

   private static void elevated(BlockCanvas l, int x, int y, int z, int length, RailBuilder.Axis a) {
      BlockState pillar = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState beam = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState deck = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState fence = Blocks.IRON_BARS.defaultBlockState();
      BlockState sleeper = Blocks.STONE_BRICKS.defaultBlockState();
      BlockState redstoneBlock = Blocks.REDSTONE_BLOCK.defaultBlockState();
      BlockState lamp = Blocks.SEA_LANTERN.defaultBlockState();
      int deckY = y + 6;

      for (int i = 0; i < length; i++) {
         int bx = x + dx(a, i);
         int bz = z + dz(a, i);
         if (i % 8 == 0) {
            BuildUtil.foundation(l, bx, y - 1, bz, pillar);
            for (int dy = 0; dy < 6; dy++) {
               BuildUtil.setBlock(l, bx, y + dy, bz, pillar);
            }

            for (int s = -2; s <= 2; s++) {
               BuildUtil.setBlock(l, bx + sx(a, s), y + 5, bz + sz(a, s), beam);
            }
         }

         for (int s = -2; s <= 2; s++) {
            BuildUtil.setBlock(l, bx + sx(a, s), deckY, bz + sz(a, s), deck);
         }

         if (i % 2 == 0) {
            BuildUtil.setBlock(l, bx, deckY + 1, bz, sleeper);
         }

         boolean power = i % 8 == 0;
         if (power) {
            BuildUtil.setBlock(l, bx, deckY + 1, bz, redstoneBlock);
         }

         BuildUtil.setBlock(l, bx, deckY + 2, bz, power ? poweredRailAlong(a, true) : railAlong(a));
         BuildUtil.setBlock(l, bx + sx(a, -2), deckY + 2, bz + sz(a, -2), fence);
         BuildUtil.setBlock(l, bx + sx(a, 2), deckY + 2, bz + sz(a, 2), fence);
         if (i % 10 == 5) {
            BuildUtil.setBlock(l, bx + sx(a, -2), deckY + 3, bz + sz(a, -2), lamp);
            BuildUtil.setBlock(l, bx + sx(a, 2), deckY + 3, bz + sz(a, 2), lamp);
         }
      }
   }

   public static enum Axis {
      X,
      Z;
   }

   public static enum Type {
      STANDARD,
      SHINKANSEN,
      METRO,
      ELEVATED;
   }
}

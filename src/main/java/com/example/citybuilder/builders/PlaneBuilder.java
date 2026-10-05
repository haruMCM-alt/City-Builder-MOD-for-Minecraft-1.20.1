package com.example.citybuilder.builders;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

public final class PlaneBuilder {
   private PlaneBuilder() {
   }

   public static void build(BlockCanvas l, PlaneBuilder.Type type, int x, int y, int z, PlaneBuilder.Facing f) {
      switch (type) {
         case CESSNA:
            cessna(l, x, y, z, f);
            break;
         case JET:
            jet(l, x, y, z, f);
            break;
         case BIPLANE:
            biplane(l, x, y, z, f);
      }
   }

   private static int wx(int x, int dx, int dz, PlaneBuilder.Facing f) {
      return switch (f) {
         case PX -> x + dx;
         case NX -> x - dx;
         case PZ -> x - dz;
         case NZ -> x + dz;
      };
   }

   private static int wz(int z, int dx, int dz, PlaneBuilder.Facing f) {
      return switch (f) {
         case PX -> z + dz;
         case NX -> z - dz;
         case PZ -> z + dx;
         case NZ -> z - dx;
      };
   }

   private static void set(BlockCanvas l, int x, int y, int z, int dx, int dy, int dz, PlaneBuilder.Facing f, BlockState s) {
      BuildUtil.setBlock(l, wx(x, dx, dz, f), y + dy, wz(z, dx, dz, f), s);
   }

   private static void fillLocal(BlockCanvas l, int x, int y, int z, int dx1, int dy1, int dz1, int dx2, int dy2, int dz2, PlaneBuilder.Facing f, BlockState s) {
      int x1 = wx(x, dx1, dz1, f);
      int x2 = wx(x, dx2, dz2, f);
      int z1 = wz(z, dx1, dz1, f);
      int z2 = wz(z, dx2, dz2, f);
      BuildUtil.fill(l, Math.min(x1, x2), y + dy1, Math.min(z1, z2), Math.max(x1, x2), y + dy2, Math.max(z1, z2), s);
   }

   private static void cessna(BlockCanvas l, int x, int y, int z, PlaneBuilder.Facing f) {
      BlockState white = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState blue = Blocks.LIGHT_BLUE_CONCRETE.defaultBlockState();
      BlockState red = Blocks.RED_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState();
      BlockState engine = Blocks.POLISHED_BLACKSTONE_BRICKS.defaultBlockState();
      BlockState black = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState iron = Blocks.IRON_BLOCK.defaultBlockState();
      BlockState lamp = Blocks.REDSTONE_LAMP.defaultBlockState();
      BlockState light = Blocks.SEA_LANTERN.defaultBlockState();
      int baseY = 2;

      for (int dx = -8; dx <= 10; dx++) {
         for (int dy = 0; dy <= 2; dy++) {
            for (int dz = -1; dz <= 1; dz++) {
               boolean corner = (dy == 0 || dy == 2) && (dz == -1 || dz == 1);
               if (!corner) {
                  set(l, x, y + baseY, z, dx, dy, dz, f, white);
               }
            }
         }
      }

      for (int dx = -9; dx >= -11; dx--) {
         set(l, x, y + baseY, z, dx, 1, 0, f, white);
         set(l, x, y + baseY, z, dx, 2, 0, f, white);
      }

      set(l, x, y + baseY, z, 10, 1, 0, f, engine);
      set(l, x, y + baseY, z, 11, 1, 0, f, engine);
      set(l, x, y + baseY, z, 12, 1, 0, f, black);
      set(l, x, y + baseY, z, 12, -1, 0, f, iron);
      set(l, x, y + baseY, z, 12, 0, 0, f, iron);
      set(l, x, y + baseY, z, 12, 2, 0, f, iron);
      set(l, x, y + baseY, z, 12, 3, 0, f, iron);

      for (int dx = 4; dx <= 9; dx++) {
         for (int dzx = -1; dzx <= 1; dzx++) {
            set(l, x, y + baseY, z, dx, 3, dzx, f, dzx == 0 ? white : glass);
         }
      }

      for (int dzx = -1; dzx <= 1; dzx++) {
         set(l, x, y + baseY, z, 10, 2, dzx, f, glass);
      }

      for (int dx = 5; dx <= 8; dx++) {
         set(l, x, y + baseY, z, dx, 1, -1, f, glass);
         set(l, x, y + baseY, z, dx, 1, 1, f, glass);
      }

      set(l, x, y + baseY, z, 7, 1, -1, f, Blocks.RED_WOOL.defaultBlockState());
      set(l, x, y + baseY, z, 7, 1, 1, f, Blocks.RED_WOOL.defaultBlockState());
      set(l, x, y + baseY, z, 6, 1, -1, f, Blocks.RED_WOOL.defaultBlockState());
      set(l, x, y + baseY, z, 6, 1, 1, f, Blocks.RED_WOOL.defaultBlockState());
      set(l, x, y + baseY, z, 8, 1, 0, f, Blocks.BLACK_CONCRETE.defaultBlockState());
      set(l, x, y + baseY, z, 7, 1, 0, f, Blocks.IRON_BARS.defaultBlockState());
      set(l, x, y + baseY, z, 7, 2, 0, f, light);
      int wingY = 4;

      for (int dzx = -16; dzx <= 16; dzx++) {
         int frontSpan = Math.abs(dzx) > 13 ? 2 : (Math.abs(dzx) > 8 ? 3 : 4);

         for (int dx = 3; dx <= 3 + frontSpan; dx++) {
            set(l, x, y + baseY, z, dx, wingY, dzx, f, white);
         }
      }

      for (int dzx : new int[]{-16, -15, 15, 16}) {
         set(l, x, y + baseY, z, 3, wingY, dzx, f, blue);
      }

      set(l, x, y + baseY, z, 4, wingY, -16, f, Blocks.RED_CONCRETE.defaultBlockState());
      set(l, x, y + baseY, z, 4, wingY, 16, f, Blocks.LIME_CONCRETE.defaultBlockState());
      set(l, x, y + baseY, z, 5, wingY, -16, f, lamp);
      set(l, x, y + baseY, z, 5, wingY, 16, f, lamp);

      for (int dy = 1; dy <= 3; dy++) {
         set(l, x, y + baseY, z, 4, dy, -6, f, iron);
         set(l, x, y + baseY, z, 4, dy, 6, f, iron);
      }

      for (int dx = -8; dx <= 10; dx++) {
         set(l, x, y + baseY, z, dx, 1, -1, f, blue);
         set(l, x, y + baseY, z, dx, 1, 1, f, blue);
      }

      for (int dy = 2; dy <= 6; dy++) {
         int back = dy <= 4 ? -11 : -10 + (dy - 4);

         for (int dx = back; dx <= -7; dx++) {
            set(l, x, y + baseY, z, dx, dy, 0, f, white);
         }
      }

      for (int dx = -10; dx <= -8; dx++) {
         set(l, x, y + baseY, z, dx, 5, 0, f, blue);
      }

      for (int dzx = -4; dzx <= 4; dzx++) {
         for (int dx = -10; dx <= -8; dx++) {
            set(l, x, y + baseY, z, dx, 3, dzx, f, white);
         }
      }

      set(l, x, y + baseY, z, -9, 3, -4, f, blue);
      set(l, x, y + baseY, z, -9, 3, 4, f, blue);
      set(l, x, y + baseY, z, 8, -1, 0, f, iron);
      set(l, x, y + baseY, z, 8, -2, 0, f, black);
      set(l, x, y + baseY, z, 2, -1, -3, f, iron);
      set(l, x, y + baseY, z, 2, -2, -3, f, black);
      set(l, x, y + baseY, z, 2, -1, 3, f, iron);
      set(l, x, y + baseY, z, 2, -2, 3, f, black);
      set(l, x, y + baseY, z, 2, 0, -2, f, iron);
      set(l, x, y + baseY, z, 2, 0, 2, f, iron);
      set(l, x, y + baseY, z, 5, 2, -1, f, red);
      set(l, x, y + baseY, z, 5, 2, 1, f, red);
      set(l, x, y + baseY, z, 4, 3, -16, f, light);
      set(l, x, y + baseY, z, 4, 3, 16, f, light);
   }

   private static void jet(BlockCanvas l, int x, int y, int z, PlaneBuilder.Facing f) {
      BlockState white = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState blue = Blocks.BLUE_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState();
      BlockState black = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState iron = Blocks.IRON_BLOCK.defaultBlockState();
      BlockState light = Blocks.SEA_LANTERN.defaultBlockState();
      int baseY = 4;

      for (int dx = -16; dx <= 20; dx++) {
         for (int dy = 0; dy <= 4; dy++) {
            for (int dz = -2; dz <= 2; dz++) {
               int d2 = dy * dy + dz * dz;
               if (d2 <= 7 && d2 >= 3
                  || dy == 2 && Math.abs(dz) == 2
                  || Math.abs(dz) == 2 && dy >= 1 && dy <= 3
                  || dy == 0 && Math.abs(dz) <= 1
                  || dy == 4 && Math.abs(dz) <= 1) {
                  set(l, x, y + baseY, z, dx, dy, dz, f, white);
               }
            }
         }
      }

      for (int dx = 21; dx <= 23; dx++) {
         int shrink = dx - 20;

         for (int dy = shrink; dy <= 4 - shrink; dy++) {
            for (int dzx = -2 + shrink; dzx <= 2 - shrink; dzx++) {
               set(l, x, y + baseY, z, dx, dy, dzx, f, white);
            }
         }
      }

      set(l, x, y + baseY, z, 24, 2, 0, f, black);

      for (int dzx = -1; dzx <= 1; dzx++) {
         set(l, x, y + baseY, z, 20, 3, dzx, f, glass);
         set(l, x, y + baseY, z, 21, 2, dzx, f, glass);
      }

      for (int dx = -10; dx <= 15; dx += 2) {
         set(l, x, y + baseY, z, dx, 2, -2, f, glass);
         set(l, x, y + baseY, z, dx, 2, 2, f, glass);
      }

      for (int dx = -14; dx <= 18; dx++) {
         set(l, x, y + baseY, z, dx, 1, -2, f, blue);
         set(l, x, y + baseY, z, dx, 1, 2, f, blue);
      }

      for (int dzx = -20; dzx <= 20; dzx++) {
         int sweep = Math.abs(dzx) / 2;
         int fx = 5 - sweep;
         int bx = fx - 8;

         for (int dx = bx; dx <= fx; dx++) {
            set(l, x, y + baseY, z, dx, 0, dzx, f, white);
         }

         set(l, x, y + baseY, z, fx, 0, dzx, f, blue);
      }

      for (int dy = 0; dy <= 2; dy++) {
         set(l, x, y + baseY, z, -5, dy, -20, f, white);
         set(l, x, y + baseY, z, -5, dy, 20, f, white);
      }

      for (int side : new int[]{-10, 10}) {
         for (int dx = -4; dx <= 2; dx++) {
            for (int dy = -2; dy <= -1; dy++) {
               for (int dzx = side - 1; dzx <= side + 1; dzx++) {
                  set(l, x, y + baseY, z, dx, dy, dzx, f, iron);
               }
            }
         }

         set(l, x, y + baseY, z, 3, -2, side, f, black);
         set(l, x, y + baseY, z, 3, -1, side, f, black);
      }

      for (int dy = 5; dy <= 11; dy++) {
         int back = -14 + (dy - 5) / 2;

         for (int dx = back; dx <= -10 + (dy - 5) / 2; dx++) {
            set(l, x, y + baseY, z, dx, dy, 0, f, white);
         }
      }

      for (int dx = -13; dx <= -11; dx++) {
         set(l, x, y + baseY, z, dx, 10, 0, f, blue);
      }

      for (int dzx = -7; dzx <= 7; dzx++) {
         int sweep = Math.abs(dzx) / 3;

         for (int dx = -15 - sweep; dx <= -12 - sweep; dx++) {
            set(l, x, y + baseY, z, dx, 5, dzx, f, white);
         }
      }

      set(l, x, y + baseY, z, 17, -1, 0, f, iron);
      set(l, x, y + baseY, z, 17, -2, 0, f, black);

      for (int side : new int[]{-2, 2}) {
         set(l, x, y + baseY, z, -2, -1, side, f, iron);
         set(l, x, y + baseY, z, -2, -2, side, f, black);
         set(l, x, y + baseY, z, -3, -2, side, f, black);
      }

      set(l, x, y + baseY, z, -3, 0, -20, f, Blocks.RED_CONCRETE.defaultBlockState());
      set(l, x, y + baseY, z, -3, 0, 20, f, Blocks.LIME_CONCRETE.defaultBlockState());
      set(l, x, y + baseY, z, -14, 4, 0, f, light);
   }

   private static void biplane(BlockCanvas l, int x, int y, int z, PlaneBuilder.Facing f) {
      BlockState red = Blocks.RED_CONCRETE.defaultBlockState();
      BlockState cream = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState yellow = Blocks.YELLOW_CONCRETE.defaultBlockState();
      BlockState glass = Blocks.GLASS.defaultBlockState();
      BlockState iron = Blocks.IRON_BLOCK.defaultBlockState();
      BlockState black = Blocks.BLACK_CONCRETE.defaultBlockState();
      BlockState light = Blocks.LANTERN.defaultBlockState();
      int baseY = 3;

      for (int dx = -6; dx <= 9; dx++) {
         for (int dy = 0; dy <= 3; dy++) {
            for (int dz = -1; dz <= 1; dz++) {
               boolean corner = (dy == 0 || dy == 3) && dz != 0;
               if (!corner) {
                  set(l, x, y + baseY, z, dx, dy, dz, f, red);
               }
            }
         }
      }

      for (int dx = -8; dx <= -7; dx++) {
         set(l, x, y + baseY, z, dx, 1, 0, f, red);
         set(l, x, y + baseY, z, dx, 2, 0, f, red);
      }

      for (int dx = 9; dx <= 10; dx++) {
         set(l, x, y + baseY, z, dx, 1, 0, f, iron);
         set(l, x, y + baseY, z, dx, 2, 0, f, iron);
      }

      for (int dy = -1; dy <= 4; dy++) {
         set(l, x, y + baseY, z, 11, dy, 0, f, black);
      }

      set(l, x, y + baseY, z, 11, 1, 0, f, yellow);

      for (int dzx = -1; dzx <= 1; dzx++) {
         if (dzx != 0) {
            set(l, x, y + baseY, z, 3, 3, dzx, f, red);
         }
      }

      for (int dzxx = -1; dzxx <= 1; dzxx++) {
         set(l, x, y + baseY, z, 4, 3, dzxx, f, glass);
      }

      set(l, x, y + baseY, z, 2, 2, 0, f, Blocks.BROWN_WOOL.defaultBlockState());
      set(l, x, y + baseY, z, 3, 2, 0, f, BuildUtil.air());

      for (int dzxx = -10; dzxx <= 10; dzxx++) {
         for (int dx = 1; dx <= 4; dx++) {
            set(l, x, y + baseY, z, dx, 0, dzxx, f, cream);
         }
      }

      for (int dzxx = -10; dzxx <= 10; dzxx += 2) {
         set(l, x, y + baseY, z, 4, 0, dzxx, f, red);
      }

      for (int dzxx = -11; dzxx <= 11; dzxx++) {
         for (int dx = 0; dx <= 5; dx++) {
            set(l, x, y + baseY, z, dx, 5, dzxx, f, cream);
         }
      }

      for (int dzxx = -11; dzxx <= 11; dzxx += 2) {
         set(l, x, y + baseY, z, 5, 5, dzxx, f, red);
      }

      for (int dy = 3; dy <= 4; dy++) {
         set(l, x, y + baseY, z, 2, dy, -6, f, iron);
         set(l, x, y + baseY, z, 2, dy, 6, f, iron);
         set(l, x, y + baseY, z, 4, dy, -9, f, iron);
         set(l, x, y + baseY, z, 4, dy, 9, f, iron);
      }

      for (int dy = 3; dy <= 6; dy++) {
         set(l, x, y + baseY, z, -8, dy, 0, f, red);
         set(l, x, y + baseY, z, -7, dy, 0, f, red);
      }

      for (int dzxx = -3; dzxx <= 3; dzxx++) {
         set(l, x, y + baseY, z, -8, 2, dzxx, f, cream);
         set(l, x, y + baseY, z, -7, 2, dzxx, f, cream);
      }

      for (int side : new int[]{-3, 3}) {
         for (int dy = -2; dy <= -1; dy++) {
            set(l, x, y + baseY, z, 1, dy, side, f, iron);
         }

         set(l, x, y + baseY, z, 1, -2, side, f, black);
      }

      set(l, x, y + baseY, z, -8, -1, 0, f, iron);
      set(l, x, y + baseY, z, 0, 5, -11, f, light);
      set(l, x, y + baseY, z, 0, 5, 11, f, light);
      set(l, x, y + baseY, z, 5, 5, 0, f, light);
   }

   public static enum Facing {
      PX,
      NX,
      PZ,
      NZ;
   }

   public static enum Type {
      CESSNA,
      JET,
      BIPLANE;
   }
}

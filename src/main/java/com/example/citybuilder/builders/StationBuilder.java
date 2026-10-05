package com.example.citybuilder.builders;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.RailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.RailShape;

/**
 * Stations are built around a through track on the centre line (offset 0), the same line that
 * {@link RailBuilder} lays, so a station dropped on an existing line connects to it. The station
 * building and entrance are on the {@code side} (-1 or +1) of the line.
 */
public final class StationBuilder {
   private static final String[] NAMES = {
      "中央", "桜ヶ丘", "港町", "青葉台", "緑町", "本町", "新町", "川端", "城山", "日の出",
      "旭", "富士見", "若葉", "東雲", "朝日", "みなと", "柳橋", "花園", "千鳥", "星川"
   };

   private StationBuilder() {
   }

   public static void build(BlockCanvas l, StationBuilder.Type t, int x, int y, int z, int length, StationBuilder.Axis axis) {
      build(l, t, x, y, z, length, axis, -1, defaultName(x, z));
   }

   public static void build(BlockCanvas l, StationBuilder.Type t, int x, int y, int z, int length, StationBuilder.Axis axis, int side, String name) {
      if (length < 20) {
         length = 20;
      }
      Frame f = new Frame(x, z, axis, side < 0 ? -1 : 1);
      switch (t) {
         case LOCAL -> local(l, f, y, length, name);
         case TERMINAL -> terminal(l, f, y, length, name);
         case SHINKANSEN -> shinkansen(l, f, y, length, name);
      }
   }

   public static String defaultName(int x, int z) {
      return NAMES[Math.floorMod(x * 31 + z * 17, NAMES.length)];
   }

   public static String randomName(java.util.Random rng) {
      return NAMES[rng.nextInt(NAMES.length)];
   }

   /** Local coordinates: {@code i} along the track, {@code s} across it, positive s towards the station building. */
   private record Frame(int x, int z, Axis axis, int side) {
      int wx(int i, int s) {
         return axis == Axis.X ? x + i : x + s * side;
      }

      int wz(int i, int s) {
         return axis == Axis.X ? z + s * side : z + i;
      }

      void set(BlockCanvas l, int i, int y, int s, BlockState st) {
         l.set(wx(i, s), y, wz(i, s), st);
      }

      void fill(BlockCanvas l, int i1, int y1, int s1, int i2, int y2, int s2, BlockState st) {
         for (int i = Math.min(i1, i2); i <= Math.max(i1, i2); i++) {
            for (int s = Math.min(s1, s2); s <= Math.max(s1, s2); s++) {
               for (int y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
                  set(l, i, y, s, st);
               }
            }
         }
      }

      /** Horizontal direction pointing towards +s (local) in world space. */
      Direction across(int sign) {
         int k = sign * side;
         if (axis == Axis.X) {
            return k > 0 ? Direction.SOUTH : Direction.NORTH;
         }
         return k > 0 ? Direction.EAST : Direction.WEST;
      }

      Direction along(int sign) {
         if (axis == Axis.X) {
            return sign > 0 ? Direction.EAST : Direction.WEST;
         }
         return sign > 0 ? Direction.SOUTH : Direction.NORTH;
      }

      BlockState rail() {
         return Blocks.RAIL.defaultBlockState().setValue(RailBlock.SHAPE, axis == Axis.X ? RailShape.EAST_WEST : RailShape.NORTH_SOUTH);
      }

      BlockState powered() {
         return Blocks.POWERED_RAIL.defaultBlockState()
            .setValue(PoweredRailBlock.SHAPE, axis == Axis.X ? RailShape.EAST_WEST : RailShape.NORTH_SOUTH)
            .setValue(BlockStateProperties.POWERED, true);
      }

      void sign(BlockCanvas l, int i, int y, int s, Block sign, Direction facing, Component... lines) {
         BuildUtil.wallSign(l, wx(i, s), y, wz(i, s), sign, facing, lines);
      }
   }

   /** One track at offset {@code s}: ballast, sleepers, a powered rail every 8 blocks over a redstone block. */
   private static void track(BlockCanvas l, Frame f, int y, int length, int s, boolean bumpers) {
      for (int i = 0; i < length; i++) {
         f.set(l, i, y - 1, s, Blocks.GRAVEL.defaultBlockState());
         BuildUtil.foundation(l, f.wx(i, s), y - 2, f.wz(i, s), Blocks.STONE.defaultBlockState());
         boolean end = bumpers && (i == 0 || i == length - 1);
         boolean power = i % 8 == 0;
         f.set(l, i, y, s, power ? Blocks.REDSTONE_BLOCK.defaultBlockState() : Blocks.DARK_OAK_LOG.defaultBlockState());
         f.set(l, i, y + 1, s, end ? Blocks.RED_CONCRETE.defaultBlockState() : power ? f.powered() : f.rail());
         f.set(l, i, y + 2, s, BuildUtil.air());
         f.set(l, i, y + 3, s, BuildUtil.air());
      }
   }

   /** Platform from s1 to s2 (inclusive) with its surface at y+1, edge strip and tactile paving next to the track. */
   private static void platform(BlockCanvas l, Frame f, int y, int length, int s1, int s2, int trackSide) {
      int edge = trackSide < 0 ? Math.min(s1, s2) : Math.max(s1, s2);
      for (int i = 0; i < length; i++) {
         for (int s = Math.min(s1, s2); s <= Math.max(s1, s2); s++) {
            f.set(l, i, y, s, Blocks.STONE_BRICKS.defaultBlockState());
            BuildUtil.foundation(l, f.wx(i, s), y - 1, f.wz(i, s), Blocks.STONE.defaultBlockState());
            BlockState top;
            if (s == edge) {
               top = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
            } else if (s == edge - trackSide) {
               top = Blocks.YELLOW_CONCRETE.defaultBlockState();
            } else {
               top = Blocks.POLISHED_ANDESITE.defaultBlockState();
            }
            f.set(l, i, y + 1, s, top);
            f.fill(l, i, y + 2, s, i, y + 4, s, BuildUtil.air());
         }
      }
   }

   private static void local(BlockCanvas l, Frame f, int y, int length, String name) {
      BlockState wall = Blocks.WHITE_TERRACOTTA.defaultBlockState();
      BlockState beam = Blocks.STRIPPED_DARK_OAK_LOG.defaultBlockState();
      BlockState roofTile = Blocks.DEEPSLATE_TILES.defaultBlockState();
      BlockState window = Blocks.GLASS_PANE.defaultBlockState();
      BlockState floor = Blocks.POLISHED_ANDESITE.defaultBlockState();

      track(l, f, y, length, 0, false);
      platform(l, f, y, length, 1, 4, -1);
      platform(l, f, y, length, -1, -4, 1);

      for (int i = 0; i < length; i++) {
         // Railings along the outer platform edges.
         f.set(l, i, y + 2, 5, Blocks.IRON_BARS.defaultBlockState());
         f.set(l, i, y + 2, -5, Blocks.IRON_BARS.defaultBlockState());
         f.set(l, i, y + 1, 5, Blocks.STONE_BRICKS.defaultBlockState());
         f.set(l, i, y + 1, -5, Blocks.STONE_BRICKS.defaultBlockState());

         if (i < 2 || i >= length - 2) {
            continue;
         }

         // Canopies over both platforms.
         for (int s = 1; s <= 4; s++) {
            f.set(l, i, y + 6, s, roofTile);
            f.set(l, i, y + 6, -s, roofTile);
         }

         if (i % 6 == 3) {
            f.fill(l, i, y + 2, 3, i, y + 5, 3, beam);
            f.fill(l, i, y + 2, -3, i, y + 5, -3, beam);
            f.set(l, i, y + 5, 2, BuildUtil.hangingLantern(Blocks.LANTERN));
            f.set(l, i, y + 5, -2, BuildUtil.hangingLantern(Blocks.LANTERN));
         }

         if (i % 6 == 0) {
            // Benches facing the track.
            f.set(l, i, y + 2, 4, BuildUtil.stairs(Blocks.DARK_OAK_STAIRS, f.across(1)));
            f.set(l, i, y + 2, -4, BuildUtil.stairs(Blocks.DARK_OAK_STAIRS, f.across(-1)));
         }

         if (i % 12 == 9) {
            // Station name boards (eki-meihyo) on the canopy pillars, facing the track.
            f.sign(l, i, y + 4, 2, Blocks.BIRCH_WALL_SIGN, f.across(-1), nameLines(name));
            f.sign(l, i, y + 4, -2, Blocks.BIRCH_WALL_SIGN, f.across(1), nameLines(name));
         }
      }

      // Station building beside the platform, with ticket gates leading onto it.
      int mid = length / 2;
      int b1 = Math.max(2, mid - 6);
      int b2 = Math.min(length - 3, mid + 6);
      for (int i = b1; i <= b2; i++) {
         for (int s = 5; s <= 11; s++) {
            BuildUtil.foundation(l, f.wx(i, s), y, f.wz(i, s), Blocks.STONE.defaultBlockState());
            f.set(l, i, y + 1, s, floor);
            boolean edge = i == b1 || i == b2 || s == 5 || s == 11;
            for (int h = 2; h <= 5; h++) {
               BlockState st = BuildUtil.air();
               if (edge) {
                  st = h == 5 ? beam : (h == 3 && (i + s) % 2 == 0 && s != 5 ? window : wall);
               }
               f.set(l, i, y + h, s, st);
            }
            f.set(l, i, y + 6, s, roofTile);
         }
      }
      for (int k = 0; k <= 2; k++) {
         int ri = b1 - 1 + k;
         int ri2 = b2 + 1 - k;
         for (int s = 4 + k; s <= 12 - k; s++) {
            f.set(l, ri, y + 6 + k, s, roofTile);
            f.set(l, ri2, y + 6 + k, s, roofTile);
         }
         f.fill(l, b1 + k, y + 7 + k, 4 + k, b2 - k, y + 7 + k, 12 - k, roofTile);
      }

      // Opening onto the platform with a row of ticket gates.
      for (int i = mid - 2; i <= mid + 2; i++) {
         f.fill(l, i, y + 2, 5, i, y + 3, 5, BuildUtil.air());
         f.set(l, i, y + 2, 7, (i - mid) % 2 == 0 ? Blocks.LIGHT_WEIGHTED_PRESSURE_PLATE.defaultBlockState() : Blocks.IRON_BLOCK.defaultBlockState());
      }
      f.set(l, mid - 3, y + 2, 7, Blocks.IRON_BLOCK.defaultBlockState());
      f.set(l, mid + 3, y + 2, 7, Blocks.IRON_BLOCK.defaultBlockState());
      f.set(l, mid + 4, y + 2, 9, Blocks.BARREL.defaultBlockState());
      f.set(l, mid - 4, y + 2, 9, Blocks.SMOOTH_STONE_SLAB.defaultBlockState());
      f.set(l, mid, y + 5, 8, BuildUtil.hangingLantern(Blocks.LANTERN));

      // Front entrance and name board.
      f.fill(l, mid - 1, y + 2, 11, mid + 1, y + 3, 11, BuildUtil.air());
      f.set(l, mid, y + 1, 12, floor);
      f.set(l, mid - 1, y + 1, 12, floor);
      f.set(l, mid + 1, y + 1, 12, floor);
      f.sign(l, mid, y + 4, 12, Blocks.DARK_OAK_WALL_SIGN, f.across(1), nameLines(name));
   }

   private static void terminal(BlockCanvas l, Frame f, int y, int length, String name) {
      BlockState wall = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState roofBeam = Blocks.IRON_BLOCK.defaultBlockState();
      BlockState roofGlass = Blocks.GLASS.defaultBlockState();
      BlockState lamp = Blocks.SEA_LANTERN.defaultBlockState();
      BlockState floor = Blocks.POLISHED_ANDESITE.defaultBlockState();

      for (int i = 0; i < length; i++) {
         for (int s = -10; s <= 10; s++) {
            f.fill(l, i, y + 2, s, i, y + 13, s, BuildUtil.air());
         }
         for (int h = 0; h <= 10; h++) {
            f.set(l, i, y + h, -10, wall);
            f.set(l, i, y + h, 10, wall);
         }
         // Concourse walkways along the walls.
         f.set(l, i, y + 1, 9, floor);
         f.set(l, i, y + 1, -9, floor);
         f.set(l, i, y, 9, Blocks.STONE_BRICKS.defaultBlockState());
         f.set(l, i, y, -9, Blocks.STONE_BRICKS.defaultBlockState());

         for (int s = -10; s <= 10; s++) {
            int arch = 10 - (int) Math.round(10.0 * Math.cos(Math.PI * s / 20.0));
            int ry = y + 14 - arch / 2;
            BlockState rb = Math.abs(s) != 10 && s % 4 != 0 && i % 6 != 0 ? roofGlass : roofBeam;
            f.set(l, i, ry, s, rb);
         }

         if (i % 6 == 3) {
            for (int s : new int[]{-6, -2, 2, 6}) {
               f.set(l, i, y + 7, s, lamp);
            }
         }
      }

      // Through line in the middle, terminating sidings either side.
      track(l, f, y, length, 0, false);
      for (int s : new int[]{-8, -4, 4, 8}) {
         track(l, f, y, length, s, true);
      }
      platform(l, f, y, length, 1, 3, -1);
      platform(l, f, y, length, -1, -3, 1);
      for (int i = 0; i < length; i++) {
         for (int s : new int[]{5, 6, 7, -5, -6, -7}) {
            f.set(l, i, y, s, Blocks.STONE_BRICKS.defaultBlockState());
            BuildUtil.foundation(l, f.wx(i, s), y - 1, f.wz(i, s), Blocks.STONE.defaultBlockState());
            f.set(l, i, y + 1, s, Math.abs(s) == 6 ? floor : Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState());
         }
         if (i % 12 == 6 && i > 3 && i < length - 3) {
            int[] boards = {6, 2, -2, -6};
            for (int k = 0; k < boards.length; k++) {
               int s = boards[k];
               f.set(l, i, y + 2, s, Blocks.IRON_BARS.defaultBlockState());
               f.set(l, i, y + 3, s, Blocks.IRON_BARS.defaultBlockState());
               f.set(l, i, y + 4, s, Blocks.SPRUCE_PLANKS.defaultBlockState());
               // Two tracks share each island platform; number them like a real terminal.
               f.sign(l, i + 1, y + 4, s, Blocks.BIRCH_WALL_SIGN, f.along(1),
                  Component.literal(name + "駅"),
                  Component.translatable("citybuilder.sign.platform", 2 * k + 1, 2 * k + 2));
            }
         }
      }

      // Main entrance through the station-side wall.
      int mid = length / 2;
      for (int i = mid - 2; i <= mid + 2; i++) {
         f.fill(l, i, y + 2, 10, i, y + 5, 10, BuildUtil.air());
         f.set(l, i, y + 1, 10, floor);
         f.set(l, i, y + 1, 11, floor);
      }
      f.fill(l, mid - 3, y + 6, 10, mid + 3, y + 6, 11, Blocks.POLISHED_ANDESITE.defaultBlockState());
      f.sign(l, mid, y + 7, 11, Blocks.DARK_OAK_WALL_SIGN, f.across(1), nameLines(name));
   }

   private static void shinkansen(BlockCanvas l, Frame f, int y, int length, String name) {
      BlockState concrete = Blocks.WHITE_CONCRETE.defaultBlockState();
      BlockState edgeC = Blocks.LIGHT_GRAY_CONCRETE.defaultBlockState();
      BlockState pier = Blocks.SMOOTH_STONE.defaultBlockState();
      BlockState floor = Blocks.POLISHED_DIORITE.defaultBlockState();
      BlockState wall = Blocks.LIGHT_BLUE_STAINED_GLASS.defaultBlockState();
      BlockState roofBeam = Blocks.IRON_BLOCK.defaultBlockState();
      BlockState lamp = Blocks.SEA_LANTERN.defaultBlockState();
      int deckY = y + 8;

      for (int i = 0; i < length; i++) {
         if (i % 12 == 0 || i == length - 1) {
            for (int s = -5; s <= 5; s += 5) {
               for (int dy = 0; dy < 8; dy++) {
                  f.set(l, i, y + dy, s, pier);
               }
               BuildUtil.foundation(l, f.wx(i, s), y - 1, f.wz(i, s), pier);
            }
         }

         for (int s = -6; s <= 6; s++) {
            f.set(l, i, deckY, s, Math.abs(s) == 6 ? edgeC : concrete);
            f.fill(l, i, deckY + 3, s, i, deckY + 6, s, BuildUtil.air());
         }

         // Through track.
         boolean power = i % 6 == 0;
         f.set(l, i, deckY + 1, 0, power ? Blocks.REDSTONE_BLOCK.defaultBlockState() : Blocks.DEEPSLATE_TILES.defaultBlockState());
         f.set(l, i, deckY + 2, 0, power ? f.powered() : f.rail());

         // Platforms with tactile paving and platform screen doors that open every six blocks.
         for (int s = 1; s <= 5; s++) {
            for (int sg : new int[]{-1, 1}) {
               f.set(l, i, deckY + 1, s * sg, concrete);
               BlockState top = s == 1 ? edgeC : s == 2 ? Blocks.YELLOW_CONCRETE.defaultBlockState() : floor;
               f.set(l, i, deckY + 2, s * sg, top);
            }
         }
         boolean doorGap = i % 6 == 2 || i % 6 == 3;
         for (int sg : new int[]{-1, 1}) {
            f.set(l, i, deckY + 3, sg, doorGap ? BuildUtil.air() : Blocks.GLASS_PANE.defaultBlockState());
            f.set(l, i, deckY + 3, 6 * sg, wall);
            f.set(l, i, deckY + 4, 6 * sg, wall);
            f.set(l, i, deckY + 2, 6 * sg, concrete);
         }

         if (i % 4 == 0) {
            for (int s = -6; s <= 6; s++) {
               f.set(l, i, deckY + 7, s, roofBeam);
            }
         } else {
            f.set(l, i, deckY + 7, -6, roofBeam);
            f.set(l, i, deckY + 7, 6, roofBeam);
            for (int s = -5; s <= 5; s++) {
               f.set(l, i, deckY + 7, s, Blocks.WHITE_STAINED_GLASS.defaultBlockState());
            }
         }

         if (i % 5 == 0) {
            f.set(l, i, deckY + 6, 4, lamp);
            f.set(l, i, deckY + 6, -4, lamp);
         }

         if (i % 16 == 8) {
            f.fill(l, i, deckY + 3, 4, i, deckY + 4, 4, Blocks.IRON_BARS.defaultBlockState());
            f.set(l, i, deckY + 5, 4, Blocks.QUARTZ_BLOCK.defaultBlockState());
            f.sign(l, i, deckY + 5, 3, Blocks.BIRCH_WALL_SIGN, f.across(-1), nameLines(name));
         }
      }

      // Ground-level entrance hall under the deck, linked to the platform by an elevator.
      int mid = length / 2;
      for (int i = mid - 3; i <= mid + 3; i++) {
         for (int s = 3; s <= 7; s++) {
            f.set(l, i, y, s, floor);
            BuildUtil.foundation(l, f.wx(i, s), y - 1, f.wz(i, s), Blocks.STONE.defaultBlockState());
            for (int h = 1; h <= 3; h++) {
               boolean edge = i == mid - 3 || i == mid + 3 || s == 3 || s == 7;
               f.set(l, i, y + h, s, edge && h < 3 && s != 7 ? wall : BuildUtil.air());
            }
            f.set(l, i, y + 4, s, concrete);
         }
      }
      f.set(l, mid, y, 5, Facilities.elevator());
      f.set(l, mid, deckY + 2, 5, Facilities.elevator());
      f.fill(l, mid, deckY + 3, 5, mid, deckY + 4, 5, BuildUtil.air());
      f.set(l, mid, y + 4, 5, concrete);
      f.set(l, mid + 1, y + 3, 7, Blocks.QUARTZ_BLOCK.defaultBlockState());
      f.sign(l, mid + 1, y + 3, 8, Blocks.BIRCH_WALL_SIGN, f.across(1), nameLines(name));
      f.sign(l, mid - 1, y + 2, 4, Blocks.BIRCH_WALL_SIGN, f.across(1),
         Component.translatable("citybuilder.sign.elevator"), Component.translatable("citybuilder.sign.elevator_up"),
         Component.translatable("citybuilder.sign.elevator_down"));
   }

   private static Component[] nameLines(String name) {
      return new Component[]{
         Component.empty(),
         Component.literal(name + "駅"),
         Component.translatable("citybuilder.sign.station")
      };
   }

   public static enum Axis {
      X,
      Z;
   }

   public static enum Type {
      LOCAL,
      TERMINAL,
      SHINKANSEN;
   }
}

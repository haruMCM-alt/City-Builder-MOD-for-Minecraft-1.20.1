package com.example.citybuilder.builders;

import com.example.citybuilder.engine.BlockCanvas;
import com.example.citybuilder.items.CarItem;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.function.Consumer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.vehicle.Minecart;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.RailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.RailShape;

/**
 * Plans a whole city as a list of steps for the build queue.
 *
 * <p>Layout along each axis: road, lot, road, lot, ..., road. Every road gets the width its type
 * really needs, so wide avenues no longer spill into the lots. The outermost roads form a ring
 * with a car track on it, and a railway loop with stations runs round the outside.
 */
public final class CityBuilder {
   static final int LOT = 24;
   private static final int RAIL_MARGIN = 13;
   private static final int CLEAR_HEIGHT = 64;

   private CityBuilder() {
   }

   /** Road layout along one axis. */
   private record Lines(RoadBuilder.Type[] types, int[] start, int[] width, int[] lotStart, int total) {
      int center(int r) {
         return start[r] + width[r] / 2;
      }

      static Lines of(RoadBuilder.Type[] types) {
         int n = types.length;
         int[] start = new int[n];
         int[] width = new int[n];
         int[] lots = new int[n - 1];
         int cursor = 0;
         for (int r = 0; r < n; r++) {
            start[r] = cursor;
            width[r] = 2 * RoadBuilder.halfWidth(types[r]) + 1;
            cursor += width[r];
            if (r < n - 1) {
               lots[r] = cursor;
               cursor += LOT;
            }
         }
         return new Lines(types, start, width, lots, cursor);
      }
   }

   public static List<Consumer<BlockCanvas>> plan(CityBuilder.Preset p, int x, int y, int z, int gridN, long seed) {
      int grid = Math.max(2, Math.min(8, gridN));
      Random rng = new Random(seed);
      Lines rows = Lines.of(roadTypes(p, grid, rng));
      Lines cols = Lines.of(roadTypes(p, grid, rng));
      int sizeX = cols.total();
      int sizeZ = rows.total();
      List<Consumer<BlockCanvas>> steps = new ArrayList<>();

      // 1. Level the site (including the ring for the railway), one chunk column per step.
      int gx1 = x - RAIL_MARGIN - 7;
      int gz1 = z - RAIL_MARGIN - 13;
      int gx2 = x + sizeX + RAIL_MARGIN + 7;
      int gz2 = z + sizeZ + RAIL_MARGIN + 13;
      for (int cx = gx1 >> 4; cx <= gx2 >> 4; cx++) {
         for (int cz = gz1 >> 4; cz <= gz2 >> 4; cz++) {
            int ax1 = Math.max(gx1, cx << 4);
            int ax2 = Math.min(gx2, (cx << 4) + 15);
            int az1 = Math.max(gz1, cz << 4);
            int az2 = Math.min(gz2, (cz << 4) + 15);
            steps.add(l -> prepareGround(l, ax1, y, az1, ax2, az2));
         }
      }

      // 2. Roads, with quiet zones where they cross so medians and trees never block a junction.
      for (int r = 0; r < rows.types().length; r++) {
         int rr = r;
         steps.add(l -> RoadBuilder.build(l, rows.types()[rr], x, y, z + rows.center(rr), sizeX, RoadBuilder.Axis.X,
               i -> crossesAt(cols, i)));
      }
      for (int c = 0; c < cols.types().length; c++) {
         int cc = c;
         steps.add(l -> RoadBuilder.build(l, cols.types()[cc], x + cols.center(cc), y, z, sizeZ, RoadBuilder.Axis.Z,
               i -> crossesAt(rows, i)));
      }

      // 3. Intersections: crossings, traffic lights, a scramble crossing in Shibuya.
      steps.add(l -> {
         int main = grid / 2;
         for (int r = 0; r < rows.types().length; r++) {
            for (int c = 0; c < cols.types().length; c++) {
               RoadBuilder.Type a = rows.types()[r];
               RoadBuilder.Type b = cols.types()[c];
               boolean arcade = a == RoadBuilder.Type.SHOTENGAI || b == RoadBuilder.Type.SHOTENGAI;
               boolean lights = RoadBuilder.hasTraffic(a) && RoadBuilder.hasTraffic(b);
               boolean scramble = p == Preset.SHIBUYA && r == main && c == main;
               RoadBuilder.intersection(l, x + cols.start()[c], y, z + rows.start()[r],
                     x + cols.start()[c] + cols.width()[c] - 1, z + rows.start()[r] + rows.width()[r] - 1,
                     scramble, lights, arcade);
            }
         }
      });

      // 4. Buildings, one lot per step.
      for (int gx = 0; gx < grid; gx++) {
         for (int gz = 0; gz < grid; gz++) {
            int lotX = x + cols.lotStart()[gx];
            int lotZ = z + rows.lotStart()[gz];
            long lotSeed = rng.nextLong();
            int fgx = gx;
            int fgz = gz;
            steps.add(l -> placeLot(l, p, new Random(lotSeed), lotX, y, lotZ, fgx, fgz, grid));
         }
      }

      // 5. Railway loop round the city, with a station on the north and south sides.
      int rx1 = x - RAIL_MARGIN;
      int rz1 = z - RAIL_MARGIN;
      int rx2 = x + sizeX - 1 + RAIL_MARGIN;
      int rz2 = z + sizeZ - 1 + RAIL_MARGIN;
      steps.add(l -> RailBuilder.buildLoop(l, RailBuilder.Type.STANDARD, rx1, y, rz1, rx2, rz2));
      StationBuilder.Type stationType = switch (p) {
         case DOWNTOWN, SHIBUYA -> StationBuilder.Type.TERMINAL;
         default -> StationBuilder.Type.LOCAL;
      };
      int stationLen = Math.max(30, Math.min(80, sizeX / 3));
      int stationX = rx1 + (rx2 - rx1) / 2 - stationLen / 2;
      String northName = StationBuilder.randomName(rng);
      String southName = StationBuilder.randomName(rng);
      // A terminal is twice as wide as the margin, so it gets the outside of the loop; local stations face the city.
      int northSide = stationType == StationBuilder.Type.TERMINAL ? -1 : 1;
      steps.add(l -> StationBuilder.build(l, stationType, stationX, y, rz1, stationLen, StationBuilder.Axis.X, northSide, northName));
      steps.add(l -> StationBuilder.build(l, stationType, stationX, y, rz2, stationLen, StationBuilder.Axis.X, -northSide, southName));
      steps.add(l -> spawnTrains(l, rx1, y, rz1, rx2, rz2, stationX, stationLen, rng.nextLong()));

      // 6. A car track round the ring road and cars driving on it.
      steps.add(l -> carLoop(l, x + cols.center(0), y, z + rows.center(0),
            x + cols.center(grid), z + rows.center(grid), grid, seed));
      return steps;
   }

   /** Size of a city along X and Z (without the railway ring), for previews and messages. */
   public static int[] size(CityBuilder.Preset p, int gridN, long seed) {
      int grid = Math.max(2, Math.min(8, gridN));
      Random rng = new Random(seed);
      Lines rows = Lines.of(roadTypes(p, grid, rng));
      Lines cols = Lines.of(roadTypes(p, grid, rng));
      return new int[]{cols.total() + 2 * RAIL_MARGIN, rows.total() + 2 * RAIL_MARGIN};
   }

   private static boolean crossesAt(Lines other, int i) {
      for (int r = 0; r < other.types().length; r++) {
         if (i >= other.start()[r] && i < other.start()[r] + other.width()[r]) {
            return true;
         }
      }
      return false;
   }

   private static RoadBuilder.Type[] roadTypes(CityBuilder.Preset p, int grid, Random rng) {
      RoadBuilder.Type[] t = new RoadBuilder.Type[grid + 1];
      for (int r = 0; r <= grid; r++) {
         if (r == 0 || r == grid) {
            t[r] = RoadBuilder.Type.LOCAL;
         } else if (r == grid / 2) {
            t[r] = mainRoad(p);
         } else {
            t[r] = sideRoad(p, rng);
         }
      }
      return t;
   }

   private static void prepareGround(BlockCanvas l, int x1, int y, int z1, int x2, int z2) {
      BlockState grass = Blocks.GRASS_BLOCK.defaultBlockState();
      BlockState dirt = Blocks.DIRT.defaultBlockState();
      for (int x = x1; x <= x2; x++) {
         for (int z = z1; z <= z2; z++) {
            l.set(x, y, z, grass);
            BuildUtil.foundation(l, x, y - 1, z, dirt);
            for (int yy = y + 1; yy <= y + CLEAR_HEIGHT; yy++) {
               if (!l.get(x, yy, z).isAir()) {
                  l.set(x, yy, z, BuildUtil.air());
               }
            }
         }
      }
   }

   private static RoadBuilder.Type mainRoad(CityBuilder.Preset p) {
      return switch (p) {
         case DOWNTOWN, SHIBUYA -> RoadBuilder.Type.HIGHWAY;
         case SHITAMACHI -> RoadBuilder.Type.SHOTENGAI;
         case RESIDENTIAL, MIXED -> RoadBuilder.Type.JAPANESE;
      };
   }

   private static RoadBuilder.Type sideRoad(CityBuilder.Preset p, Random rng) {
      return switch (p) {
         case DOWNTOWN -> rng.nextInt(3) == 0 ? RoadBuilder.Type.PEDESTRIAN : RoadBuilder.Type.LOCAL;
         case SHIBUYA -> rng.nextInt(2) == 0 ? RoadBuilder.Type.PEDESTRIAN : RoadBuilder.Type.LOCAL;
         case SHITAMACHI -> rng.nextInt(3) == 0 ? RoadBuilder.Type.SHOTENGAI : RoadBuilder.Type.PEDESTRIAN;
         case RESIDENTIAL -> RoadBuilder.Type.LOCAL;
         case MIXED -> switch (rng.nextInt(4)) {
            case 0 -> RoadBuilder.Type.PEDESTRIAN;
            case 1 -> RoadBuilder.Type.SHOTENGAI;
            default -> RoadBuilder.Type.LOCAL;
         };
      };
   }

   private static void placeLot(BlockCanvas l, CityBuilder.Preset p, Random rng, int lotX, int y, int lotZ, int gx, int gz, int gridN) {
      int dist = Math.max(Math.abs(gx - gridN / 2), Math.abs(gz - gridN / 2));
      boolean isCore = dist <= 1;
      boolean center = gx == gridN / 2 && gz == gridN / 2;
      if (center && gridN >= 3 && p != Preset.DOWNTOWN && p != Preset.SHIBUYA) {
         base(l, BaseBuilder.Type.PARK, lotX, y, lotZ, LOT);
         return;
      }
      if (gx == 0 && gz == gridN - 1 && gridN >= 3) {
         // Corner lot: a police box with a small park behind it.
         BaseBuilder.build(l, BaseBuilder.Type.KOBAN, lotX + 3, y, lotZ + 2, 8);
         BaseBuilder.build(l, BaseBuilder.Type.PARK, lotX + 2, y, lotZ + 11, 12);
         return;
      }

      switch (p) {
         case DOWNTOWN -> {
            SkyscraperBuilder.Type t = pickSky(rng, isCore ? 0 : 1);
            int f = isCore ? 20 + rng.nextInt(25) : 10 + rng.nextInt(10);
            sky(l, t, lotX, y, lotZ, 16 + rng.nextInt(5), 16 + rng.nextInt(5), f, 4 + rng.nextInt(2));
         }
         case SHIBUYA -> {
            int r = rng.nextInt(10);
            if (r < 2 && isCore) {
               base(l, BaseBuilder.Type.SHIBUYA109, lotX, y, lotZ, 18);
            } else if (r < 4) {
               base(l, BaseBuilder.Type.DEPARTMENT, lotX, y, lotZ, 20);
            } else if (r < 7) {
               base(l, BaseBuilder.Type.ZAKKYO, lotX, y, lotZ, 14 + rng.nextInt(7));
            } else {
               sky(l, pickSky(rng, 0), lotX, y, lotZ, 18, 18, isCore ? 18 + rng.nextInt(20) : 12, 5);
            }
         }
         case SHITAMACHI -> {
            int r = rng.nextInt(13);
            BaseBuilder.Type t;
            if (r == 0) {
               t = BaseBuilder.Type.SENTO;
            } else if (r == 1) {
               t = BaseBuilder.Type.SHRINE;
            } else if (r == 2) {
               t = BaseBuilder.Type.TEMPLE;
            } else if (r <= 4) {
               t = BaseBuilder.Type.KONBINI;
            } else if (r <= 6) {
               t = BaseBuilder.Type.CAFE;
            } else if (r <= 8) {
               t = BaseBuilder.Type.ZAKKYO;
            } else if (r == 9) {
               t = BaseBuilder.Type.DOJO;
            } else {
               t = BaseBuilder.Type.HOUSE;
            }
            if (t == BaseBuilder.Type.HOUSE) {
               fourHouses(l, lotX, y, lotZ);
            } else {
               base(l, t, lotX, y, lotZ, t == BaseBuilder.Type.SHRINE || t == BaseBuilder.Type.TEMPLE ? 18 : 16);
            }
         }
         case RESIDENTIAL -> {
            int r = rng.nextInt(12);
            if (r == 0) {
               base(l, BaseBuilder.Type.MANSION, lotX, y, lotZ, 18);
            } else if (r == 1) {
               base(l, BaseBuilder.Type.HOTSPRING, lotX, y, lotZ, 16);
            } else if (r == 2) {
               base(l, BaseBuilder.Type.SCHOOL, lotX, y, lotZ, 20);
            } else if (r <= 4) {
               base(l, BaseBuilder.Type.CAFE, lotX, y, lotZ, 14);
            } else if (r == 5) {
               base(l, BaseBuilder.Type.KONBINI, lotX, y, lotZ, 14);
            } else if (r == 6 && isCore) {
               sky(l, SkyscraperBuilder.Type.RESIDENTIAL, lotX, y, lotZ, 16, 16, 12 + rng.nextInt(10), 4);
            } else {
               fourHouses(l, lotX, y, lotZ);
            }
         }
         case MIXED -> {
            int r = rng.nextInt(20);
            if (r < 4 && isCore) {
               sky(l, pickSky(rng, 0), lotX, y, lotZ, 18, 18, 15 + rng.nextInt(20), 5);
            } else {
               BaseBuilder.Type[] all = BaseBuilder.Type.values();
               BaseBuilder.Type t = all[rng.nextInt(all.length)];
               if (t == BaseBuilder.Type.HOUSE) {
                  fourHouses(l, lotX, y, lotZ);
               } else {
                  base(l, t, lotX, y, lotZ, 14 + rng.nextInt(5));
               }
            }
         }
      }
   }

   /** A lot split into four small house plots. */
   private static void fourHouses(BlockCanvas l, int lotX, int y, int lotZ) {
      for (int dx = 0; dx < 2; dx++) {
         for (int dz = 0; dz < 2; dz++) {
            BaseBuilder.build(l, BaseBuilder.Type.HOUSE, lotX + 2 + dx * 11, y, lotZ + 2 + dz * 11, 9);
         }
      }
   }

   /**
    * Places a building on a lot, shifted so that features which stick out in front of the
    * footprint (torii gates, porches, the changing house of the onsen) stay inside the lot.
    */
   private static void base(BlockCanvas l, BaseBuilder.Type t, int lotX, int y, int lotZ, int size) {
      int front = switch (t) {
         case SHRINE, TEMPLE -> 9;
         case HOTSPRING -> 6;
         case MANSION, DEPARTMENT, CAFE, KONBINI, SENTO -> 3;
         default -> 2;
      };
      int maxSize = Math.min(size, LOT - front - 2);
      if (t == BaseBuilder.Type.SHIBUYA109) {
         maxSize = Math.min(size, 18);
      }
      int off = Math.max(2, (LOT - maxSize) / 2);
      BaseBuilder.build(l, t, lotX + off, y, lotZ + Math.max(front, off), maxSize);
   }

   private static void sky(BlockCanvas l, SkyscraperBuilder.Type t, int lotX, int y, int lotZ, int w, int d, int floors, int fh) {
      // Podiums and balconies reach two blocks beyond the tower footprint.
      int width = Math.min(w, LOT - 6);
      int depth = Math.min(d, LOT - 6);
      SkyscraperBuilder.build(l, t, lotX + 3, y, lotZ + 3, width, depth, floors, fh);
   }

   private static SkyscraperBuilder.Type pickSky(Random rng, int bias) {
      SkyscraperBuilder.Type[] t = SkyscraperBuilder.Type.values();
      if (bias == 0) {
         return t[rng.nextInt(t.length)];
      } else {
         return rng.nextBoolean() ? SkyscraperBuilder.Type.RESIDENTIAL : SkyscraperBuilder.Type.HOTEL;
      }
   }

   /**
    * Lays a closed rail loop along the centre of the ring road (rails sit on the road surface,
    * powered every 8 blocks from a red "road stud" redstone block) and puts cars on it.
    */
   private static void carLoop(BlockCanvas l, int x1, int y, int z1, int x2, int z2, int grid, long seed) {
      List<int[]> path = new ArrayList<>();
      for (int x = x1; x < x2; x++) path.add(new int[]{x, z1});
      for (int z = z1; z < z2; z++) path.add(new int[]{x2, z});
      for (int x = x2; x > x1; x--) path.add(new int[]{x, z2});
      for (int z = z2; z > z1; z--) path.add(new int[]{x1, z});

      for (int k = 0; k < path.size(); k++) {
         int[] p = path.get(k);
         RailShape shape = shapeAt(p, x1, z1, x2, z2);
         boolean corner = shape.isAscending() || isCurve(shape);
         boolean power = !corner && k % 8 == 4;
         l.set(p[0], y, p[1], power ? Blocks.REDSTONE_BLOCK.defaultBlockState() : l.get(p[0], y, p[1]));
         BlockState rail = power
               ? Blocks.POWERED_RAIL.defaultBlockState().setValue(PoweredRailBlock.SHAPE, shape).setValue(BlockStateProperties.POWERED, true)
               : Blocks.RAIL.defaultBlockState().setValue(RailBlock.SHAPE, shape);
         l.set(p[0], y + 1, p[1], rail);
         l.set(p[0], y + 2, p[1], BuildUtil.air());
      }

      Random rng = new Random(seed ^ 0x5DEECE66DL);
      CarItem.Kind[] kinds = CarItem.Kind.values();
      int cars = Math.min(path.size() / 24, 3 + grid * 2);
      for (int c = 0; c < cars; c++) {
         int k = (int) ((long) c * path.size() / cars) + 2;
         int[] p = path.get(k % path.size());
         int[] next = path.get((k + 1) % path.size());
         CarItem.Kind kind = kinds[rng.nextInt(kinds.length)];
         double vx = Integer.signum(next[0] - p[0]) * 0.35;
         double vz = Integer.signum(next[1] - p[1]) * 0.35;
         l.spawnLater(level -> {
            Minecart cart = CarItem.createCar(level, kind, p[0] + 0.5, y + 1.0625, p[1] + 0.5);
            cart.setDeltaMovement(vx, 0, vz);
            return cart;
         });
      }
   }

   private static boolean isCurve(RailShape s) {
      return s == RailShape.SOUTH_EAST || s == RailShape.SOUTH_WEST || s == RailShape.NORTH_EAST || s == RailShape.NORTH_WEST;
   }

   private static RailShape shapeAt(int[] p, int x1, int z1, int x2, int z2) {
      int x = p[0];
      int z = p[1];
      if (x == x1 && z == z1) return RailShape.SOUTH_EAST;
      if (x == x2 && z == z1) return RailShape.SOUTH_WEST;
      if (x == x2 && z == z2) return RailShape.NORTH_WEST;
      if (x == x1 && z == z2) return RailShape.NORTH_EAST;
      return z == z1 || z == z2 ? RailShape.EAST_WEST : RailShape.NORTH_SOUTH;
   }

   /** A few trains (minecarts dressed as carriages) already running round the railway loop. */
   private static void spawnTrains(BlockCanvas l, int x1, int y, int z1, int x2, int z2, int stationX, int stationLen, long seed) {
      Random rng = new Random(seed);
      int perimeter = 2 * (x2 - x1) + 2 * (z2 - z1);
      int trains = Math.max(2, perimeter / 160);
      for (int t = 0; t < trains; t++) {
         // Spread trains along the north and south straights, away from the stations.
         boolean north = t % 2 == 0;
         int span = Math.max(1, x2 - x1 - 16);
         int start = x1 + 8 + rng.nextInt(span);
         if (start >= stationX - 2 && start <= stationX + stationLen + 2) {
            start = stationX + stationLen + 4 < x2 - 6 ? stationX + stationLen + 4 : x1 + 6;
         }
         int zRow = north ? z1 : z2;
         double dir = north ? 0.4 : -0.4;
         for (int car = 0; car < 3; car++) {
            int px = start + (north ? -car * 2 : car * 2);
            Component name = Component.translatable(car == 0 ? "entity.citybuilder.train_head" : "entity.citybuilder.train_car");
            l.spawnLater(level -> {
               Minecart cart = new Minecart(EntityType.MINECART, level);
               cart.setPos(px + 0.5, y + 1.0625, zRow + 0.5);
               cart.setDisplayBlockState(Blocks.WHITE_CONCRETE.defaultBlockState());
               cart.setDisplayOffset(6);
               cart.setCustomName(name);
               cart.setDeltaMovement(dir, 0, 0);
               return cart;
            });
         }
      }
   }

   public static enum Preset {
      DOWNTOWN,
      SHIBUYA,
      SHITAMACHI,
      RESIDENTIAL,
      MIXED;
   }
}
